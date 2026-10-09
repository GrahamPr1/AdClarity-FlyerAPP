import { NextRequest, NextResponse } from "next/server"
import { createSessionToken, SESSION_COOKIE, SESSION_MAX_AGE_SECONDS } from "@/lib/auth"
import { checkRateLimit, clientIp } from "@/lib/rate-limit"
import { tNop, type NopLang, type NopStringKey } from "./nop-i18n"
import { FLOW_COOKIE, FLOW_TTL_SECONDS, getFlow, type FlowState } from "./access-store"

// HTTP plumbing shared by the /api/enterprise/nop/access/* routes.

export const secureCookies = () => process.env.NODE_ENV === "production"

export async function readFlow(request: NextRequest): Promise<{ id: string; state: FlowState } | null> {
  const id = request.cookies.get(FLOW_COOKIE)?.value
  const state = await getFlow(id)
  // Agent routes only: an org-admin sign-in flow is never valid here.
  return id && state && state.kind !== "org-admin" ? { id, state } : null
}

export function setFlowCookie(res: NextResponse, id: string) {
  res.cookies.set(FLOW_COOKIE, id, { httpOnly: true, secure: secureCookies(), sameSite: "lax", maxAge: FLOW_TTL_SECONDS, path: "/" })
}

export function clearFlowCookie(res: NextResponse) {
  res.cookies.set(FLOW_COOKIE, "", { httpOnly: true, secure: secureCookies(), sameSite: "lax", maxAge: 0, path: "/" })
}

/** The same session cookie a password sign-in sets (see /api/auth/client-login). */
export async function setSessionCookie(res: NextResponse, account: string) {
  res.cookies.set(SESSION_COOKIE, await createSessionToken(account), {
    httpOnly: true,
    secure: secureCookies(),
    sameSite: "lax",
    maxAge: SESSION_MAX_AGE_SECONDS,
    path: "/",
  })
}

/** A JSON error whose message is in the visitor's language. */
export function fail(lang: NopLang, status: number, error: string, key: NopStringKey, vars?: Record<string, string>, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ error, message: tNop(lang, key, vars), ...extra }, { status })
}

/** Per-IP plus per-subject (Agent ID or email) throttle for one step. */
export async function accessRateLimit(request: NextRequest, step: string, subject: string, lang: NopLang): Promise<NextResponse | null> {
  const [byIp, bySubject] = await Promise.all([
    checkRateLimit(`nop-access:${step}:ip:${clientIp(request.headers)}`, 30, 15 * 60),
    checkRateLimit(`nop-access:${step}:sub:${subject}`, 10, 15 * 60),
  ])
  const blocked = !byIp.allowed ? byIp : !bySubject.allowed ? bySubject : null
  if (!blocked) return null
  const res = fail(lang, 429, "rate_limited", "err.rate_limited")
  res.headers.set("Retry-After", String(blocked.retryAfterSeconds))
  return res
}
