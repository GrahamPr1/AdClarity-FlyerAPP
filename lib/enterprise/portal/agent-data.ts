import { Redis } from "@upstash/redis"
import type { LeadRecord } from "@/lib/types"
import { statsMonth } from "@/lib/stats-month"

// What a NOP agent's flyers produce: QR scans and leads. It belongs to the
// Agent ID, not to the account holding it, so it stays with the ID through an
// account change, and moves between IDs only by the admin action below.
//
//   nop-agent:{agentId}:scans    hash: "total" and "YYYY-MM" (Eastern) -> count
//   nop-agent:{agentId}:leads    zset: lead id, scored by createdAt (ms)
//   nop-lead:{id}                the LeadRecord (same shape as SMB leads, plus consent)
//   nop-agent-data-moves         every admin move, newest first, never trimmed
//
// Lead records don't name their agent: ownership is membership of the
// agent's zset, so a move is one atomic script over two keys per ID.

const redis = Redis.fromEnv()

const scansKey = (agentId: string) => `nop-agent:${agentId}:scans`
const leadsKey = (agentId: string) => `nop-agent:${agentId}:leads`
const leadKey = (id: string) => `nop-lead:${id}`
const MOVES_KEY = "nop-agent-data-moves"

// ---- Scans -------------------------------------------------------------------

/** One QR scan, for any tier and any roster status. Shown only to active Pro/Leader agents. */
export async function countAgentScan(agentId: string, at = new Date()): Promise<void> {
  const tx = redis.multi()
  tx.hincrby(scansKey(agentId), "total", 1)
  tx.hincrby(scansKey(agentId), statsMonth(at), 1)
  await tx.exec()
}

export interface AgentScans {
  total: number
  thisMonth: number
}

export async function getAgentScans(agentId: string, at = new Date()): Promise<AgentScans> {
  const h = (await redis.hgetall<Record<string, string | number>>(scansKey(agentId))) ?? {}
  return { total: Number(h.total ?? 0), thisMonth: Number(h[statsMonth(at)] ?? 0) }
}

// ---- Leads -------------------------------------------------------------------

export async function saveAgentLead(agentId: string, lead: LeadRecord): Promise<void> {
  const tx = redis.multi()
  tx.set(leadKey(lead.id), lead)
  tx.zadd(leadsKey(agentId), { score: Date.parse(lead.createdAt), member: lead.id })
  await tx.exec()
}

/** Newest first. */
export async function listAgentLeads(agentId: string): Promise<LeadRecord[]> {
  const ids = (await redis.zrange<string[]>(leadsKey(agentId), 0, -1, { rev: true })) ?? []
  if (ids.length === 0) return []
  const records = await redis.mget<(LeadRecord | null)[]>(...ids.map(leadKey))
  return records.filter((r): r is LeadRecord => r !== null)
}

export async function countAgentLeads(agentId: string, since?: Date): Promise<number> {
  return since ? redis.zcount(leadsKey(agentId), since.getTime(), "+inf") : redis.zcard(leadsKey(agentId))
}

/** Marks one of THIS agent's leads contacted (or not). False when the lead isn't theirs. */
export async function setAgentLeadContacted(agentId: string, leadId: string, contacted: boolean, at = new Date()): Promise<LeadRecord | null> {
  if ((await redis.zscore(leadsKey(agentId), leadId)) === null) return null
  const lead = await redis.get<LeadRecord>(leadKey(leadId))
  if (!lead) return null
  const next: LeadRecord = { ...lead, contactedAt: contacted ? at.toISOString() : null }
  await redis.set(leadKey(leadId), next)
  return next
}

// ---- Admin: move an Agent ID's data to another Agent ID ------------------------

export interface AgentDataSummary {
  leads: number
  scans: number
}

export async function summarizeAgentData(agentId: string): Promise<AgentDataSummary> {
  const [leads, scans] = await Promise.all([redis.zcard(leadsKey(agentId)), getAgentScans(agentId)])
  return { leads, scans: scans.total }
}

