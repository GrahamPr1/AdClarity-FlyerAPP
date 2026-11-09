import { Redis } from "@upstash/redis"
import { getAgentIdOwner, getRosterRecord, saveRosterRecord } from "./agents-store"
import { clearRetentionClock, startRetentionClock, type RetentionClock } from "./portal/retention"

// "Remove from program" and its Undo, for admins on the agent's admin page.
//
// Remove sets the roster status to "terminated" and starts the 12-month lead
// retention clock (retention.ts; the daily job deletes when it runs out).
// Everything else follows from the status, as it already does for an imported
// terminated agent: no flyers, no Pro features, the QR forwards to the
// program's page, the personal and lead pages are gone, and code sign-in is
// refused (the same neutral reply as an unknown email).
//
// Undo (reactivate) restores the status the agent had before, and clears the
// clock, so nothing is deleted. Both are logged with the admin:
//
//   nop-program-status-log    list, newest first, kept

const redis = Redis.fromEnv()
const LOG_KEY = "nop-program-status-log"

export interface ProgramStatusLogEntry {
  at: string
  admin: string
  action: "remove" | "reactivate"
  agentId: string
  account: string | null
  /** remove: the status replaced; reactivate: the status restored. */
  status: string
}

async function log(entry: Omit<ProgramStatusLogEntry, "at">): Promise<ProgramStatusLogEntry> {
  const full = { ...entry, at: new Date().toISOString() }
  await redis.lpush(LOG_KEY, full)
  console.log(`[nop] ${entry.admin} ${entry.action === "remove" ? "removed" : "reactivated"} agent ${entry.agentId}`)
  return full
}

export async function listProgramStatusLog(opts: { agentId?: string; limit?: number } = {}): Promise<ProgramStatusLogEntry[]> {
  const all = await redis.lrange<ProgramStatusLogEntry>(LOG_KEY, 0, -1)
  return (opts.agentId ? all.filter((e) => e.agentId === opts.agentId) : all).slice(0, opts.limit ?? 100)
}

export type MembershipResult = { ok: true; status: string; clock: RetentionClock | null } | { ok: false; reason: "no_roster_record" | "already_removed" | "not_removed" }

export async function removeFromProgram(agentId: string, admin: string): Promise<MembershipResult> {
  const record = await getRosterRecord(agentId)
  if (!record) return { ok: false, reason: "no_roster_record" }
  if (record.status === "terminated") return { ok: false, reason: "already_removed" }
  const now = new Date()
  await saveRosterRecord({ ...record, status: "terminated", statusBeforeRemoval: record.status, removedBy: admin, removedAt: now.toISOString() })
  const clock = await startRetentionClock(agentId, "terminated", now)
  await log({ admin, action: "remove", agentId, account: await getAgentIdOwner(agentId), status: record.status })
  return { ok: true, status: "terminated", clock }
}

export async function reactivateInProgram(agentId: string, admin: string): Promise<MembershipResult> {
  const record = await getRosterRecord(agentId)
  if (!record) return { ok: false, reason: "no_roster_record" }
  if (record.status !== "terminated") return { ok: false, reason: "not_removed" }
  const restored = record.statusBeforeRemoval && record.statusBeforeRemoval !== "terminated" ? record.statusBeforeRemoval : "active"
  const { statusBeforeRemoval: _s, removedBy: _b, removedAt: _a, ...rest } = record
  await saveRosterRecord({ ...rest, status: restored })
  await clearRetentionClock(agentId)
  await log({ admin, action: "reactivate", agentId, account: await getAgentIdOwner(agentId), status: restored })
  return { ok: true, status: restored, clock: null }
}
