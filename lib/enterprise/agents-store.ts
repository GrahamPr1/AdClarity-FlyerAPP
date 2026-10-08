import { Redis } from "@upstash/redis"
import { sha256Hex } from "@/lib/auth"
import type { AgentFlag, AgentProfile, EnterpriseOrg, RosterRecord } from "@/lib/types"
import { deleteAgentProfile, getAgentProfile, getEnterpriseOrg, saveAgentProfile, saveEnterpriseOrg } from "@/lib/store"
import { NOP_ORG_ID, NOP_ORG_NAME, isGenerationStatus, qrDestinationFor } from "./nop-roster"

// Redis layer for locked-agent registration. Additive: none of these keys
// existed before, and nothing in the SMB path reads them except the one
// generation guard (isNopAgentAccount).
//
//   roster:{org}:{agentId}      RosterRecord, as last imported
//   roster:{org}:ids            set of every imported agentId
//   agent-id:{agentId}          account email that owns the ID — SET NX only
//   agent-account:{email}       the agentId that account owns (one per account)
//   agent-reg:{email}           registration in progress, 15 min TTL
//   agent-flags:{org}           blocked attempts, newest first
//
// Own client, the same as lib/rate-limit.ts, rather than growing store.ts.
// Note that @upstash/redis JSON-parses on read, so a stored "858980" comes
// back as the number 858980; every bare-string read here goes through String().

const redis = Redis.fromEnv()

const rosterKey = (org: string, agentId: string) => `roster:${org}:${agentId}`
const rosterIdsKey = (org: string) => `roster:${org}:ids`
const agentIdKey = (agentId: string) => `agent-id:${agentId}`
const agentAccountKey = (email: string) => `agent-account:${email}`
const registrationKey = (email: string) => `agent-reg:${email}`
const flagsKey = (org: string) => `agent-flags:${org}`
/** Roster email -> Agent ID(s), rebuilt on every import. Used only by code sign-in. */
const rosterEmailKey = (org: string, email: string) => `roster:${org}:email:${email}`

export const REGISTRATION_TTL_SECONDS = 15 * 60
export const MAX_CODE_ATTEMPTS = 5

// ---- Roster -----------------------------------------------------------------

export async function ensureNopOrg(): Promise<EnterpriseOrg> {
  const existing = await getEnterpriseOrg(NOP_ORG_ID)
  if (existing) return existing
  // No assets: the pipeline's enterprise mode only switches on for an org
  // with approved content, so this alone changes no generation behaviour.
  return saveEnterpriseOrg({ id: NOP_ORG_ID, name: NOP_ORG_NAME, assets: [] })
}

/**
 * Upserts accepted rows. Status changes take effect immediately because
 * canGenerate reads this record at call time. Agents absent from the file are
 * left as they were — removing someone is a status change, not an omission.
 */
export interface RosterEmailChange {
  agentId: string
  from: string
  to: string
}

export async function importRoster(
  rows: Omit<RosterRecord, "importedAt">[],
): Promise<{ created: number; updated: number; emailChanges: RosterEmailChange[] }> {
  await ensureNopOrg()
  const importedAt = new Date().toISOString()
  let created = 0
  let updated = 0
  const emailChanges: RosterEmailChange[] = []
  for (const row of rows) {
    const record: RosterRecord = { ...row, importedAt }
    const previous = await getRosterRecord(row.agentId)
    const isNew = (await redis.sadd(rosterIdsKey(NOP_ORG_ID), row.agentId)) === 1
    await redis.set(rosterKey(NOP_ORG_ID, row.agentId), record)
    if (isNew) created++
    else updated++

    // Email index for code sign-in. A changed roster email takes effect at
    // once: the old address is dropped, so codes only ever go to the CURRENT
    // one, and the change is flagged for the admin.
    if (previous && previous.rosterEmail !== row.rosterEmail) {
      await redis.srem(rosterEmailKey(NOP_ORG_ID, previous.rosterEmail), row.agentId)
      emailChanges.push({ agentId: row.agentId, from: previous.rosterEmail, to: row.rosterEmail })
      await addAgentFlag({ type: "roster_email_changed", agentId: row.agentId, account: "(roster import)", fromEmail: previous.rosterEmail, toEmail: row.rosterEmail })
    }
    await redis.sadd(rosterEmailKey(NOP_ORG_ID, row.rosterEmail), row.agentId)

    // Keep the registered agent's copies of system fields in step. Status is
    // deliberately not copied; it is only ever read from the roster.
    const owner = await getAgentIdOwner(row.agentId)
    if (owner) {
      const profile = await getAgentProfile(owner)
      if (profile && profile.agentId === row.agentId) {
        await saveAgentProfile(owner, { ...profile, referralCode: row.referralCode, companyName: row.companyName })
      }
    }
  }
  return { created, updated, emailChanges }
}

