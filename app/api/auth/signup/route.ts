import { NextRequest, NextResponse } from "next/server"
import { createSessionToken, hashPassword, SESSION_COOKIE, SESSION_MAX_AGE_SECONDS } from "@/lib/auth"
import { getClientPasswordHash, setClientPasswordHash } from "@/lib/store"

const MIN_PASSWORD_LENGTH = 8

// POST /api/auth/signup
// Real account creation for a NEW client — chooses their own email and
// password right here, no email verification round-trip required (that's
// what /api/auth/forgot-password is for, both for actually-forgotten
// passwords and for an account that predates this system entirely). Only
// blocks on an email that already HAS a password set — an email with
// existing deliverables/plan data but no password (a pre-password-era
// account) is exactly the case this is allowed to claim.
export async function POST(request: NextRequest) {
  let body: { email?: string; password?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const email = body.email?.trim().toLowerCase()
  const password = body.password ?? ""
  if (!email) {
    return NextResponse.json({ error: "Missing required field: email" }, { status: 422 })
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return NextResponse.json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` }, { status: 422 })
  }

  const existingHash = await getClientPasswordHash(email)
  if (existingHash) {
    return NextResponse.json({ error: "An account with this email already exists — log in instead." }, { status: 409 })
  }

  await setClientPasswordHash(email, await hashPassword(password))

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
