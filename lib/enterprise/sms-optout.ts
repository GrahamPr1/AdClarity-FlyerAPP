import { Redis } from "@upstash/redis"
import type { LeadRecord } from "@/lib/types"

// The SMS opt-out list (groundwork: nothing sends text messages yet). Any
// future texting must go only to a lead who ticked the separate text-message
// consent (LeadRecord.smsConsent.agreed) for that same phone number, and whose
// number is not on this list: canText() is the one check.
//
// Numbers are US numbers stored as +1 and ten digits. Add-only: an admin adds
// a number (someone asked to stop, by phone, email or a STOP reply); nothing
// takes one off, so an opt-out can't be undone by mistake.
//
//   nop-sms-optout        hash: +1XXXXXXXXXX -> SmsOptOut
//   nop-sms-optout-log    list, newest first, kept: every add

const redis = Redis.fromEnv()
const KEY = "nop-sms-optout"
const LOG_KEY = "nop-sms-optout-log"
export const MAX_OPT_OUT_NOTE = 200

export interface SmsOptOut {
  phone: string
  at: string
  by: string
  note: string | null
}

/** "(270) 555-0100", "270.555.0100", "+1 270 555 0100" -> "+12705550100"; anything else -> null. */
export function normalizeUsPhone(raw: string): string | null {
  let d = raw.replace(/\D/g, "")
  if (d.length === 11 && d.startsWith("1")) d = d.slice(1)
  return d.length === 10 && /^[2-9]/.test(d) ? `+1${d}` : null
}

export async function isSmsOptedOut(phone: string): Promise<boolean> {
  const p = normalizeUsPhone(phone)
  return p ? (await redis.hget(KEY, p)) !== null : false
}

export type AddOptOut = { ok: true; optOut: SmsOptOut; already: boolean } | { ok: false; reason: "invalid_phone" }

export async function addSmsOptOut(phone: string, by: string, note: string | null): Promise<AddOptOut> {
  const p = normalizeUsPhone(phone)
  if (!p) return { ok: false, reason: "invalid_phone" }
  const existing = await redis.hget<SmsOptOut>(KEY, p)
  if (existing) return { ok: true, optOut: existing, already: true }
  const optOut: SmsOptOut = { phone: p, at: new Date().toISOString(), by, note: note?.trim().slice(0, MAX_OPT_OUT_NOTE) || null }
  await redis.hset(KEY, { [p]: optOut })
  await redis.lpush(LOG_KEY, optOut)
  return { ok: true, optOut, already: false }
}

export async function listSmsOptOuts(): Promise<SmsOptOut[]> {
  const all = (await redis.hgetall<Record<string, SmsOptOut>>(KEY)) ?? {}
  return Object.values(all).sort((a, b) => b.at.localeCompare(a.at))
}

/** The numbers among these that are opted out (normalized), for the Leads tab. */
export async function optedOutAmong(phones: string[]): Promise<Set<string>> {
  const norm = [...new Set(phones.map(normalizeUsPhone).filter((p): p is string => !!p))]
  if (norm.length === 0) return new Set()
  const all = (await redis.hgetall<Record<string, unknown>>(KEY)) ?? {}
  return new Set(norm.filter((p) => p in all))
}

/**
 * The only test any future text message must pass: this lead agreed to texts,
 * for this same number, and the number isn't opted out.
 */
export async function canText(lead: Pick<LeadRecord, "phone" | "smsConsent">): Promise<boolean> {
  const c = lead.smsConsent
  if (!c?.agreed) return false
  const consented = normalizeUsPhone(c.phone)
  if (!consented || consented !== normalizeUsPhone(lead.phone)) return false
  return !(await isSmsOptedOut(consented))
}
