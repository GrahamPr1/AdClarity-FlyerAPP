import { Redis } from "@upstash/redis"
import { listRoster } from "@/lib/enterprise/agents-store"
import { getAgentProfile } from "@/lib/store"
import { sendFollowUpReminder } from "@/lib/email"
import { CANONICAL_SITE_URL } from "@/lib/site-url"
import type { LeadRecord } from "@/lib/types"
import { listAgentLeads } from "./agent-data"
import { canUse } from "./features"
import { loadPortalContext } from "./context"
import { followUpReason, type FollowUpReason } from "./lead-tracker"

// The daily follow-up reminder (Part E). Every morning (Vercel cron,
// vercel.json, 14:00 UTC: 9 or 10am Eastern), each active Pro/Leader agent
// whose org has it on, and who hasn't turned it off in their profile, gets one
// email in their language listing the leads that need follow-up today (the
// Leads tab's rule, lead-tracker.ts followUpReason: a follow-up date today or
// earlier, or New and untouched 2+ days), each linking straight to that lead.
// Nothing to do: no email. Never twice in a day: the send is marked first
// (SET NX) and the mark released if it fails. "Today" is the Eastern date, as
// for every other count (stats-month.ts).
//
//   nop-followup-email:{YYYY-MM-DD}:{agentId}   sent mark (kept 3 days)
//   nop-followup-email-runs                     list, newest first, last 60 runs (counts only)

const redis = Redis.fromEnv()
const RUNS_KEY = "nop-followup-email-runs"
const sentKey = (day: string, agentId: string) => `nop-followup-email:${day}:${agentId}`
export const MAX_LISTED = 25

export function easternDate(at: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(at)
}

export interface DueLead {
  id: string
  name: string
  reason: FollowUpReason
}

/** The agent's leads that need follow-up today: overdue first, then due today, then waiting New leads (oldest first). */
export function dueLeads(leads: LeadRecord[], today: string, now: Date): DueLead[] {
  const rank = (r: FollowUpReason) => (r.kind === "overdue" ? 0 : r.kind === "today" ? 1 : 2)
  return leads
    .flatMap((l) => { const reason = followUpReason(l, today, now); return reason ? [{ id: l.id, name: l.name, reason, createdAt: l.createdAt }] : [] })
    .sort((a, b) => rank(a.reason) - rank(b.reason) || (a.reason.kind === "overdue" && b.reason.kind === "overdue" ? a.reason.on.localeCompare(b.reason.on) : 0) || a.createdAt.localeCompare(b.createdAt))
    .map(({ id, name, reason }) => ({ id, name, reason }))
}

export interface FollowUpRun {
  at: string
  day: string
  mode: "dry_run" | "live"
  by: string
  /** Agents with something to follow up (they get, or would get, the email). */
  withLeads: number
  sent: number
  already: number
  optedOut: number
  /** Agents with nothing due today: no email. */
  nothingDue: number
  failed: number
}

export async function runFollowUpReminders(opts: { live: boolean; by: string; now?: Date }): Promise<FollowUpRun> {
  const now = opts.now ?? new Date()
  const day = easternDate(now)
  const run: FollowUpRun = { at: now.toISOString(), day, mode: opts.live ? "live" : "dry_run", by: opts.by, withLeads: 0, sent: 0, already: 0, optedOut: 0, nothingDue: 0, failed: 0 }
  for (const r of await listRoster()) {
    if (r.status !== "active" || !r.lockedTo) continue
    const ctx = await loadPortalContext(r.lockedTo)
    if (!ctx || ctx.agent.agentId !== r.agentId || !canUse(ctx, "followUpReminders") || !canUse(ctx, "leads")) continue
    if ((await getAgentProfile(r.lockedTo))?.followUpReminders === false) { run.optedOut++; continue }
    const due = dueLeads(await listAgentLeads(r.agentId), day, now)
    if (due.length === 0) { run.nothingDue++; continue }
    run.withLeads++
    if (!opts.live) continue
    if (!(await redis.set(sentKey(day, r.agentId), now.toISOString(), { nx: true, ex: 3 * 86400 }))) { run.already++; continue }
    const out = await sendFollowUpReminder({
      to: ctx.email, lang: ctx.agent.profile.preferredLanguage ?? "en", leads: due.slice(0, MAX_LISTED), more: Math.max(0, due.length - MAX_LISTED),
      leadUrl: (id) => `${CANONICAL_SITE_URL}/agent/leads#lead-${encodeURIComponent(id)}`, leadsUrl: `${CANONICAL_SITE_URL}/agent/leads`, profileUrl: `${CANONICAL_SITE_URL}/agent/profile`,
    })
    if (out.sent) run.sent++
    else {
      run.failed++
      await redis.del(sentKey(day, r.agentId))
      console.error(`[nop-followup] email to agent ${r.agentId} failed:`, out.reason)
    }
  }
  await redis.lpush(RUNS_KEY, run)
  await redis.ltrim(RUNS_KEY, 0, 59)
  console.log(`[nop-followup] ${run.mode} for ${day}: ${run.withLeads} with leads due, ${run.sent} sent, ${run.already} already, ${run.optedOut} opted out, ${run.nothingDue} nothing due, ${run.failed} failed`)
  return run
}

export async function listFollowUpRuns(limit = 14): Promise<FollowUpRun[]> {
  return redis.lrange<FollowUpRun>(RUNS_KEY, 0, limit - 1)
}