/**
 * The single Agent ID whose CURRENT roster email this is, or null (none,
 * or ambiguous). Double-checked against the record itself, so a stale index
 * entry can never send a code to an old address.
 */
export async function agentIdForRosterEmail(email: string): Promise<string | null> {
  const ids = (await redis.smembers(rosterEmailKey(NOP_ORG_ID, email))).map(String)
  const current: string[] = []
  for (const id of ids) if ((await getRosterRecord(id))?.rosterEmail === email) current.push(id)
  return current.length === 1 ? current[0] : null
}

export async function getRosterRecord(agentId: string): Promise<RosterRecord | null> {
  return (await redis.get<RosterRecord>(rosterKey(NOP_ORG_ID, agentId))) ?? null
}

export interface RosterListEntry extends RosterRecord {
  lockedTo: string | null
}

export async function listRoster(): Promise<RosterListEntry[]> {
  const ids = (await redis.smembers(rosterIdsKey(NOP_ORG_ID))).map(String).sort()
  if (ids.length === 0) return []
  const records = await redis.mget<(RosterRecord | null)[]>(...ids.map((id) => rosterKey(NOP_ORG_ID, id)))
  const owners = await redis.mget<(string | null)[]>(...ids.map(agentIdKey))
  return records.flatMap((r, i) => (r ? [{ ...r, lockedTo: owners[i] ? String(owners[i]) : null }] : []))
}

// ---- Agent ID lock ----------------------------------------------------------

export async function getAgentIdOwner(agentId: string): Promise<string | null> {
  const v = await redis.get(agentIdKey(agentId))
  return v == null ? null : String(v)
}

export async function getAccountAgentId(email: string): Promise<string | null> {
  const v = await redis.get(agentAccountKey(email))
  return v == null ? null : String(v)
}

// Deletes KEYS[1] only if it still holds ARGV[1]. Used to undo our own lock.
const DEL_IF_EQUALS = `if redis.call("GET", KEYS[1]) == ARGV[1] then return redis.call("DEL", KEYS[1]) else return 0 end`

export type LockResult =
  | { ok: true; alreadyYours: boolean }
  | { ok: false; reason: "id_taken"; heldBy: string }
  | { ok: false; reason: "account_has_other_id"; agentId: string }

/**
 * Claims an Agent ID for an account. The claim itself is a single SET NX on
 * agent-id:{id}: of any number of concurrent callers exactly one gets OK, and
 * there is no read before the write for a race to slip between.
 *
 * The account side (one ID per account) is a second SET NX; if that one loses,
 * the ID claim is undone with a compare-and-delete so it can never remove a
 * lock some other account holds.
 */
export async function lockAgentId(agentId: string, email: string): Promise<LockResult> {
  const claimed = await redis.set(agentIdKey(agentId), email, { nx: true })
  if (claimed !== "OK") {
    const heldBy = await getAgentIdOwner(agentId)
    if (heldBy === email) return { ok: true, alreadyYours: true }
    return { ok: false, reason: "id_taken", heldBy: heldBy ?? "unknown" }
  }
  const accountClaimed = await redis.set(agentAccountKey(email), agentId, { nx: true })
  if (accountClaimed !== "OK") {
    await redis.eval(DEL_IF_EQUALS, [agentIdKey(agentId)], [email])
    return { ok: false, reason: "account_has_other_id", agentId: (await getAccountAgentId(email)) ?? "unknown" }
  }
  return { ok: true, alreadyYours: false }
}

// Both admin operations are compare-and-set on the current owner the admin
// was looking at, inside one Lua script, so a concurrent registration or a
// second admin can't be silently overwritten.
//
//   KEYS: agent-id:{id}, agent-account:{from}, agent-account:{to}
//   ARGV: from, to, agentId
const REASSIGN = `
if redis.call("GET", KEYS[1]) ~= ARGV[1] then return "stale" end
if redis.call("EXISTS", KEYS[3]) == 1 then return "target_has_id" end
redis.call("SET", KEYS[1], ARGV[2])
redis.call("DEL", KEYS[2])
redis.call("SET", KEYS[3], ARGV[3])
return "ok"`

