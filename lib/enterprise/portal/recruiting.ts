import { Redis } from "@upstash/redis"
import { randomInt } from "node:crypto"
import { getAgentIdOwner, getRosterRecord } from "@/lib/enterprise/agents-store"
import { NOP_QR_ALPHABET } from "@/lib/enterprise/nop-roster"
import { CANONICAL_SITE_URL } from "@/lib/site-url"
import { canUse } from "./features"
import { loadPortalContext } from "./context"

// Recruiting (Phase 6): each active Pro/Leader agent has a personal recruit
// link, oneflyer.org/agent/start?ref={code}, shared as a link or QR. A
// self sign-up through it records the recruiter on the new roster record
// (recruitedBy); the recruit still waits for admin approval like any sign-up.
// The agent sees their recruits (pending, approved, no longer active); admins
// see the recruiter on each sign-up and agent page. A rejected sign-up drops
// off the recruiter's list.
//
// The code is random, not the Agent ID, so the link doesn't reveal it. A ref
// that doesn't resolve to an agent who can recruit right now is ignored: the
// sign-up goes ahead with no recruiter.
//
// Recruiting FLYERS need the program's template: the portal keeps a marked
// spot for it (RECRUIT_FLYER_READY).
//
//   nop-recruit-code:{code}             recruiting agent's ID
//   nop-agent:{agentId}:recruit-code    their code
//   nop-agent:{agentId}:recruits        zset of recruit Agent IDs, by sign-up time

const redis = Redis.fromEnv()
const codeKey = (code: string) => `nop-recruit-code:${code}`
const agentCodeKey = (agentId: string) => `nop-agent:${agentId}:recruit-code`
const recruitsKey = (agentId: string) => `nop-agent:${agentId}:recruits`

/** The template isn't here yet: the portal shows a marked spot instead of a recruiting flyer. */
export const RECRUIT_FLYER_READY = false
export const RECRUIT_CODE_LENGTH = 7
export const RECRUIT_PATH = "/agent/start"
export const recruitLink = (code: string) => `${CANONICAL_SITE_URL}${RECRUIT_PATH}?ref=${code}`

const CODE_RE = new RegExp(`^[${NOP_QR_ALPHABET}]{${RECRUIT_CODE_LENGTH}}$`)
/** A well-formed ref from a URL or form, or null. */
export function parseRecruitRef(v: unknown): string | null {
  return typeof v === "string" && CODE_RE.test(v.trim()) ? v.trim() : null
}

function newCode(): string {
  let s = ""
  for (let i = 0; i < RECRUIT_CODE_LENGTH; i++) s += NOP_QR_ALPHABET[randomInt(NOP_QR_ALPHABET.length)]
  return s
}

/** The agent's recruit code, made on first use and never changed (printed QR codes keep working). */
export async function getOrCreateRecruitCode(agentId: string): Promise<string> {
  const existing = await redis.get<string>(agentCodeKey(agentId))
  if (existing) return String(existing)
  for (let i = 0; i < 5; i++) {
    const code = newCode()
    if (!(await redis.set(codeKey(code), agentId, { nx: true }))) continue
    // Two first visits at once: keep whichever code was stored first, release the other.
    if (await redis.set(agentCodeKey(agentId), code, { nx: true })) return code
    await redis.del(codeKey(code))
    return String(await redis.get<string>(agentCodeKey(agentId)))
  }
  throw new Error("could not allocate a recruit code")
}

export interface Recruiter {
  agentId: string
  name: string
}

/** Who a ref belongs to, if that agent is active and can recruit right now; else null. */
export async function resolveRecruiter(ref: string | null): Promise<Recruiter | null> {
  if (!ref) return null
  const agentId = await redis.get<string>(codeKey(ref))
  if (!agentId) return null
  const owner = await getAgentIdOwner(String(agentId))
  const ctx = owner ? await loadPortalContext(owner) : null
  if (!ctx || ctx.agent.agentId !== String(agentId) || !canUse(ctx, "recruiting")) return null
  return { agentId: String(agentId), name: ctx.agent.profile.displayName ?? ctx.agent.profile.name }
}

export async function addRecruit(recruiterId: string, recruitId: string, at: Date): Promise<void> {
  await redis.zadd(recruitsKey(recruiterId), { score: at.getTime(), member: recruitId })
}

export async function removeRecruit(recruiterId: string, recruitId: string): Promise<void> {
  await redis.zrem(recruitsKey(recruiterId), recruitId)
}

export type RecruitStatus = "pending" | "approved" | "inactive"
export interface Recruit {
  agentId: string
  name: string
  status: RecruitStatus
  signedUpAt: string
}

/**
 * The agent's recruits, newest first: name, sign-up date and where they are
 * (waiting for approval, approved and active, or no longer active). Only
 * records that still name this agent as recruiter count.
 */
export async function listRecruits(agentId: string): Promise<Recruit[]> {
  const ids = ((await redis.zrange<string[]>(recruitsKey(agentId), 0, -1, { rev: true })) ?? []).map(String)
  const records = await Promise.all(ids.map((id) => getRosterRecord(id)))
  return records.flatMap((r) => {
    if (!r || r.recruitedBy !== agentId) return []
    const status: RecruitStatus = r.status === "pending" ? "pending" : r.status === "active" ? "approved" : "inactive"
    return [{ agentId: r.agentId, name: r.agentName, status, signedUpAt: r.recruitedAt ?? r.importedAt }]
  })
}

/** For admin screens: the recruiting agent's ID and roster name, whatever their status now. */
export async function recruiterFor(agentId: string | null | undefined): Promise<Recruiter | null> {
  if (!agentId) return null
  const r = await getRosterRecord(agentId)
  return { agentId, name: r?.agentName ?? "" }
}

/** Account deletion: the agent's recruit code and list, and their place on their own recruiter's list. */
export async function deleteAgentRecruiting(agentId: string, recruitedBy: string | null | undefined): Promise<void> {
  const code = await redis.get<string>(agentCodeKey(agentId))
  await redis.del(agentCodeKey(agentId), recruitsKey(agentId), ...(code ? [codeKey(String(code))] : []))
  if (recruitedBy) await removeRecruit(recruitedBy, agentId)
}
