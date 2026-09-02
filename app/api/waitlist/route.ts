import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { addWaitlistEntry } from "@/lib/store"
import { sendWaitlistConfirmation } from "@/lib/email"
import { getSessionIdentity, ADMIN_SUB } from "@/lib/auth"
import { checkRateLimit, clientIp } from "@/lib/rate-limit"

// POST /api/waitlist
//
// Public: an anonymous visitor can join, which is the point — they're on the
// pricing page deciding whether this is worth paying for, and forcing a signup
// first would lose exactly the signal we're trying to capture.
//
// Joining NEVER changes anyone's plan. It writes one waitlist entry and
// nothing else.
const WaitlistSchema = z.object({
  email: z.string().trim().email("Enter a valid email address.").max(200),
  desiredPlan: z.enum(["basic", "pro"]),
  billingInterval: z.enum(["monthly", "annual"]),
})

export async function POST(request: NextRequest) {
  // Unauthenticated and it writes — so it's throttled, same as /api/contact.
  const { allowed, retryAfterSeconds } = await checkRateLimit(`waitlist:${clientIp(request.headers)}`, 10, 3600)
  if (!allowed) {
    return NextResponse.json(
      { error: "rate_limited", message: "Too many requests — try again shortly." },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } },
    )
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const parsed = WaitlistSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid", message: parsed.error.issues[0]?.message ?? "Check the form." }, { status: 422 })
  }

  // Attach the account when there is one, so the dashboard can show them what
  // they joined. The admin session has no client identity of its own.
  const session = await getSessionIdentity(request)
  const userId = session && session.sub !== ADMIN_SUB ? session.sub : null

  const { entry, alreadyExists } = await addWaitlistEntry({ ...parsed.data, userId })

  if (!alreadyExists) {
    // Fire-and-forget: a logging stub today, and once it really sends, a mail
    // failure must not make a successful signup look like it failed.
    sendWaitlistConfirmation(entry.email, entry.desiredPlan, entry.billingInterval).catch(() => {})
  }

  // 200 for a duplicate, not an error — someone clicking twice hasn't done
  // anything wrong, and an error would read as "your signup didn't work".
  return NextResponse.json({ ok: true, alreadyExists, entry }, { status: 200 })
}
