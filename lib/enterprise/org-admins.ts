import { Redis } from "@upstash/redis"
import { NextRequest, NextResponse } from "next/server"
import { createScopedToken, getSessionIdentity, verifyScopedToken } from "@/lib/auth"
import { isAdminSession } from "@/lib/admin"

// NOP org admins: Basic Benefits staff the site owner invites by email. They
// sign in with an emailed code and can use /admin/enterprise/nop and the
// /api/admin/enterprise/nop/* routes that console calls — nothing else.
//
// Their session is a separate cookie holding a purpose-scoped token (see
// createScopedToken), NOT the dashboard session: an org admin has no
// business-customer identity at all, so no business page or other admin
// route can ever treat them as a client or an admin. Every request also
// re-checks the stored record, so removing an org admin signs them out at
// once.
//
//   nop-org-admin:{email}   OrgAdminRecord
//   nop-org-admins          set of emails
//   nop-admin-actions       audit list, newest first (never trimmed)

const redis = Redis.fromEnv()

import { ORG_ADMIN_COOKIE, ORG_ADMIN_PURPOSE } from "./org-admin-constants"
export { ORG_ADMIN_COOKIE, ORG_ADMIN_PURPOSE }
export const ORG_ADMIN_SESSION_SECONDS = 8 * 60 * 60
export const ORG_ADMIN_FLOW_COOKIE = "nop_admin_flow"

const recordKey = (email: string) => `nop-org-admin:${email}`
const SET_KEY = "nop-org-admins"
const AUDIT_KEY = "nop-admin-actions"

export interface OrgAdminRecord {
  email: string
  invitedBy: string
  invitedAt: string
  lastSignInAt: string | null
  /** Sessions issued before this (epoch ms) are invalid: set by signing out, so a copied cookie dies too. */
  sessionsValidAfter?: number
}

export async function getOrgAdmin(email: string): Promise<OrgAdminRecord | null> {
  return (await redis.get<OrgAdminRecord>(recordKey(email))) ?? null
}

export async function listOrgAdmins(): Promise<OrgAdminRecord[]> {
  const emails = (await redis.smembers(SET_KEY)).map(String).sort()
  if (emails.length === 0) return []
  const records = await redis.mget<(OrgAdminRecord | null)[]>(...emails.map(recordKey))
  return records.filter((r): r is OrgAdminRecord => r !== null)
}

/** Adds an org admin. Returns false when the email already is one. */
export async function addOrgAdmin(email: string, invitedBy: string): Promise<boolean> {
  const record: OrgAdminRecord = { email, invitedBy, invitedAt: new Date().toISOString(), lastSignInAt: null }
  const created = await redis.set(recordKey(email), record, { nx: true })
  if (!created) return false
  await redis.sadd(SET_KEY, email)
  return true
}

export async function removeOrgAdmin(email: string): Promise<boolean> {
  const [n] = await Promise.all([redis.del(recordKey(email)), redis.srem(SET_KEY, email)])
  return n > 0
}

export async function touchOrgAdminSignIn(email: string): Promise<void> {
  const record = await getOrgAdmin(email)
  if (record) await redis.set(recordKey(email), { ...record, lastSignInAt: new Date().toISOString() }, { xx: true })
}

// ---- Audit ------------------------------------------------------------------

export interface NopAdminAction {
  /** "owner" for the site owner, else the org admin's email. */
  actor: string
  action: string
  detail: string
  at: string
}

export async function recordNopAdminAction(actor: string, action: string, detail: string): Promise<void> {
  const entry: NopAdminAction = { actor, action, detail, at: new Date().toISOString() }
  await redis.lpush(AUDIT_KEY, entry)
}

export async function listNopAdminActions(limit = 200): Promise<NopAdminAction[]> {
  return redis.lrange<NopAdminAction>(AUDIT_KEY, 0, limit - 1)
}

// ---- Session ------------------------------------------------------------------

export function orgAdminCookieOptions(maxAge: number) {
  return { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, maxAge, path: "/" }
}

export async function setOrgAdminSession(res: NextResponse, email: string): Promise<void> {
  const token = await createScopedToken(ORG_ADMIN_PURPOSE, { email, iat: String(Date.now()) }, ORG_ADMIN_SESSION_SECONDS)
  res.cookies.set(ORG_ADMIN_COOKIE, token, orgAdminCookieOptions(ORG_ADMIN_SESSION_SECONDS))
}

export function clearOrgAdminSession(res: NextResponse): void {
  res.cookies.set(ORG_ADMIN_COOKIE, "", orgAdminCookieOptions(0))
}

type CookieReader = { cookies: { get(name: string): { value: string } | undefined } }

/** The signed-in org admin's email, only while they are still an org admin and haven't signed out since. */
export async function getOrgAdminSession(request: CookieReader): Promise<string | null> {
  const claims = await verifyScopedToken(ORG_ADMIN_PURPOSE, request.cookies.get(ORG_ADMIN_COOKIE)?.value)
  if (!claims?.email) return null
  const record = await getOrgAdmin(claims.email)
  if (!record) return null
  if (record.sessionsValidAfter && !(Number(claims.iat) > record.sessionsValidAfter)) return null
  return claims.email
}

/** Signing out ends every session that admin has, not just this browser's cookie. */
export async function revokeOrgAdminSessions(email: string): Promise<void> {
  const record = await getOrgAdmin(email)
  if (record) await redis.set(recordKey(email), { ...record, sessionsValidAfter: Date.now() }, { xx: true })
}

/**
 * Who may use the NOP admin console: the site owner (an admin dashboard
 * session) or a current org admin. The owner wins when both cookies exist.
 */
export async function nopConsoleActor(request: CookieReader): Promise<{ actor: string; isOwner: boolean } | null> {
  const session = await getSessionIdentity(request)
  if (session && (await isAdminSession(session.sub))) return { actor: "owner", isOwner: true }
  const email = await getOrgAdminSession(request)
  return email ? { actor: email, isOwner: false } : null
}

/** For /api/admin/enterprise/nop/* routes: the actor, or the 401 to return. */
export async function requireNopConsole(request: NextRequest): Promise<{ actor: string; isOwner: boolean } | { response: NextResponse }> {
  const who = await nopConsoleActor(request)
  return who ?? { response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }
}
