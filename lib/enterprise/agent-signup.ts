import { Redis } from "@upstash/redis"
import type { RosterRecord } from "@/lib/types"
import type { NopLang } from "@/lib/enterprise/nop-i18n"
import { getAgentProfile, recordClientCreatedAtIfUnset, saveAgentProfile } from "@/lib/store"
import {
  addAgentFlag,
  adminUnlockAgentId,
  buildAgentProfile,
  deleteRosterRecord,
  flagNameIfTooLongForFooter,
  getAgentIdOwner,
  getRosterRecord,
  listRoster,
  lockAgentId,
  saveRosterRecord,
} from "./agents-store"
import { getEnrollDomain } from "./nop-enroll-domain"
import { addRecruit, removeRecruit, resolveRecruiter } from "./portal/recruiting"

// Self sign-up for NOP agents (no imported roster needed).
//
// An agent signs up on /agent/start with Agent ID, name, phone, email and
// language, and proves the email with the usual code. Then:
//   - a free Agent ID becomes a roster record with status "pending" and
//     source "self", locked to that email's account. Pending gets nothing:
//     no flyers, no Pro, and the QR forwards to the program's page (all of
//     that already follows roster status);
//   - an ID already held, or already on the roster, is NOT claimed: the
//     attempt is flagged for admin, and the person sees exactly the same
//     "we'll review your sign-up" reply, so nobody can learn which IDs exist.
// A pending self sign-up can't sign in (sign-in treats it like no account);
// an admin approves (status "active", the agent is emailed a sign-in link) or
// rejects (the record is removed and the ID freed; the log keeps what was
// submitted; the agent is told, without a reason).
//
//   nop-signups:log     list, newest first: every approve / reject, kept
//
// Display-name changes need approval too (the name prints on flyers):
// requestNameChange keeps the request on the profile (pendingName) until an
// admin approves or rejects it; both are logged here.

const redis = Redis.fromEnv()
const LOG_KEY = "nop-signups:log"

export interface SignupDetails {
  agentId: string
  name: string
  phone: string
  email: string
  lang: NopLang
  /** The recruit link's code it came through, if any. */
  ref?: string | null
}

export interface SignupLogEntry {
  at: string
  admin: string
  action: "approve" | "reject" | "approve_name" | "reject_name"
  agentId: string
  account: string
  /** What the agent submitted (sign-up), or the requested name (name change). */
  name: string
  phone?: string
  lang?: NopLang
  /** approve_name: the name it replaced. */
  previousName?: string
}

async function log(entry: Omit<SignupLogEntry, "at">): Promise<SignupLogEntry> {
  const full = { ...entry, at: new Date().toISOString() }
  await redis.lpush(LOG_KEY, full)
  console.log(`[nop] ${entry.admin} ${entry.action} agent ${entry.agentId}`)
  return full
}

export async function listSignupLog(limit = 100): Promise<SignupLogEntry[]> {
  return redis.lrange<SignupLogEntry>(LOG_KEY, 0, limit - 1)
}

/**
 * Called once the email is proven. Creates the pending sign-up, or flags a
 * duplicate. Returns which, for logging and tests only: the route answers
 * both the same way.
 */
export async function submitSignup(d: SignupDetails): Promise<"created" | "duplicate"> {
  const duplicate = async (heldBy?: string) => {
    await addAgentFlag({ type: "signup_duplicate", agentId: d.agentId, account: d.email, attemptedEmail: d.email, ...(heldBy ? { heldBy } : {}) })
    return "duplicate" as const
  }
  // On the roster already (imported, or another sign-up): never overwritten here.
  if (await getRosterRecord(d.agentId)) return duplicate((await getAgentIdOwner(d.agentId)) ?? undefined)
  // The claim is the same atomic SET NX as registration: of two simultaneous
  // sign-ups for one ID exactly one wins, and the other is a duplicate.
  const lock = await lockAgentId(d.agentId, d.email)
  if (!lock.ok) return duplicate(lock.reason === "id_taken" ? lock.heldBy : undefined)

  const now = new Date().toISOString()
  // Through an agent's recruit link: recorded only if that agent can recruit right now (and isn't signing up themselves).
  const recruiter = await resolveRecruiter(d.ref ?? null)
  const recruitedBy = recruiter && recruiter.agentId !== d.agentId ? recruiter.agentId : null
  const record: RosterRecord = {
    agentId: d.agentId,
    companyName: "",
    agentName: d.name,
    rosterEmail: d.email,
    rosterPhone: d.phone,
    referralCode: "",
    enrollmentUrl: "",
    enrollmentUrlMismatch: false,
    status: "pending",
    importedAt: now,
    source: "self",
    signupLang: d.lang,
    ...(recruitedBy ? { recruitedBy, recruitedAt: now } : {}),
  }
  // No client:{email}:createdAt yet: it would make a rejected email look
  // like a business account and block it from signing up again. Approval sets it.
  await saveRosterRecord(record)
  await saveAgentProfile(d.email, {
    ...buildAgentProfile(record, { displayName: d.name, displayPhone: d.phone, displayEmail: d.email }, await getEnrollDomain()),
    preferredLanguage: d.lang,
  })
  await flagNameIfTooLongForFooter(d.agentId, d.email, d.name)
  if (recruitedBy) await addRecruit(recruitedBy, d.agentId, new Date(now))
  return "created"
}

