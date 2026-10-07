import { NextRequest, NextResponse } from "next/server"
import { ADMIN_SUB, getSessionIdentity } from "@/lib/auth"
import { checkRateLimit, clientIp } from "@/lib/rate-limit"
import { tNop, type NopLang } from "./nop-i18n"

/**
 * The signed-in client account for an agent-facing route, or the response to
 * return instead. Admin has no "own" account to register.
 */
export async function requireClientSession(request: NextRequest): Promise<{ email: string } | { response: NextResponse }> {
  const session = await getSessionIdentity(request)
  if (!session || session.sub === ADMIN_SUB) {
    return { response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }
  }
  return { email: session.sub }
}

/**
 * Per-account and per-IP throttle for registration steps. Agent IDs are short
 * digit strings and step (a) must say whether one exists, so without this the
 * roster could be enumerated.
 */
export async function registrationRateLimit(request: NextRequest, email: string, step: string, lang: NopLang = "en"): Promise<NextResponse | null> {
  const [byAccount, byIp] = await Promise.all([
    checkRateLimit(`nop-reg:${step}:acct:${email}`, 10, 15 * 60),
    checkRateLimit(`nop-reg:${step}:ip:${clientIp(request.headers)}`, 30, 15 * 60),
  ])
  const blocked = !byAccount.allowed ? byAccount : !byIp.allowed ? byIp : null
  if (!blocked) return null
  return NextResponse.json(
    { error: "rate_limited", message: tNop(lang, "err.rate_limited") },
    { status: 429, headers: { "Retry-After": String(blocked.retryAfterSeconds) } },
  )
}
