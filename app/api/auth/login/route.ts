import { NextRequest, NextResponse } from "next/server"
import { createSessionToken, ADMIN_SUB, SESSION_COOKIE, SESSION_MAX_AGE_SECONDS } from "@/lib/auth"

export async function POST(req: NextRequest) {
  const { password } = await req.json()

  if (!process.env.DASHBOARD_PASSWORD) {
    return NextResponse.json({ error: "Server not configured" }, { status: 500 })
  }

  if (password !== process.env.DASHBOARD_PASSWORD) {
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