/** True for a self sign-up that hasn't been approved yet: it can't sign in. */
export function isPendingSelfSignup(record: Pick<RosterRecord, "status" | "source"> | null | undefined): boolean {
  return record?.source === "self" && record.status === "pending"
}

export interface PendingSignup {
  agentId: string
  name: string
  phone: string
  email: string
  lang: NopLang
  submittedAt: string
  /** The recruiting agent's ID, if they signed up through a recruit link. */
  recruitedBy: string | null
}

export async function listPendingSignups(): Promise<PendingSignup[]> {
  return (await listRoster())
    .filter((r) => isPendingSelfSignup(r))
    .map((r) => ({ agentId: r.agentId, name: r.agentName, phone: r.rosterPhone, email: r.rosterEmail, lang: r.signupLang ?? "en", submittedAt: r.importedAt, recruitedBy: r.recruitedBy ?? null }))
    .sort((a, b) => a.submittedAt.localeCompare(b.submittedAt))
}

export type DecisionResult = { ok: true; entry: SignupLogEntry; lang: NopLang; email: string; name: string } | { ok: false; reason: "not_pending" }

export async function approveSignup(agentId: string, admin: string): Promise<DecisionResult> {
  const record = await getRosterRecord(agentId)
  if (!record || !isPendingSelfSignup(record)) return { ok: false, reason: "not_pending" }
  await saveRosterRecord({ ...record, status: "active", approvedBy: admin, approvedAt: new Date().toISOString() })
  await recordClientCreatedAtIfUnset(record.rosterEmail)
  const entry = await log({ admin, action: "approve", agentId, account: record.rosterEmail, name: record.agentName, phone: record.rosterPhone, lang: record.signupLang })
  return { ok: true, entry, lang: record.signupLang ?? "en", email: record.rosterEmail, name: record.agentName }
}

/**
 * Removes the pending record, its account link and profile, so the ID (and
 * the email) can sign up again. The log keeps what was submitted.
 */
export async function rejectSignup(agentId: string, admin: string): Promise<DecisionResult> {
  const record = await getRosterRecord(agentId)
  if (!record || !isPendingSelfSignup(record)) return { ok: false, reason: "not_pending" }
  const owner = await getAgentIdOwner(agentId)
  if (owner) await adminUnlockAgentId(agentId, owner)
  await deleteRosterRecord(agentId)
  if (record.recruitedBy) await removeRecruit(record.recruitedBy, agentId)
  const entry = await log({ admin, action: "reject", agentId, account: record.rosterEmail, name: record.agentName, phone: record.rosterPhone, lang: record.signupLang })
  return { ok: true, entry, lang: record.signupLang ?? "en", email: record.rosterEmail, name: record.agentName }
}

// ---- Display-name changes ---------------------------------------------------------

/** Keeps the request on the profile; the approved name stays on flyers until an admin approves. */
export async function requestNameChange(account: string, name: string): Promise<void> {
  const profile = await getAgentProfile(account)
  if (!profile?.agentId) return
  const { savedAt: _savedAt, ...rest } = profile
  await saveAgentProfile(account, { ...rest, pendingName: { name, requestedAt: new Date().toISOString() } })
  await flagNameIfTooLongForFooter(profile.agentId, account, name)
}

export interface PendingNameChange {
  agentId: string
  account: string
  currentName: string
  requestedName: string
  requestedAt: string
}

export async function listPendingNameChanges(): Promise<PendingNameChange[]> {
  const out: PendingNameChange[] = []
  for (const r of await listRoster()) {
    if (!r.lockedTo) continue
    const p = await getAgentProfile(r.lockedTo)
    if (p?.agentId === r.agentId && p.pendingName) {
      out.push({ agentId: r.agentId, account: r.lockedTo, currentName: p.displayName ?? p.name, requestedName: p.pendingName.name, requestedAt: p.pendingName.requestedAt })
    }
  }
  return out.sort((a, b) => a.requestedAt.localeCompare(b.requestedAt))
}

export async function decideNameChange(agentId: string, admin: string, approve: boolean): Promise<{ ok: boolean }> {
  const account = await getAgentIdOwner(agentId)
  const profile = account ? await getAgentProfile(account) : null
  if (!account || !profile || profile.agentId !== agentId || !profile.pendingName) return { ok: false }
  const { savedAt: _savedAt, ...rest } = profile
  const requested = profile.pendingName.name
  const previousName = profile.displayName ?? profile.name
  await saveAgentProfile(account, approve ? { ...rest, displayName: requested, name: requested, pendingName: null } : { ...rest, pendingName: null })
  await log({ admin, action: approve ? "approve_name" : "reject_name", agentId, account, name: requested, previousName })
  return { ok: true }
}
