import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { sendContactMessage } from "@/lib/email"
import { checkRateLimit, clientIp } from "@/lib/rate-limit"

// POST /api/contact — public, unauthenticated by necessity: the people most
// likely to use it are ones who can't get into their account.
//
// Rate-limited per IP because an unauthenticated endpoint that sends mail is
// an open relay otherwise. Five an hour is generous for a human and useless
// for a spammer.
const ContactSchema = z.object({
  name: z.string().trim().min(1, "Tell us your name.").max(100),
  email: z.string().trim().email("That doesn't look like an email address.").max(200),
  message: z.string().trim().min(10, "Add a little more detail so we can help.").max(4000),
})

export async function POST(request: NextRequest) {
  const { allowed, retryAfterSeconds } = await checkRateLimit(`contact:${clientIp(request.headers)}`, 5, 3600)
  if (!allowed) {
    return NextResponse.json(
      { error: "rate_limited", message: "You've sent a few already — try again shortly." },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } },
    )
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const parsed = ContactSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid", message: parsed.error.issues[0]?.message ?? "Check the form." }, { status: 422 })
  }

  const result = await sendContactMessage(parsed.data)
  if (!result.sent) {
    // Never claim it sent when it didn't — the visitor would wait for a reply
    // that can't come. The real reason stays server-side.
    console.error("[contact] Delivery failed:", result.reason)
    return NextResponse.json(
      { error: "send_failed", message: "We couldn't send that just now. Email support@oneflyer.org directly and we'll pick it up." },
      { status: 502 },
    )
  }

  return NextResponse.json({ ok: true })
}
