import { Redis } from "@upstash/redis"

// How long an agent's leads are kept. While the agent is on the roster and
// not terminated, they stay. From the moment the roster says terminated (or
// the agent is removed from the roster), a 12-month clock runs; when it
// expires, the leads are to be deleted. Sooner deletion, on request from the
// person or from Basic Benefits, is an admin action (agent-data.ts).
//
//   nop-agent:{agentId}:retention   {"endedAt", "reason", "deleteAfter"}
//   nop-retention-due               zset: Agent ID, scored by deleteAfter (ms)
//
// This file only RECORDS the clock. Nothing deletes on schedule yet: the job
// that reads nop-retention-due arrives with the phase that adds cron jobs.

const redis = Redis.fromEnv()

export const RETENTION_MONTHS = 12
const clockKey = (agentId: string) => `nop-agent:${agentId}:retention`
const DUE_KEY = "nop-retention-due"

export type RetentionReason = "terminated" | "removed_from_roster"

export interface RetentionClock {
  endedAt: string
  reason: RetentionReason
  /** endedAt plus 12 calendar months. */
  deleteAfter: string
}

/** 12 calendar months after the end (UTC); a 31st with no 31st lands on the month's last day. */
export function retentionDeadline(endedAt: Date): Date {
  const d = new Date(endedAt)
  const day = d.getUTCDate()
  d.setUTCDate(1)
  d.setUTCMonth(d.getUTCMonth() + RETENTION_MONTHS)
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate()
  d.setUTCDate(Math.min(day, last))
  return d
}

/**
 * Starts the clock if it isn't already running. A re-import of an agent who
 * is still terminated never restarts it, so the 12 months count from the
 * first time the roster said so.
 */
export async function startRetentionClock(agentId: string, reason: RetentionReason, at = new Date()): Promise<RetentionClock> {
  const clock: RetentionClock = { endedAt: at.toISOString(), reason, deleteAfter: retentionDeadline(at).toISOString() }
  const set = await redis.set(clockKey(agentId), clock, { nx: true })
  if (set !== "OK") return (await getRetentionClock(agentId)) ?? clock
  await redis.zadd(DUE_KEY, { score: Date.parse(clock.deleteAfter), member: agentId })
  return clock
}

/** The agent is back on the roster and not terminated: their leads are kept again. */
export async function clearRetentionClock(agentId: string): Promise<void> {
  await Promise.all([redis.del(clockKey(agentId)), redis.zrem(DUE_KEY, agentId)])
}

export async function getRetentionClock(agentId: string): Promise<RetentionClock | null> {
  return (await redis.get<RetentionClock>(clockKey(agentId))) ?? null
}

/**
 * The roster has no "remove" today (imports only add and update). Whatever
 * removes an agent from it later must call this.
 */
export function markAgentRemovedFromRoster(agentId: string, at = new Date()): Promise<RetentionClock> {
  return startRetentionClock(agentId, "removed_from_roster", at)
}