//   KEYS: agent-id:{id}, agent-account:{from}
//   ARGV: from
const UNLOCK = `
if redis.call("GET", KEYS[1]) ~= ARGV[1] then return "stale" end
redis.call("DEL", KEYS[1])
redis.call("DEL", KEYS[2])
return "ok"`

export type AdminLockResult = { ok: true } | { ok: false; reason: "stale" | "target_has_id" | "no_roster_record" }

export async function adminUnlockAgentId(agentId: string, expectedOwner: string): Promise<AdminLockResult> {
  const out = await redis.eval<string[], string>(UNLOCK, [agentIdKey(agentId), agentAccountKey(expectedOwner)], [expectedOwner])
  if (out !== "ok") return { ok: false, reason: "stale" }
  await deleteAgentProfile(expectedOwner)
  return { ok: true }
}

export async function adminReassignAgentId(agentId: string, expectedOwner: string, to: string): Promise<AdminLockResult> {
  const roster = await getRosterRecord(agentId)
  if (!roster) return { ok: false, reason: "no_roster_record" }
  const out = await redis.eval<string[], string>(
    REASSIGN,
    [agentIdKey(agentId), agentAccountKey(expectedOwner), agentAccountKey(to)],
    [expectedOwner, to, agentId],
  )
  if (out !== "ok") return { ok: false, reason: out === "target_has_id" ? "target_has_id" : "stale" }
  await deleteAgentProfile(expectedOwner)
  // The display fields belonged to the previous account's person; the new
  // owner starts from the roster defaults and can edit them.
  await saveAgentProfile(to, buildAgentProfile(roster, {
    displayName: roster.agentName,
    displayPhone: roster.rosterPhone,
    displayEmail: roster.rosterEmail,
  }))
  return { ok: true }
}

// ---- Profile ----------------------------------------------------------------

/** System fields from the roster; only the display fields come from the agent. */
export function buildAgentProfile(
  roster: RosterRecord,
  display: { displayName: string; displayPhone: string; displayEmail: string },
): Omit<AgentProfile, "savedAt"> {
  return {
    name: display.displayName,
    title: "",
    phone: display.displayPhone,
    email: display.displayEmail,
    headshotUrl: null,
    licenseStates: [],
    qrDestination: qrDestinationFor(roster.agentId),
    orgId: NOP_ORG_ID,
    agentId: roster.agentId,
    referralCode: roster.referralCode,
    companyName: roster.companyName,
    ...display,
  }
}

/** True when this account holds a NOP Agent ID. Drives the SMB generation guard. */
export async function isNopAgentAccount(email: string): Promise<boolean> {
  return (await getAccountAgentId(email)) !== null
}

/**
 * The single gate on NOP generation. Reads status from the roster at call
 * time, so a re-import that suspends someone applies on the very next call.
 * No Agent ID, or no roster record behind it, is not active.
 */
export async function canGenerate(agent: Pick<AgentProfile, "agentId"> | null | undefined): Promise<boolean> {
  if (!agent?.agentId) return false
  return isGenerationStatus(await getRosterRecord(agent.agentId))
}

// ---- Registration in progress -----------------------------------------------

export interface RegistrationState {
  agentId: string
  step: "email" | "code" | "verified"
  codeHash?: string
  codeAttempts: number
}

/** Codes are stored only as this hash, bound to the account and the Agent ID. */
export function hashVerificationCode(account: string, agentId: string, code: string): Promise<string> {
  return sha256Hex(`${account}:${agentId}:${code}`)
}

export async function getRegistration(email: string): Promise<RegistrationState | null> {
  return (await redis.get<RegistrationState>(registrationKey(email))) ?? null
}

export async function setRegistration(email: string, state: RegistrationState): Promise<void> {
  await redis.set(registrationKey(email), state, { ex: REGISTRATION_TTL_SECONDS })
}

export async function clearRegistration(email: string): Promise<void> {
  await redis.del(registrationKey(email))
}

// ---- Flags ------------------------------------------------------------------

export async function addAgentFlag(flag: Omit<AgentFlag, "id" | "at">): Promise<AgentFlag> {
  const record: AgentFlag = { ...flag, id: crypto.randomUUID(), at: new Date().toISOString() }
  await redis.lpush(flagsKey(NOP_ORG_ID), record)
  console.warn(`[nop] flagged ${record.type}: agent ${record.agentId}, account ${record.account}`)
  return record
}

export async function listAgentFlags(limit = 200): Promise<AgentFlag[]> {
  return redis.lrange<AgentFlag>(flagsKey(NOP_ORG_ID), 0, limit - 1)
}
