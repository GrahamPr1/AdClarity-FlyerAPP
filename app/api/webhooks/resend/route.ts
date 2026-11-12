import { NextRequest, NextResponse } from "next/server"
import { getLead, getTrackingRecord } from "@/lib/store"
import { sendLeadNotification } from "@/lib/email"
import { getEmailPreferences } from "@/lib/email-preferences"
import { handleResendEvent, verifyResendSignature, type ResendEvent, type SentRecord } from "@/lib/email-delivery"
import { CANONICAL_SITE_URL } from "@/lib/site-url"

// POST /api/webhooks/resend — Resend's delivery events (bounced, delivered)
// for the public product's emails; see lib/email-delivery.ts. Signed by
// Resend (Svix headers) with RESEND_WEBHOOK_SECRET; anything unsigned,
// tampered with or stale is refused before it is read.
export const dynamic = "force-dynamic"

/** Re-sends a lead email an hour from now — if the owner still wants lead emails. */
async function resendLeadEmail(record: SentRecord): Promise<string | null> {
  if ((await getEmailPreferences(record.owner)).leads === "off") return null
  const [tracking, lead] = await Promise.all([getTrackingRecord(record.code), getLead(record.owner, record.leadId)])
  if (!tracking || !lead) return null
  const sent = await sendLeadNotification({
    to: record.owner,
    businessName: tracking.businessName,
    flyerTitle: tracking.headline,
    channelLabel: tracking.channelLabel ?? null,
    lead,
    afterOfferEnded: lead.afterOfferEnded ?? false,
    dashboardUrl: `${CANONICAL_SITE_URL}/dashboard`,
    scheduledAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  })
  return sent.sent ? (sent.id ?? null) : null
}

export async function POST(request: NextRequest) {
  const secret = process.env.RESEND_WEBHOOK_SECRET
  if (!secret) return NextResponse.json({ error: "not_configured" }, { status: 500 })
  const body = await request.text()
  const ok = verifyResendSignature(
    body,
    { id: request.headers.get("svix-id"), timestamp: request.headers.get("svix-timestamp"), signature: request.headers.get("svix-signature") },
    secret,
  )
  if (!ok) return NextResponse.json({ error: "invalid_signature" }, { status: 401 })

  let event: ResendEvent
  try {
    event = JSON.parse(body)
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 })
  }
  if (!event?.data?.email_id) return NextResponse.json({ ok: true, handled: false })
  return NextResponse.json({ ok: true, ...(await handleResendEvent(event, resendLeadEmail)) })
}
