import { NextRequest, NextResponse } from "next/server"
import { createSessionToken, ADMIN_SUB, SESSION_COOKIE, SESSION_MAX_AGE_SECONDS } from "@/lib/auth"
import { checkRateLimit, clientIp } from "@/lib/rate-limit"

// This route guards ADMIN_SUB — the single site-owner credential that can
// change any client's plan, grant admin to other accounts, and act on any
// user's data. It compares a plaintext env var with no KDF cost, so an
// unthrottled attacker could guess at whatever rate the network allows.
// 8 attempts per 10 minutes per IP is generous for a human who has genuinely
// forgotten the password and useless for automation.
const MAX_ATTEMPTS = 8
const WINDOW_SECONDS = 600

export async function POST(req: NextRequest) {
  const ip = clientIp(req.headers)
  const { allowed, retryAfterSeconds } = await checkRateLimit(`admin-login:${ip}`, MAX_ATTEMPTS, WINDOW_SECONDS)
  if (!allowed) {
    return NextResponse.json(
      { error: "Too many attempts. Please wait a few minutes and try again." },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } },
    )
  }

  // Previously unguarded — a malformed body threw and surfaced as a 500.
  let password: unknown
  try {
    ;({ password } = await req.json())
  } catch {
    return NextResponse.json({ error: "Invalid password" }, { status: 401 })
  }

  if (!process.env.DASHBOARD_PASSWORD) {
    return NextResponse.json({ error: "Server not configured" }, { status: 500 })
  }

  if (typeof password !== "string" || password !== process.env.DASHBOARD_PASSWORD) {
    // Same error for wrong password vs missing field — don't leak which.
    return NextResponse.json({ error: "Invalid password" }, { status: 401 })
  }

  const token = await createSessionToken(ADMIN_SUB)
  const res = NextResponse.json({ ok: true })
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SESSION_MAX_AGE_SECONDS,
    path: "/",
  })
  return res
}
