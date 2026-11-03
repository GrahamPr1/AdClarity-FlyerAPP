import { NextRequest, NextResponse } from "next/server"
import { getClient, getTrackingRecord, saveLead } from "@/lib/store"
import { leadCaptureEnabled } from "@/lib/agent-pipeline/plan-features"
import { checkRateLimit, clientIp } from "@/lib/rate-limit"
import { sendLeadNotification } from "@/lib/email"
import { CANONICAL_SITE_URL } from "@/lib/site-url"
import type { LeadRecord } from "@/lib/types"
import { LEAD_RATE_LIMIT, LEAD_RATE_WINDOW_SECONDS, LeadSchema } from "@/lib/leads"

// POST /api/leads/{code} — the form on a flyer's offer page (/r/{code}).
//
// Public and unauthenticated: whoever scanned the QR has no account. So it is
// guarded the way /api/contact is, plus a honeypot:
//   - the honeypot (`website`, hidden from people) and the per-IP, per-flyer
//     rate limit both answer 200 { ok: true } and store nothing, so a bot
//     learns nothing from the response;
//   - the plan check is server-side, on the OWNER's live record — the form is
//     only rendered for Basic/Pro, but that is not what enforces it;
//   - every field is validated and length-limited here.
//
// The IP is used for the rate-limit key only (a short-TTL counter in
// lib/rate-limit.ts) and is never written to the lead.
//
// The lead is saved BEFORE the owner is emailed: a failed email is logged and
// the visitor still gets their confirmation, because the lead is safe.

/** What a bot gets for a honeypot hit or a rate-limited burst: the same as success. */
const silentOk = () => NextResponse.json({ ok: true })

export async function POST(request: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const record = await getTrackingRecord(code)
  if (!record) return NextResponse.json({ error: "not_found" }, { status: 404 })

  let body: Record<string, unknown>
  try {
    const parsed = await request.json()
    body = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {}
  } catch {
    return NextResponse.json({ error: "invalid", message: "Check the form." }, { status: 400 })
  }

  // Honeypot: a field people never see. Anything in it is a bot.
  if (typeof body.website === "string" && body.website.trim() !== "") {
    console.info(`[leads] honeypot hit on ${code}; dropped`)
    return silentOk()
  }

  // Per IP, per flyer: one person's burst on one offer can't block anyone else.
  const { allowed } = await checkRateLimit(`lead:${record.flyerId}:${clientIp(request.headers)}`, LEAD_RATE_LIMIT, LEAD_RATE_WINDOW_SECONDS)
  if (!allowed) {
    console.info(`[leads] rate limit hit on ${code}; dropped`)
    return silentOk()
  }

  const owner = await getClient(record.email)
  if (!leadCaptureEnabled(owner)) {
    return NextResponse.json({ error: "unavailable", message: "This offer isn't taking requests online. Call the business instead." }, { status: 403 })
  }

  const parsed = LeadSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid", message: parsed.error.issues[0]?.message ?? "Check the form." }, { status: 422 })
  }

  const lead: LeadRecord = {
    id: crypto.randomUUID(),
    flyerId: record.flyerId,
    code,
    ...parsed.data,
    createdAt: new Date().toISOString(),
  }
  await saveLead(record.email, lead)

  const sent = await sendLeadNotification({
    to: record.email,
    businessName: record.businessName,
    flyerTitle: record.headline,
    channelLabel: record.channelLabel ?? null,
    lead,
    dashboardUrl: `${CANONICAL_SITE_URL}/dashboard`,
  })
  if (!sent.sent) console.error(`[leads] saved lead ${lead.id} on ${code}, but the owner email failed:`, sent.reason)

  return NextResponse.json({ ok: true })
}
