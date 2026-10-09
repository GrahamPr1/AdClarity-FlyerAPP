import { Redis } from "@upstash/redis"
import { agentIdForRosterEmail, getAccountAgentId, getRosterRecord } from "./agents-store"

// "Convert to agent account": for a roster email that /agent/start refuses
// because a OneFlyer business account already uses it. An admin converts it
// only when it has NO paid plan (trial or none) and isn't an admin account.
// Converting removes the password and plan, so the email signs in with codes
// like every agent; the account's stored flyers stay. A marker records the
// conversion, after which the agent finishes /agent/start normally and the
// usual agent rules apply once the Agent ID is attached.
//
// Only an email that is CURRENTLY some agent's roster email can be
// converted: a business account that isn't on the roster is never touched.
//
//   client:{email}:converted-to-agent   ConversionRecord
//   nop-account-conversions             ConversionRecord, newest first (audit)

const redis = Redis.fromEnv()

const conversionKey = (email: string) => `client:${email}:converted-to-agent`
const planKey = (email: string) => `client:${email}:plan`
const passwordKey = (email: string) => `client:${email}:passwordHash`
const createdKey = (email: string) => `client:${email}:createdAt`
const adminKey = (email: string) => `client:${email}:isAdmin`
const AUDIT_KEY = "nop-account-conversions"

export const PAID_PLANS = ["basic", "pro"] as const

export interface ConversionRecord {
  email: string
  agentId: string
  /** "owner" for the site owner. */
  by: string
  at: string
  /** The plan the account had ("trial", or null when it had none). */
  priorPlan: string | null
  /** Flyers stored on the account at conversion; they stay stored. */
  flyers: number
}

/**
 * Whether an existing OneFlyer account at this email blocks agent
 * registration. Unconverted: any password, signup record or plan. Converted:
 * only a password or a PAID plan coming back (business pages can re-create a
 * trial plan on their own; that is not someone choosing to be a customer).
 */
export async function businessAccountBlocks(email: string): Promise<boolean> {
  const [pw, created, plan, converted] = await redis.mget<(string | number | null)[]>(passwordKey(email), createdKey(email), planKey(email), conversionKey(email))
  if (converted) return pw !== null || (PAID_PLANS as readonly unknown[]).includes(plan)
  return pw !== null || created !== null || plan !== null
}

export interface BlockedAccount {
  email: string
  /** The roster record this email is the current roster email of, if any. */
  agentId: string | null
  agentName: string | null
  plan: string | null
  isAdmin: boolean
  hasPassword: boolean
  createdAt: string | null
  /** Flyers stored on the account (deliverables). */
  flyers: number
  /** Lifetime flyers generated, when recorded. */
  lifetimeFlyers: number | null
  heldAgentId: string | null
  converted: ConversionRecord | null
  blocks: boolean
  /** Whether "Convert to agent account" is allowed, and if not, why. */
  convertible: boolean
  reason: string | null
}

/** Read-only: everything the admin needs to decide, and whether converting is allowed. */
export async function describeBlockedAccount(email: string): Promise<BlockedAccount> {
  const [plan, pw, created, isAdmin, deliverables, lifetime, converted] = await redis.mget<unknown[]>(
    planKey(email), passwordKey(email), createdKey(email), adminKey(email), `deliverables:${email}`, `client:${email}:lifetimeFlyersCreated`, conversionKey(email),
  )
  const agentId = await agentIdForRosterEmail(email)
  const roster = agentId ? await getRosterRecord(agentId) : null
  const heldAgentId = await getAccountAgentId(email)
  const flyers = Array.isArray((deliverables as { flyers?: unknown[] } | null)?.flyers) ? (deliverables as { flyers: unknown[] }).flyers.length : 0
  const blocks = await businessAccountBlocks(email)
  const planStr = typeof plan === "string" ? plan : null
  const out: BlockedAccount = {
    email,
    agentId: roster ? roster.agentId : null,
    agentName: roster?.agentName ?? null,
    plan: planStr,
    isAdmin: isAdmin === true || isAdmin === "true",
    hasPassword: pw !== null,
    createdAt: created === null ? null : String(created),
    flyers,
    lifetimeFlyers: typeof lifetime === "number" ? lifetime : null,
    heldAgentId,
    converted: (converted as ConversionRecord | null) ?? null,
    blocks,
    convertible: false,
    reason: null,
  }
  out.reason = !roster ? "This email isn't any agent's current roster email, so there is nothing to convert it for."
    : heldAgentId ? `This account already holds Agent ID ${heldAgentId}.`
    : !blocks ? "No business account blocks this email; the agent can finish Get started now."
    : out.isAdmin ? "This is a OneFlyer admin account; it can't be converted."
    : planStr && (PAID_PLANS as readonly string[]).includes(planStr) ? `This account has a paid plan (${planStr}). It stays blocked: contact OneFlyer to resolve it.`
    : null
  out.convertible = out.reason === null
  return out
}

// Atomic: refuses if a paid plan or an Agent ID appeared since the admin looked.
//   KEYS: plan, passwordHash, converted-to-agent, agent-account
//   ARGV: conversion record JSON
const CONVERT = `
local plan = redis.call("GET", KEYS[1])
if plan == "basic" or plan == "pro" then return "paid" end
if redis.call("EXISTS", KEYS[4]) == 1 then return "has_agent_id" end
redis.call("SET", KEYS[3], ARGV[1])
redis.call("DEL", KEYS[1], KEYS[2])
return "ok"`

export type ConvertResult = { ok: true; record: ConversionRecord } | { ok: false; error: string }

export async function convertToAgentAccount(email: string, by: string): Promise<ConvertResult> {
  const info = await describeBlockedAccount(email)
  if (!info.convertible) return { ok: false, error: info.reason ?? "This account can't be converted." }
  const record: ConversionRecord = { email, agentId: info.agentId!, by, at: new Date().toISOString(), priorPlan: info.plan, flyers: info.flyers }
  const out = await redis.eval<string[], string>(CONVERT, [planKey(email), passwordKey(email), conversionKey(email), `agent-account:${email}`], [JSON.stringify(record)])
  if (out === "paid") return { ok: false, error: "This account has a paid plan. It stays blocked: contact OneFlyer to resolve it." }
  if (out === "has_agent_id") return { ok: false, error: "This account already holds an Agent ID." }
  await redis.lpush(AUDIT_KEY, record)
  console.log(`[nop] ${by} converted ${email} to an agent account for Agent ID ${record.agentId} (prior plan ${record.priorPlan ?? "none"}, ${record.flyers} flyers kept)`)
  return { ok: true, record }
}

export async function listConversions(limit = 100): Promise<ConversionRecord[]> {
  return redis.lrange<ConversionRecord>(AUDIT_KEY, 0, limit - 1)
}
