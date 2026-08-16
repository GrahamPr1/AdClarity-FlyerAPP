import { NextRequest, NextResponse } from "next/server"
import { createSessionToken, hashPassword, SESSION_COOKIE, SESSION_MAX_AGE_SECONDS } from "@/lib/auth"
import { setClientPasswordHash, verifyAndConsumePasswordResetToken, recordClientCreatedAtIfUnset } from "@/lib/store"

const MIN_PASSWORD_LENGTH = 8

// POST /api/auth/reset-password
// Consumes the one-time token from the emailed reset link and sets a new
// password — the token proves inbox ownership, so this signs the client in
// immediately rather than sending them back to a separate login step.
export async function POST(request: NextRequest) {
  let body: { email?: string; token?: string; password?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const email = body.email?.trim().toLowerCase()
  const token = body.token?.trim()
  const password = body.password ?? ""
  if (!email || !token) {
    return NextResponse.json({ error: "Missing required fields: email, token" }, { status: 422 })
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return NextResponse.json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` }, { status: 422 })
  }

  const valid = await verifyAndConsumePasswordResetToken(email, token)
  if (!valid) {
    return NextResponse.json({ error: "This reset link is invalid or has expired — request a new one." }, { status: 401 })
  }

  await setClientPasswordHash(email, await hashPassword(password))
  // Covers the "claiming a pre-password-era account" case too — this is
  // the first time this email has ever had a real credential if it never
  // signed up through /api/auth/signup (recordClientCreatedAtIfUnset is a
  // no-op if a real signup already set this).
  await recordClientCreatedAtIfUnset(email)

  const sessionToken = await createSessionToken(email)
  const res = NextResponse.json({ ok: true })
  res.cookies.set(SESSION_COOKIE, sessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SESSION_MAX_AGE_SECONDS,
    path: "/",
  })
  return res
}
