import { Redis } from "@upstash/redis"
import { createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto"
import type { SignupInput } from "./validate"

// Passwordless sign-up and sign-in for platform agents: a 6-digit code to the
// agent's email, before any session exists. Same rules as NOP's flows (copied,
// not shared), on ap: keys only:
//
//   ap:access:{flowId}             FlowState, 15 min TTL (never extended)
//   ap:code-day:{email}:{date}     codes sent to that inbox today (cap 10)
//
// The code is stored only as sha256(flowId:code), compared in constant time,
// single-use, at most 5 wrong tries. A flow is bound to ONE org: a code
// started on org A's page can never finish on org B's.

const redis = Redis.fromEnv()

export const AP_FLOW_COOKIE = "ap_flow"
export const FLOW_TTL_SECONDS = 15 * 60
export const MAX_ATTEMPTS = 5
export const DAILY_CODES_PER_EMAIL = 10

const flowKey = (id: string) => `ap:access:${id}`
const dayKey = (email: string, now: Date) => `ap:code-day:${email}:${now.toISOString().slice(0, 10)}`

export interface FlowState {
  kind: "signup" | "signin"
  orgId: string
  email: string
  /** signup: everything entered, held until the code proves the inbox. */
  signup?: Omit<SignupInput, "ref"> & { recruiterAgentId: string | null }
  /** null for a neutral sign-in reply that sent nothing (unknown email), and once used. */
  codeHash: string | null
  attempts: number
}

/** At most 30 code requests per IP per hour, across all orgs (ap:rl:ip:{ip}:{hour}). */
export async function ipAllowed(ip: string, now = new Date()): Promise<boolean> {
  const k = `ap:rl:ip:${ip.replace(/[^0-9a-fA-F:.]/g, "").slice(0, 45)}:${now.toISOString().slice(0, 13)}`
  const n = await redis.incr(k)
  if (n === 1) await redis.expire(k, 60 * 60 * 2)
  return n <= 30
}

const hash = (flowId: string, code: string) => createHash("sha256").update(`${flowId}:${code}`).digest("hex")

/** Starts a flow. `sendCode` false = the neutral reply (nothing sent, but it looks the same). Returns the flow id and the code to email. */
export async function startFlow(state: Omit<FlowState, "codeHash" | "attempts">, sendCode: boolean, now = new Date()): Promise<{ flowId: string; code: string | null } | { error: "daily_limit" }> {
  if (sendCode) {
    const k = dayKey(state.email, now)
    const n = await redis.incr(k)
    if (n === 1) await redis.expire(k, 60 * 60 * 26)
    if (n > DAILY_CODES_PER_EMAIL) return { error: "daily_limit" }
  }
  const flowId = randomBytes(24).toString("base64url")
  const code = sendCode ? String(randomInt(0, 1_000_000)).padStart(6, "0") : null
  const full: FlowState = { ...state, codeHash: code ? hash(flowId, code) : null, attempts: 0 }
  await redis.set(flowKey(flowId), JSON.stringify(full), { ex: FLOW_TTL_SECONDS })
  return { flowId, code }
}

export type VerifyResult = { ok: true; state: FlowState } | { ok: false; error: "expired" | "wrong_code" | "too_many" | "wrong_org" }

/** Checks a code against the flow. On success the flow is deleted (single use). */
export async function verifyFlow(flowId: string | undefined, orgId: string, code: string): Promise<VerifyResult> {
  if (!flowId || !/^[A-Za-z0-9_-]{20,64}$/.test(flowId)) return { ok: false, error: "expired" }
  const raw = await redis.get(flowKey(flowId))
  const state = (typeof raw === "string" ? JSON.parse(raw) : raw) as FlowState | null
  if (!state) return { ok: false, error: "expired" }
  if (state.orgId !== orgId) return { ok: false, error: "wrong_org" }
  if (state.attempts >= MAX_ATTEMPTS) return { ok: false, error: "too_many" }
  const good = state.codeHash !== null && /^\d{6}$/.test(code) && timingSafeEqual(Buffer.from(state.codeHash), Buffer.from(hash(flowId, code)))
  if (!good) {
    const ttl = await redis.ttl(flowKey(flowId))
    await redis.set(flowKey(flowId), JSON.stringify({ ...state, attempts: state.attempts + 1 }), { ex: Math.max(ttl, 1) })
    return { ok: false, error: state.attempts + 1 >= MAX_ATTEMPTS ? "too_many" : "wrong_code" }
  }
  await redis.del(flowKey(flowId))
  return { ok: true, state }
}
