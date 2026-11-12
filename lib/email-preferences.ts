import { createHmac, timingSafeEqual } from "node:crypto"
import { Redis } from "@upstash/redis"
import { getSiteUrl } from "@/lib/site-url"

/**
 * Account-level email preferences, and the signed one-click unsubscribe every
 * public email carries.
 *
 * One record per account (email-prefs:v1:<email>), read on every send — so a
 * change on /profile, or an unsubscribe click, applies to the very next email.
 * Defaults are what was sent before preferences existed: an account that has
 * never chosen still gets each new lead as it arrives.
 *
 * Unsubscribe links are signed (HMAC-SHA256 with SESSION_SECRET), not
 * session-bound: they have to work from a mail client where nobody is signed
 * in, and must not let anyone switch off someone else's email by editing the
 * address in the URL. Two entry points, per RFC 8058:
 *   - List-Unsubscribe + List-Unsubscribe-Post headers: the mail client's own
 *     "Unsubscribe" button POSTs, and it takes effect at once.
 *   - The link in the email body opens /unsubscribe, which asks for a click
 *     before acting — a GET must never unsubscribe, because mail security
 *     scanners open every link in every message.
 */

const redis = Redis.fromEnv()

/** Each kind of public email someone can switch off on its own. */
export const EMAIL_CATEGORIES = ["leads"] as const
export type EmailCategory = (typeof EMAIL_CATEGORIES)[number]

/** How new-lead emails arrive: each one as it comes in, one daily digest (lib/lead-digest.ts), or none. */
export type LeadEmailMode = "instant" | "daily" | "off"
export const LEAD_EMAIL_MODES: LeadEmailMode[] = ["instant", "daily", "off"]

/**
 * Whether the daily lead digest actually sends (PUBLIC_DIGEST_LIVE=1). Until
 * it does, "Once a day" is neither offered nor honoured — a lead queued for a
 * digest that never goes out would be a lead nobody is told about. The
 * monthly results email has a switch of its own.
 */
export function digestLive(): boolean {
  return process.env.PUBLIC_DIGEST_LIVE === "1"
}

export interface EmailPreferences {
  leads: LeadEmailMode
  updatedAt: string | null
}

export const DEFAULT_EMAIL_PREFERENCES: EmailPreferences = { leads: "instant", updatedAt: null }

/** What each category is called wherever a person sees it. */
export const CATEGORY_LABEL: Record<EmailCategory, string> = {
  leads: "new-lead emails",
}

const key = (email: string) => `email-prefs:v1:${email.trim().toLowerCase()}`

export async function getEmailPreferences(email: string): Promise<EmailPreferences> {
  const stored = await redis.get<Partial<EmailPreferences>>(key(email)).catch(() => null)
  return { ...DEFAULT_EMAIL_PREFERENCES, ...(stored ?? {}) }
}

export async function setEmailPreferences(email: string, patch: Partial<Omit<EmailPreferences, "updatedAt">>): Promise<EmailPreferences> {
  const next: EmailPreferences = { ...(await getEmailPreferences(email)), ...patch, updatedAt: new Date().toISOString() }
  await redis.set(key(email), next)
  return next
}

/** The "off" value for a category. */
export function unsubscribedPatch(category: EmailCategory): Partial<Omit<EmailPreferences, "updatedAt">> {
  switch (category) {
    case "leads":
      return { leads: "off" }
  }
}

/* --------------------------------- Signing --------------------------------- */

function secret(): string {
  const s = process.env.SESSION_SECRET
  if (!s) throw new Error("SESSION_SECRET is not set")
  return s
}

const b64url = (v: Buffer | string) => Buffer.from(v).toString("base64url")

export function unsubscribeToken(email: string, category: EmailCategory): string {
  return createHmac("sha256", secret()).update(`email-unsubscribe:v1|${email.trim().toLowerCase()}|${category}`).digest("base64url")
}

/** The email and category a signed link names, or null if the signature doesn't match. */
export function verifyUnsubscribe(params: { e?: string | null; c?: string | null; t?: string | null }): { email: string; category: EmailCategory } | null {
  if (!params.e || !params.c || !params.t) return null
  if (!(EMAIL_CATEGORIES as readonly string[]).includes(params.c)) return null
  let email: string
  try {
    email = Buffer.from(params.e, "base64url").toString("utf8").trim().toLowerCase()
  } catch {
    return null
  }
  if (!email.includes("@")) return null
  const category = params.c as EmailCategory
  const expected = Buffer.from(unsubscribeToken(email, category))
  const given = Buffer.from(params.t)
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null
  return { email, category }
}

function signedQuery(email: string, category: EmailCategory): string {
  return `e=${b64url(email.trim().toLowerCase())}&c=${category}&t=${unsubscribeToken(email, category)}`
}

/** The confirmation page linked from the email body (a GET never unsubscribes). */
export function unsubscribePageUrl(email: string, category: EmailCategory): string {
  return `${getSiteUrl()}/unsubscribe?${signedQuery(email, category)}`
}

/** The RFC 8058 one-click endpoint, for the List-Unsubscribe header. */
export function oneClickUnsubscribeUrl(email: string, category: EmailCategory): string {
  return `${getSiteUrl()}/api/email/unsubscribe?${signedQuery(email, category)}`
}

/** Headers that give the mail client its own working "Unsubscribe" button. */
export function listUnsubscribeHeaders(email: string, category: EmailCategory): Record<string, string> {
  return {
    "List-Unsubscribe": `<${oneClickUnsubscribeUrl(email, category)}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  }
}

/** The footer every public email ends with. */
export function unsubscribeFooterHtml(email: string, category: EmailCategory): string {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;")
  return (
    `<p style="color:#888;font-size:12px;margin-top:24px">` +
    `You're getting this because ${CATEGORY_LABEL[category]} are on for ${esc(email)}. ` +
    `<a href="${esc(unsubscribePageUrl(email, category))}" style="color:#888">Unsubscribe from ${CATEGORY_LABEL[category]}</a>` +
    ` · <a href="${esc(`${getSiteUrl()}/profile#emails`)}" style="color:#888">Email settings</a></p>`
  )
}