export interface AgentDataMove {
  admin: string
  from: string
  to: string
  moved: AgentDataSummary
  at: string
}

// KEYS: from scans, from leads, to scans, to leads. ARGV: expected leads, expected scan total.
// Refuses ("stale") if the source changed since the admin saw the preview.
// Leads: union into the target, keeping each lead's original timestamp.
// Scans: every field (total and each month) added onto the target's.
const MOVE = `
local leads = redis.call("ZCARD", KEYS[2])
local scans = tonumber(redis.call("HGET", KEYS[1], "total") or "0")
if leads ~= tonumber(ARGV[1]) or scans ~= tonumber(ARGV[2]) then return "stale" end
if leads > 0 then
  redis.call("ZUNIONSTORE", KEYS[4], 2, KEYS[4], KEYS[2], "AGGREGATE", "MIN")
  redis.call("DEL", KEYS[2])
end
local fields = redis.call("HGETALL", KEYS[1])
for i = 1, #fields, 2 do redis.call("HINCRBY", KEYS[3], fields[i], tonumber(fields[i + 1])) end
redis.call("DEL", KEYS[1])
return "ok"`

export type MoveResult = { ok: true; move: AgentDataMove } | { ok: false; reason: "stale" | "same_id" }

/**
 * Moves every lead and scan from one Agent ID to another, atomically, only if
 * the source still holds exactly what the admin was shown. Logged with the
 * admin, both IDs, the counts and the time.
 */
export async function moveAgentData(admin: string, from: string, to: string, expected: AgentDataSummary): Promise<MoveResult> {
  if (from === to) return { ok: false, reason: "same_id" }
  const out = await redis.eval<string[], string>(
    MOVE,
    [scansKey(from), leadsKey(from), scansKey(to), leadsKey(to)],
    [String(expected.leads), String(expected.scans)],
  )
  if (out !== "ok") return { ok: false, reason: "stale" }
  const move: AgentDataMove = { admin, from, to, moved: expected, at: new Date().toISOString() }
  await redis.lpush(MOVES_KEY, move)
  return { ok: true, move }
}

export async function listAgentDataMoves(limit = 100): Promise<AgentDataMove[]> {
  return redis.lrange<AgentDataMove>(MOVES_KEY, 0, limit - 1)
}

// ---- Admin: delete leads on request (before the retention clock runs out) ------

export type DeletionRequester = "person" | "basic_benefits"

export interface LeadDeletion {
  admin: string
  agentId: string
  /** Ids only: the log never keeps the details it was asked to delete. */
  leadIds: string[]
  requestedBy: DeletionRequester
  note: string
  at: string
}

const DELETIONS_KEY = "nop-lead-deletions"

/**
 * Deletes the given leads of one Agent ID (only ids actually in that agent's
 * set), and logs it. Returns null when none of the ids were the agent's.
 */
export async function deleteAgentLeads(admin: string, agentId: string, leadIds: string[], requestedBy: DeletionRequester, note: string): Promise<LeadDeletion | null> {
  const owned: string[] = []
  for (const id of leadIds) if ((await redis.zscore(leadsKey(agentId), id)) !== null) owned.push(id)
  if (owned.length === 0) return null
  const tx = redis.multi()
  tx.zrem(leadsKey(agentId), ...owned)
  tx.del(...owned.map(leadKey))
  await tx.exec()
  const entry: LeadDeletion = { admin, agentId, leadIds: owned, requestedBy, note, at: new Date().toISOString() }
  await redis.lpush(DELETIONS_KEY, entry)
  return entry
}

/** Every lead id an Agent ID holds, for "delete all of this agent's leads". */
export async function listAgentLeadIds(agentId: string): Promise<string[]> {
  return ((await redis.zrange<string[]>(leadsKey(agentId), 0, -1)) ?? []).map(String)
}

export async function listLeadDeletions(limit = 100): Promise<LeadDeletion[]> {
  return redis.lrange<LeadDeletion>(DELETIONS_KEY, 0, limit - 1)
}
