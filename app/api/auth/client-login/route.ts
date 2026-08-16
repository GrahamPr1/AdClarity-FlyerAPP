import { NextRequest, NextResponse } from "next/server"
import { createSessionToken, verifyPassword, SESSION_COOKIE, SESSION_MAX_AGE_SECONDS } from "@/lib/auth"
import { getClientPasswordHash } from "@/lib/store"

// POST /api/auth/client-login
// Real email+password sign-in, scoped to a client's own email (see
// lib/auth.ts's sub claim) — replaces the old one-time-code system, which
// never actually verified anyone owned the inbox it "logged in" for.
export async function POST(request: NextRequest) {
  let body: { email?: string; password?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const email = body.email?.trim().toLowerCase()
  const password = body.password ?? ""
  if (!email || !password) {
    return NextResponse.json({ error: "Missing required fields: email, password" }, { status: 422 })
  }

  const storedHash = await getClientPasswordHash(email)
  if (!storedHash) {
    // Distinct from "wrong password" — an account that predates this system
    // (or was never fully signed up) has no password to check against.
    // Naming this explicitly is what lets the login form point them at
    // "forgot password" specifically, rather than a dead-end "wrong
    // password" that no correct password could ever satisfy.
    return NextResponse.json({ error: "no_password_set", message: "No password set for this email yet — use \"Forgot password\" to set one." }, { status: 401 })
  }

  const valid = await verifyPassword(password, storedHash)
  if (!valid) {
    return NextResponse.json({ error: "invalid_credentials", message: "Incorrect email or password." }, { status: 401 })
  }

  const token = await createSessionToken(email)
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
