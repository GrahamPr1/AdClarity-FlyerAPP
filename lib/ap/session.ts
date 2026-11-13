import { createHmac, timingSafeEqual } from "node:crypto"
import type { NextResponse } from "next/server"

// The agent platform's own session: a separate cookie with its own signature
// domain, never the OneFlyer session. A platform agent is therefore never an
// SMB account: lib/auth's getSessionIdentity can't read this cookie, and
// this module can't read that one (different name, and the HMAC input is
// prefixed "ap-session.v1." so a OneFlyer token could never verify here even
// with the same secret).
//
// The cookie holds only {agentId, orgId, exp}. Every request re-reads the
// agent record (lib/ap/tenant.ts), so suspending an agent ends access at once.

export const AP_SESSION_COOKIE = "ap_session"
export const AP_SESSION_MAX_AGE = 60 * 60 * 24 * 30

export interface ApSession {
  agentId: string
  orgId: string
  exp: number
}

function secret(): string {
  const s = process.env.SESSION_SECRET
  if (!s || s.length < 16) throw new Error("SESSION_SECRET is not configured")
  return s
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(`ap-session.v1.${payload}`).digest("base64url")
}

export function createApSessionToken(agentId: string, orgId: string, now = Date.now()): string {
  const payload = Buffer.from(JSON.stringify({ agentId, orgId, exp: now + AP_SESSION_MAX_AGE * 1000 })).toString("base64url")
  return `${payload}.${sign(payload)}`
}

export function verifyApSessionToken(token: string | undefined | null, now = Date.now()): ApSession | null {
  if (!token) return null
  const [payload, sig] = token.split(".")
  if (!payload || !sig) return null
  const want = Buffer.from(sign(payload))
  const got = Buffer.from(sig)
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null
  try {
    const s = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as ApSession
    if (typeof s.agentId !== "string" || typeof s.orgId !== "string" || typeof s.exp !== "number" || now > s.exp) return null
    return s
  } catch {
    return null
  }
}

type CookieReader = { get(name: string): { value: string } | undefined }

export function readApSession(cookies: CookieReader): ApSession | null {
  return verifyApSessionToken(cookies.get(AP_SESSION_COOKIE)?.value)
}

export function setApSessionCookie(res: NextResponse, agentId: string, orgId: string): void {
  res.cookies.set(AP_SESSION_COOKIE, createApSessionToken(agentId, orgId), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: AP_SESSION_MAX_AGE,
  })
}

export function clearApSessionCookie(res: NextResponse): void {
  res.cookies.set(AP_SESSION_COOKIE, "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 0 })
}
