import { NextRequest, NextResponse } from "next/server"
import { getTrackingRecord, saveLead } from "@/lib/store"
import { offerPageFeaturesEnabledFor } from "@/lib/offer-page-access"
import { checkRateLimit, clientIp } from "@/lib/rate-limit"
import { sendLeadNotification } from "@/lib/email"
import { CANONICAL_SITE_URL } from "@/lib/site-url"
import type { LeadRecord } from "@/lib/types"
import { LEAD_RATE_LIMIT, LEAD_RATE_WINDOW_SECONDS, LeadSchema } from "@/lib/leads"
import { isOfferExpired } from "@/lib/offer-page-content"
import { getEmailPreferences, digestLive } from "@/lib/email-preferences"
import { recordSent } from "@/lib/email-delivery"
import { queueLeadForDigest } from "@/lib/lead-digest"

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

/** "g•••@icloud.com": enough to tell accounts apart in a log, not the whole address. */
function maskEmail(email: string): string {
  const [user, domain] = email.split("@")
  return `${user.slice(0, 1)}•••@${domain ?? ""}`
}

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

  if (!(await offerPageFeaturesEnabledFor(record.email))) {
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
    // Decided by the server at submission, not by what the page showed.
    afterOfferEnded: isOfferExpired(record.expiresAt),
  }
  await saveLead(record.email, lead)

  // The lead is saved whatever the owner's email settings say; only the email
  // honours them (lib/email-preferences.ts — /profile, or the unsubscribe link).
  const prefs = await getEmailPreferences(record.email)
  if (prefs.leads === "off") {
    console.log(`[leads] saved lead ${lead.id} on ${code}; owner has lead emails off — not emailed`)
    return NextResponse.json({ ok: true })
  }
  // "Once a day" only while the digest really sends; until then, as before.
  if (prefs.leads === "daily" && digestLive()) {
    // Goes out in tomorrow's digest instead (/api/cron/public-emails).
    await queueLeadForDigest(record.email, {
      name: lead.name,
      phone: lead.phone,
      email: lead.email,
      message: lead.message,
      createdAt: lead.createdAt,
      flyerTitle: record.headline,
      afterOfferEnded: lead.afterOfferEnded ?? false,
    })
    console.log(`[leads] saved lead ${lead.id} on ${code}; queued for the owner's daily digest`)
    return NextResponse.json({ ok: true })
  }
  const sent = await sendLeadNotification({
    to: record.email,
    businessName: record.businessName,
    flyerTitle: record.headline,
    channelLabel: record.channelLabel ?? null,
    lead,
    afterOfferEnded: lead.afterOfferEnded ?? false,
    dashboardUrl: `${CANONICAL_SITE_URL}/dashboard`,
  })
  // Every outcome is logged with Resend's id, so a lead email that didn't
  // arrive can be traced (it once bounced at iCloud with nothing in the logs).
  // "accepted" is Resend taking it, not delivery — bounces come back later.
  if (!sent.sent) console.error(`[leads] saved lead ${lead.id} on ${code}, but the owner email failed:`, sent.reason)
  else {
    console.log(`[leads] lead ${lead.id} on ${code}: email to ${maskEmail(record.email)} accepted by Resend (${sent.id ?? "no id"})`)
    // Followed by Resend's webhook: a bounce is retried once and shown to the owner.
    await recordSent(sent.id, { kind: "lead", owner: record.email, code, leadId: lead.id, attempt: 1 })
  }

  return NextResponse.json({ ok: true })
}
