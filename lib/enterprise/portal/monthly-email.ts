import { Redis } from "@upstash/redis"
import { listRoster } from "@/lib/enterprise/agents-store"
import { getAgentProfile } from "@/lib/store"
import { nextStatsMonth, statsMonth, statsMonthStart } from "@/lib/stats-month"
import { sendMonthlyResults } from "@/lib/email"
import { CANONICAL_SITE_URL } from "@/lib/site-url"
import { listAgentLeads } from "./agent-data"
import { agentResults } from "./results"
import { canUse } from "./features"
import { loadPortalContext } from "./context"
import { listRecruits } from "./recruiting"
import { isRsvp } from "./lead-tracker"

// The monthly results email (Phase 8). Once a month (Vercel cron, vercel.json,
// on the 1st), every active Pro/Leader agent whose org has it on, and who
// hasn't turned it off in their profile, gets last month's numbers in their
// language: QR scans, leads, RSVPs, and agents who signed up through their
// recruit link (only for features their org has on), with one link back to the
// portal. A month with nothing to report (every number 0) sends nothing.
// Months are Eastern, like every other count (stats-month.ts).
//
// Once per agent per month: the send is marked before it goes (SET NX), and the
// mark is released if it fails, so a rerun never sends twice.
//
//   nop-monthly-email:{YYYY-MM}:{agentId}    sent mark (kept 400 days)
//   nop-monthly-email-runs                   list, newest first, last 24 runs (counts only)

const redis = Redis.fromEnv()
const RUNS_KEY = "nop-monthly-email-runs"
const sentKey = (month: string, agentId: string) => `nop-monthly-email:${month}:${agentId}`

/** The month before the one `now` is in, Eastern: on 1 December, "2026-11". */
export function previousMonth(now: Date): string {
  return statsMonth(new Date(statsMonthStart(statsMonth(now)).getTime() - 1))
}

export interface MonthlyResults {
  scans: number
  /** Requests that came in, and leads contacted, given an appointment or enrolled that month (results.ts). */
  leads: number
  contacted: number
  appointments: number
  enrolled: number
  /** Null when the org has the feature off: the row isn't shown. */
  rsvps: number | null
  recruits: number | null
}

/** Last month's numbers: the same ones Home shows for the current month (agentResults), plus RSVPs and recruits. */
export async function monthlyResults(ctx: Awaited<ReturnType<typeof loadPortalContext>> & object, month: string): Promise<MonthlyResults> {
  const start = statsMonthStart(month).getTime()
  const end = statsMonthStart(nextStatsMonth(month)).getTime()
  const inMonth = (iso: string) => { const t = Date.parse(iso); return t >= start && t < end }
  const agentId = ctx.agent.agentId
  const [base, leads, recruits] = await Promise.all([
    agentResults(agentId, new Date(start), month),
    canUse(ctx, "events") ? listAgentLeads(agentId) : Promise.resolve(null),
    canUse(ctx, "recruiting") ? listRecruits(agentId) : Promise.resolve(null),
  ])
  return {
    scans: base.scans, leads: base.leads, contacted: base.contacted, appointments: base.appointments, enrolled: base.enrolled,
    rsvps: leads ? leads.filter((l) => isRsvp(l) && inMonth(l.createdAt)).length : null,
    recruits: recruits ? recruits.filter((r) => inMonth(r.signedUpAt)).length : null,
  }
}

export interface MonthlyRun {
  at: string
  month: string
  mode: "dry_run" | "live"
  by: string
  /** Agents who get it this month. */
  eligible: number
  sent: number
  /** Already sent this month (a rerun). */
  already: number
  /** Turned it off in their profile. */
  optedOut: number
  /** Nothing happened last month (every number 0): no email. */
  nothingToReport: number
  failed: number
}

export async function runMonthlyEmail(opts: { live: boolean; by: string; now?: Date }): Promise<MonthlyRun> {
  const now = opts.now ?? new Date()
  const month = previousMonth(now)
  const run: MonthlyRun = { at: now.toISOString(), month, mode: opts.live ? "live" : "dry_run", by: opts.by, eligible: 0, sent: 0, already: 0, optedOut: 0, nothingToReport: 0, failed: 0 }
  for (const r of await listRoster()) {
    if (r.status !== "active" || !r.lockedTo) continue
    const ctx = await loadPortalContext(r.lockedTo)
    if (!ctx || ctx.agent.agentId !== r.agentId || !canUse(ctx, "monthlyEmail")) continue
    if ((await getAgentProfile(r.lockedTo))?.monthlyEmail === false) { run.optedOut++; continue }
    const results = await monthlyResults(ctx, month)
    if (results.scans + results.leads + results.contacted + results.appointments + results.enrolled + (results.rsvps ?? 0) + (results.recruits ?? 0) === 0) { run.nothingToReport++; continue }
    run.eligible++
    if (!opts.live) continue
    if (!(await redis.set(sentKey(month, r.agentId), now.toISOString(), { nx: true, ex: 400 * 86400 }))) { run.already++; continue }
    const lang = ctx.agent.profile.preferredLanguage ?? "en"
    const out = await sendMonthlyResults({
      to: ctx.email, lang, month, results,
      portalUrl: `${CANONICAL_SITE_URL}/agent`, profileUrl: `${CANONICAL_SITE_URL}/agent/profile`,
    })
    if (out.sent) run.sent++
    else {
      run.failed++
      await redis.del(sentKey(month, r.agentId))
      console.error(`[nop-monthly] email to agent ${r.agentId} failed:`, out.reason)
    }
  }
  await redis.lpush(RUNS_KEY, run)
  await redis.ltrim(RUNS_KEY, 0, 23)
  console.log(`[nop-monthly] ${run.mode} for ${month}: ${run.eligible} eligible, ${run.sent} sent, ${run.already} already, ${run.optedOut} opted out, ${run.nothingToReport} nothing to report, ${run.failed} failed`)
  return run
}

export async function listMonthlyRuns(limit = 12): Promise<MonthlyRun[]> {
  return redis.lrange<MonthlyRun>(RUNS_KEY, 0, limit - 1)
}
