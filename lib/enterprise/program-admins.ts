import { Redis } from "@upstash/redis"
import { NextResponse, type NextRequest } from "next/server"
import { getSessionIdentity } from "@/lib/auth"
import { isAdminSession } from "@/lib/admin"

// Program admins: people the site owner names to run the Neighborhood
// Outreach Program in OneFlyer (sign-up approvals, agents, tiers, the org's
// feature switches, enrollment setting, flyers, approved wording, lead
// deletion). Nothing else: no business customers, their campaigns, leads or
// billing, no Stripe or billing activity, no other org, no site settings.
//
// They sign in at /program with an emailed code. Their session is its own
// cookie with its own signature (prefix "program-admin."), with no `sub`, so
// it can never pass as a dashboard or owner session, nor one as this. Every
// request re-checks the stored record: removing a program admin, or signing
// out, ends their access at once.
//
//   program-admins:nop      hash, email -> ProgramAdminRecord (owner-managed)
//   nop-admin-actions       every NOP admin action, newest first (owner and program admins)

const redis = Redis.fromEnv()
const ADMINS_KEY = "program-admins:nop"
const ACTIONS_KEY = "nop-admin-actions"

export const PROGRAM_ADMIN_COOKIE = "nop_program_admin"
export const PROGRAM_ADMIN_FLOW_COOKIE = "nop_program_admin_flow"
export const PROGRAM_ADMIN_SESSION_SECONDS = 8 * 60 * 60

export interface ProgramAdminRecord {
  email: string
  name: string
  addedBy: string
  addedAt: string
  lastSignInAt: string | null
  /** Sessions issued before this (ms) are invalid: set on sign-out, so a copied cookie dies too. */
  sessionsValidAfter: number
}

export async function getProgramAdmin(email: string): Promise<ProgramAdminRecord | null> {
  return (await redis.hget<ProgramAdminRecord>(ADMINS_KEY, email)) ?? null
}

export async function listProgramAdmins(): Promise<ProgramAdminRecord[]> {
  const all = (await redis.hgetall<Record<string, ProgramAdminRecord>>(ADMINS_KEY)) ?? {}
  return Object.values(all).sort((a, b) => a.email.localeCompare(b.email))
}

export async function addProgramAdmin(email: string, name: string, addedBy: string): Promise<ProgramAdminRecord> {
  const record: ProgramAdminRecord = { email, name, addedBy, addedAt: new Date().toISOString(), lastSignInAt: null, sessionsValidAfter: 0 }
  await redis.hset(ADMINS_KEY, { [email]: record })
  await logNopAdminAction({ actor: addedBy, actorName: null, role: "owner", action: "program_admin.add", detail: `${name} <${email}>` })
  return record
}

export async function removeProgramAdmin(email: string, removedBy: string): Promise<boolean> {
  const n = await redis.hdel(ADMINS_KEY, email)
  if (n) await logNopAdminAction({ actor: removedBy, actorName: null, role: "owner", action: "program_admin.remove", detail: email })
  return n > 0
}

async function updateProgramAdmin(email: string, patch: Partial<ProgramAdminRecord>): Promise<void> {
  const record = await getProgramAdmin(email)
  if (record) await redis.hset(ADMINS_KEY, { [email]: { ...record, ...patch } })
}

export const touchProgramAdminSignIn = (email: string) => updateProgramAdmin(email, { lastSignInAt: new Date().toISOString() })
/** Ends every session issued so far (sign-out). */
export const endProgramAdminSessions = (email: string) => updateProgramAdmin(email, { sessionsValidAfter: Date.now() })

// ---- Session token --------------------------------------------------------------

interface ProgramAdminPayload {
  kind: "program-admin"
  email: string
  iat: number
  exp: number
}

async function hmac(data: string): Promise<string> {
  const secret = process.env.SESSION_SECRET
  if (!secret) throw new Error("SESSION_SECRET is not set")
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"])
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`program-admin.${data}`))
  return Buffer.from(sig).toString("base64url")
}

export async function createProgramAdminToken(email: string, now = Date.now()): Promise<string> {
  const payload: ProgramAdminPayload = { kind: "program-admin", email, iat: now, exp: now + PROGRAM_ADMIN_SESSION_SECONDS * 1000 }
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url")
  return `${body}.${await hmac(body)}`
}

async function verifyProgramAdminToken(token: string | undefined, now = Date.now()): Promise<ProgramAdminPayload | null> {
  if (!token) return null
  const [body, sig] = token.split(".")
  if (!body || !sig || (await hmac(body)) !== sig) return null
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as ProgramAdminPayload
    return p.kind === "program-admin" && p.email && p.exp > now ? p : null
  } catch {
    return null
  }
}

export function programAdminCookieOptions(maxAge: number) {
  return { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, maxAge, path: "/" }
}

type CookieReader = { cookies: { get(name: string): { value: string } | undefined } }

/** The signed-in program admin (cookie valid, still listed, not signed out since), or null. */
export async function programAdminFrom(req: CookieReader): Promise<ProgramAdminRecord | null> {
  const p = await verifyProgramAdminToken(req.cookies.get(PROGRAM_ADMIN_COOKIE)?.value)
  if (!p) return null
  const record = await getProgramAdmin(p.email)
  if (!record || p.iat < record.sessionsValidAfter) return null
  return record
}

// ---- Who may use the NOP admin screens ---------------------------------------------

export interface NopAdmin {
  /** The account's email: the owner's admin login, or the program admin's. */
  admin: string
  /** For logs: the program admin's name; null for the owner. */
  name: string | null
  role: "owner" | "program"
}

/** The owner (a OneFlyer admin session) or a signed-in program admin. */
export async function nopAdminFrom(req: CookieReader): Promise<NopAdmin | null> {
  const session = await getSessionIdentity(req)
  if (session && (await isAdminSession(session.sub))) return { admin: session.sub, name: null, role: "owner" }
  const pa = await programAdminFrom(req)
  return pa ? { admin: pa.email, name: pa.name, role: "program" } : null
}

/** For the NOP admin API routes Quinn may use: the admin, or the 401 to return. */
export async function requireNopAdmin(request: NextRequest): Promise<NopAdmin | { response: NextResponse }> {
  const who = await nopAdminFrom(request)
  return who ?? { response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }
}

// ---- Audit ----------------------------------------------------------------------------

export interface NopAdminAction {
  at: string
  actor: string
  actorName: string | null
  role: "owner" | "program"
  action: string
  detail: string
}

export async function logNopAdminAction(entry: Omit<NopAdminAction, "at">): Promise<void> {
  await redis.lpush(ACTIONS_KEY, { ...entry, at: new Date().toISOString() })
  console.log(`[nop-admin] ${entry.actorName ? `${entry.actorName} <${entry.actor}>` : entry.actor} ${entry.action} ${entry.detail}`)
}

/** Shorthand for a route: log what this admin just did. */
export function audit(who: NopAdmin, action: string, detail: string): Promise<void> {
  return logNopAdminAction({ actor: who.admin, actorName: who.name, role: who.role, action, detail })
}

export async function listNopAdminActions(limit = 100): Promise<NopAdminAction[]> {
  return redis.lrange<NopAdminAction>(ACTIONS_KEY, 0, limit - 1)
}
