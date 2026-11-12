import { Redis } from "@upstash/redis"
import { countLeadsForFlyer, getTrackingMonthStats, getTrackingRecord, listClientsWithDeliverables, listFlyerChannelCodes } from "@/lib/store"
import { isNopAgentAccount } from "@/lib/enterprise/agents-store"
import { getEmailPreferences } from "@/lib/email-preferences"
import { nextStatsMonth, statsMonth, statsMonthStart } from "@/lib/stats-month"
import { renderMonthlyResults, sendRendered, type MonthlyFlyerResult } from "@/lib/public-emails"
import type { Deliverables } from "@/lib/types"

/**
 * The monthly results email (Phase 4, hook 2): early each month, last month's
 * numbers for every flyer with a QR code, on every plan.
 *
 *   - Trial: scans only. Clicks and leads aren't read at all, matching what
 *     the trial dashboard is given (lib/tracking-breakdown.ts scansOnly).
 *   - Basic and Pro: scans, clicks and leads.
 *   - A month with no activity is reported as zero, never left out or padded.
 *
 * Never sent to enterprise org accounts, NOP agents or paused accounts, nor to
 * anyone who switched it off (email-prefs results) or has no flyer with a QR
 * code to report on.
 *
 * Runs from the daily public-emails cron. It sends only in the first
 * SEND_WINDOW_DAYS of a month (Eastern), once per account per month
 * (monthly-results:v1:sent:<month>:<email>), so a failed send is retried the
 * next day and an account created mid-month isn't sent a stale report.
 */

const redis = Redis.fromEnv()
const sentKey = (month: string, email: string) => `monthly-results:v1:sent:${month}:${email.trim().toLowerCase()}`
const SENT_TTL_SECONDS = 70 * 24 * 60 * 60
export const SEND_WINDOW_DAYS = 7
/** Rows listed in the email; the rest are counted and pointed at the dashboard. */
export const MONTHLY_LIST_LIMIT = 15

export interface MonthlyRun {
  live: boolean
  /** The month reported on, "YYYY-MM". */
  month: string
  /** False outside the first SEND_WINDOW_DAYS of the month: nothing is read or sent. */
  inWindow: boolean
  accounts: number
  sent: string[]
  wouldSend: { to: string; plan: string; flyers: number; scans: number }[]
  skipped: { to: string; why: string }[]
  failed: { to: string; reason: string }[]
}

/** The previous month, and whether `now` is early enough in this one to send. */
export function reportWindow(now: Date): { month: string; inWindow: boolean } {
  const current = statsMonth(now)
  const [y, m] = current.split("-").map(Number)
  const month = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`
  const day = Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", day: "numeric" }).format(now))
  return { month, inWindow: day <= SEND_WINDOW_DAYS }
}

/** One flyer's numbers for `month`, counting its own codes only (as buildFlyerBreakdown does). */
async function flyerMonth(owner: string, flyerId: string, title: string, originalCode: string, month: string, scansOnly: boolean): Promise<MonthlyFlyerResult | null> {
  const original = await getTrackingRecord(originalCode)
  if (!original || original.email !== owner) return null
  // Made after the month ended: nothing to report for it yet.
  if (Date.parse(original.createdAt) >= statsMonthStart(nextStatsMonth(month)).getTime()) return null
  const channelCodes = await listFlyerChannelCodes(flyerId)
  const codes = [originalCode, ...channelCodes.filter((c) => c !== originalCode)]
  let scans = 0
  let clicks = 0
  for (const code of codes) {
    const record = code === originalCode ? original : await getTrackingRecord(code)
    if (!record || record.email !== owner || record.flyerId !== flyerId) continue
    const stats = await getTrackingMonthStats(code, month)
    scans += stats.scans
    clicks += stats.clicks
  }
  if (scansOnly) return { title, scans }
  const [fromStart, fromEnd] = await Promise.all([
    countLeadsForFlyer(flyerId, statsMonthStart(month)),
    countLeadsForFlyer(flyerId, statsMonthStart(nextStatsMonth(month))),
  ])
  return { title, scans, clicks, leads: Math.max(0, fromStart.since - fromEnd.since) }
}

async function whyNot(to: string, d: Deliverables): Promise<string | null> {
  if (d.isEnterpriseAccount) return "enterprise account"
  if (await isNopAgentAccount(to).catch(() => true)) return "NOP agent account"
  if (d.pausedAt) return "account paused"
  if (!(await getEmailPreferences(to)).results) return "monthly results switched off"
  return null
}

export async function runMonthlyResults(opts: { live: boolean; now?: Date }): Promise<MonthlyRun> {
  const { month, inWindow } = reportWindow(opts.now ?? new Date())
  const run: MonthlyRun = { live: opts.live, month, inWindow, accounts: 0, sent: [], wouldSend: [], skipped: [], failed: [] }
  if (!inWindow) return run

  for (const d of await listClientsWithDeliverables()) {
    run.accounts++
    const to = d.email
    if (!to) continue
    if (await redis.get(sentKey(month, to)).catch(() => null)) continue
    const why = await whyNot(to, d)
    if (why) {
      run.skipped.push({ to, why })
      continue
    }
    const scansOnly = d.planId === "trial"
    const results = (
      await Promise.all(
        d.flyers
          .filter((f) => f.status === "Ready" && f.trackingCode)
          .map((f) => flyerMonth(to, f.id, f.title, f.trackingCode!, month, scansOnly).catch(() => null)),
      )
    ).filter((r): r is MonthlyFlyerResult => !!r)
    if (!results.length) {
      run.skipped.push({ to, why: "no flyer with a QR code to report on" })
      continue
    }
    const scans = results.reduce((n, r) => n + r.scans, 0)
    if (!opts.live) {
      run.wouldSend.push({ to, plan: d.planId, flyers: results.length, scans })
      continue
    }
    const result = await sendRendered(renderMonthlyResults({ to, month, scansOnly, flyers: results, listLimit: MONTHLY_LIST_LIMIT }))
    if (result.sent) {
      await redis.set(sentKey(month, to), new Date().toISOString(), { ex: SENT_TTL_SECONDS })
      run.sent.push(to)
    } else {
      run.failed.push({ to, reason: result.reason ?? "unknown" })
    }
  }
  return run
}
