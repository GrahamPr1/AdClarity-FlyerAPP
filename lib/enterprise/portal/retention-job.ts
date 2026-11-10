import { Redis } from "@upstash/redis"
import { getRosterRecord } from "@/lib/enterprise/agents-store"
import { deleteAgentAccount, summarizeAgentAccount } from "@/lib/enterprise/agent-account-deletion"
import { RETENTION_DUE_KEY, clearRetentionClock, getRetentionClock } from "./retention"

// The 12-month deletion job. Daily (Vercel cron, vercel.json) through
// /api/cron/nop-lead-retention. For every Agent ID whose retention clock has
// run out (retention.ts: 12 months after the roster said terminated, or the
// agent was removed), it deletes that agent's account: leads and RSVPs,
// events, profile, page settings and photo, scans (agent-account-deletion.ts).
// The flyer download record is kept.
//
// DRY RUN unless NOP_RETENTION_LIVE=on: a dry run deletes nothing and only
// records what it would have deleted. Every run, dry or live, is logged
// (counts and Agent IDs only, never a person's details):
//
//   nop-retention-runs    list, newest first, last 100 runs
//
// Each live deletion lands in the account deletion log, and its leads in the
// lead deletion log (agent-data.ts) as requested by "retention". An agent who is back on the roster (not
// terminated) before the job reaches them has their clock cleared instead.

const redis = Redis.fromEnv()
const RUNS_KEY = "nop-retention-runs"
export const RETENTION_JOB_ACTOR = "retention job"

export interface RetentionRunAgent {
  agentId: string
  /** Leads found when the job looked. */
  leads: number
  /** Leads actually deleted (always 0 in a dry run). */
  deleted: number
  /** Events found when the job looked. */
  events?: number
  /** Whether there was an account to delete, and (live) whether it was deleted. */
  account?: boolean
  accountDeleted?: boolean
  /** Why nothing was deleted, when nothing was. */
  skipped?: "no_clock" | "back_on_roster" | "not_due" | "billing_failed"
}

export interface RetentionRun {
  at: string
  mode: "dry_run" | "live"
  /** Who started it: the daily cron, or an admin's "Run a dry run now". */
  by: string
  agents: RetentionRunAgent[]
  totalLeads: number
  totalDeleted: number
}

export function retentionLive(): boolean {
  return process.env.NOP_RETENTION_LIVE === "on"
}

export async function runRetentionJob(opts: { live: boolean; by: string; now?: Date }): Promise<RetentionRun> {
  const now = opts.now ?? new Date()
  const due = ((await redis.zrange<string[]>(RETENTION_DUE_KEY, 0, now.getTime(), { byScore: true })) ?? []).map(String)
  const agents: RetentionRunAgent[] = []
  for (const agentId of due) {
    const clock = await getRetentionClock(agentId)
    if (!clock) {
      if (opts.live) await redis.zrem(RETENTION_DUE_KEY, agentId)
      agents.push({ agentId, leads: 0, deleted: 0, skipped: "no_clock" })
      continue
    }
    if (Date.parse(clock.deleteAfter) > now.getTime()) {
      agents.push({ agentId, leads: 0, deleted: 0, skipped: "not_due" })
      continue
    }
    const roster = await getRosterRecord(agentId)
    if (roster && roster.status !== "terminated") {
      if (opts.live) await clearRetentionClock(agentId)
      agents.push({ agentId, leads: 0, deleted: 0, skipped: "back_on_roster" })
      continue
    }
    const summary = await summarizeAgentAccount(agentId)
    const found = { leads: summary?.leads ?? 0, events: summary?.events ?? 0, account: !!summary?.account }
    if (!opts.live) {
      agents.push({ agentId, ...found, deleted: 0 })
      continue
    }
    if (summary) {
      const out = await deleteAgentAccount(agentId, { by: RETENTION_JOB_ACTOR, reason: "retention", note: `12 months after ${clock.reason.replace(/_/g, " ")} on ${clock.endedAt.slice(0, 10)}` })
      if (!out.ok && out.reason === "billing_failed") {
        // Stays due: tried again tomorrow.
        agents.push({ agentId, ...found, deleted: 0, skipped: "billing_failed" })
        continue
      }
      agents.push({ agentId, ...found, deleted: out.ok ? out.deletion.leads : 0, accountDeleted: out.ok && found.account })
    } else {
      agents.push({ agentId, ...found, deleted: 0 })
    }
    // Done with this agent: off the due list. The clock stays as the record of when and why.
    await redis.zrem(RETENTION_DUE_KEY, agentId)
  }
  const run: RetentionRun = {
    at: now.toISOString(),
    mode: opts.live ? "live" : "dry_run",
    by: opts.by,
    agents,
    totalLeads: agents.reduce((n, a) => n + a.leads, 0),
    totalDeleted: agents.reduce((n, a) => n + a.deleted, 0),
  }
  await redis.lpush(RUNS_KEY, run)
  await redis.ltrim(RUNS_KEY, 0, 99)
  console.log(`[nop-retention] ${run.mode} by ${run.by}: ${agents.length} agent(s) due, ${run.totalLeads} lead(s) found, ${run.totalDeleted} deleted`)
  return run
}

export async function listRetentionRuns(limit = 20): Promise<RetentionRun[]> {
  return redis.lrange<RetentionRun>(RUNS_KEY, 0, limit - 1)
}
