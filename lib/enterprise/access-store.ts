import { Redis } from "@upstash/redis"
import { createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto"

// Passwordless access for NOP agents: the in-progress state of a
// "first time" registration or a "returning" sign-in, before there is a
// session. Keyed by an opaque random flow id held in an httpOnly cookie.
//
//   nop-access:{flowId}                 FlowState, 15 min TTL (never extended)
//   nop-code-day:email:{email}:{date}   codes sent to that inbox today
//   nop-code-day:agent:{agentId}:{date} codes sent for that Agent ID today
//
// Codes: 6 digits, stored only as sha256(flowId:code), compared in
// constant time, single-use (the hash is dropped the moment one matches),
// at most 5 wrong tries, at most 5 resends, 60 s between sends, and a
// daily cap per inbox and per Agent ID so nobody can flood an agent.

const redis = Redis.fromEnv()

export const FLOW_COOKIE = "nop_flow"
export const FLOW_TTL_SECONDS = 15 * 60
export const MAX_CODE_ATTEMPTS = 5
export const MAX_RESENDS = 5
export const RESEND_COOLDOWN_SECONDS = 60
export const DAILY_CODES_PER_EMAIL = 10
export const DAILY_CODES_PER_AGENT_ID = 10

export interface FlowState {
  kind: "register" | "signin"
  /** register: the Agent ID being claimed. signin: the ID the account holds. */
  agentId?: string
  /** The inbox the code went to (always the CURRENT roster email for register). */
  sendTo?: string
  /** signin: the OneFlyer account the session will be for. */
  account?: string
  /** null once used, and for a neutral sign-in reply that sent nothing. */
  codeHash: string | null
  attempts: number
  resends: number
  lastSentAt: number
  step: "code" | "verified"
  createdAt: number
}

const flowKey = (id: string) => `nop-access:${id}`

export function newFlowId(): string {
  return randomBytes(32).toString("base64url")
}

export function newCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0")
}

export function hashCode(flowId: string, code: string): string {
  return createHash("sha256").update(`${flowId}:${code}`).digest("hex")
}

/** Constant-time comparison of a typed code against the stored hash. */
export function codeMatches(flowId: string, typed: string, storedHash: string | null): boolean {
  if (!storedHash || !/^\d{6}$/.test(typed)) return false
  const a = Buffer.from(hashCode(flowId, typed), "hex")
  const b = Buffer.from(storedHash, "hex")
  return a.length === b.length && timingSafeEqual(a, b)
}

export async function getFlow(id: string | undefined | null): Promise<FlowState | null> {
  if (!id || !/^[A-Za-z0-9_-]{20,}$/.test(id)) return null
  return (await redis.get<FlowState>(flowKey(id))) ?? null
}

/** Creates a flow with the full TTL. */
export async function createFlow(id: string, state: FlowState): Promise<void> {
  await redis.set(flowKey(id), state, { ex: FLOW_TTL_SECONDS })
}

/** Updates a flow WITHOUT extending its life: the 15 minutes run from the start. */
export async function updateFlow(id: string, state: FlowState): Promise<void> {
  const remaining = Math.ceil((state.createdAt + FLOW_TTL_SECONDS * 1000 - Date.now()) / 1000)
  if (remaining <= 0) {
    await redis.del(flowKey(id))
    return
  }
  await redis.set(flowKey(id), state, { ex: remaining })
}

export async function deleteFlow(id: string): Promise<void> {
  await redis.del(flowKey(id))
}

const today = () => new Date().toISOString().slice(0, 10)

/**
 * Reserves one send against the daily caps for this inbox and Agent ID.
 * Returns false (and reserves nothing) when either cap is already reached.
 */
export async function reserveDailySend(email: string, agentId: string): Promise<boolean> {
  const d = today()
  const ek = `nop-code-day:email:${email}:${d}`
  const ak = `nop-code-day:agent:${agentId}:${d}`
  const [e, a] = await Promise.all([redis.incr(ek), redis.incr(ak)])
  await Promise.all([redis.expire(ek, 2 * 86400), redis.expire(ak, 2 * 86400)])
  if (e > DAILY_CODES_PER_EMAIL || a > DAILY_CODES_PER_AGENT_ID) {
    await Promise.all([redis.decr(ek), redis.decr(ak)])
    return false
  }
  return true
}

/**
 * True when this email already has a OneFlyer account of any kind: a
 * password, a recorded signup, or a plan. A business customer always has
 * at least one of these.
 */
export async function oneFlyerAccountExists(email: string): Promise<boolean> {
  const n = await redis.exists(`client:${email}:passwordHash`, `client:${email}:createdAt`, `client:${email}:plan`)
  return n > 0
}
