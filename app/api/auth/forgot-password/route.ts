import { NextRequest, NextResponse } from "next/server"
import { issuePasswordResetToken } from "@/lib/store"
import { sendPasswordResetEmail } from "@/lib/email"
import { getSiteUrl } from "@/lib/site-url"
import { checkRateLimit, clientIp } from "@/lib/rate-limit"

// POST /api/auth/forgot-password
// Emails a one-time reset link (see issuePasswordResetToken in lib/store.ts)
// — the same mechanism serves both an actually-forgotten password and a
// client whose account predates password auth entirely (they've never had
// one to forget). Responds identically (ok, or the same generic failure)
// regardless of whether the email has an account — a token is issued and an
// email send attempted either way — and the reset link is only ever
// emailed, never returned in the response. This endpoint takes only an
// email and nothing proves the requester owns it, so it must not double as
// a way to test whether an address has an account.
export async function POST(request: NextRequest) {
  let body: { email?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const email = body.email?.trim().toLowerCase()
  if (!email) {
    return NextResponse.json({ error: "Missing required field: email" }, { status: 422 })
  }

  // Unthrottled, this endpoint sends a real email to any address on demand —
  // an open relay pointed at our own Resend quota, and a way to bomb someone
  // else's inbox. Limited per IP and per target address; the response shape
  // is unchanged so it still can't be used to test whether an account exists.
  const ip = clientIp(request.headers)
  const [byIp, byEmail] = await Promise.all([
    checkRateLimit(`forgot-ip:${ip}`, 5, 900),
    checkRateLimit(`forgot-email:${email}`, 3, 900),
  ])
  if (!byIp.allowed || !byEmail.allowed) {
    // Deliberately the same success-shaped response the happy path returns,
    // so a rate limit can't be used as an account-existence oracle either.
    return NextResponse.json({ ok: true })
  }

  const token = await issuePasswordResetToken(email)
  const resetUrl = `${getSiteUrl()}/reset-password?email=${encodeURIComponent(email)}&token=${encodeURIComponent(token)}`
  const sent = await sendPasswordResetEmail(email, resetUrl)

  if (!sent) {
    // The real cause (missing RESEND_API_KEY, a Resend-side error, etc.) is
    // already logged server-side by sendPasswordResetEmail — this stays
    // generic for whoever's looking at the login page, rather than leaking
    // internal configuration state to the public.
    return NextResponse.json({ error: "Couldn't send the reset email right now — please try again later." }, { status: 502 })
  }

  return NextResponse.json({ ok: true })
}
