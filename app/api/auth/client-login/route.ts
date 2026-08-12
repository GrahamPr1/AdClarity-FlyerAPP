import { NextRequest, NextResponse } from "next/server"
import { createSessionToken, SESSION_COOKIE, SESSION_MAX_AGE_SECONDS } from "@/lib/auth"
import { verifyAndConsumeClientAccessCode } from "@/lib/store"

// POST /api/auth/client-login
// Step 2 of client self-serve dashboard access — verifies the one-time code
// issued by /api/auth/client-access and, on success, signs the client in
// with a session scoped to their own email (see lib/auth.ts's sub claim).
export async function POST(request: NextRequest) {
  let body: { email?: string; code?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const email = body.email?.trim().toLowerCase()
  const code = body.code?.trim()
  if (!email || !code) {
    return NextResponse.json({ error: "Missing required fields: email, code" }, { status: 422 })
  }

  const valid = await verifyAndConsumeClientAccessCode(email, code)
  if (!valid) {
    return NextResponse.json({ error: "Invalid or expired code" }, { status: 401 })
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
