import { NextRequest, NextResponse } from "next/server"
import { checkRateLimit, clientIp } from "@/lib/rate-limit"
import { sendNopAgentLeadNotification } from "@/lib/email"
import { CANONICAL_SITE_URL } from "@/lib/site-url"
import type { LeadRecord } from "@/lib/types"
import { LEAD_RATE_LIMIT, LEAD_RATE_WINDOW_SECONDS, LeadSchema } from "@/lib/leads"
import { parseNopLang, tNop, type NopStringKey } from "@/lib/enterprise/nop-i18n"
import { checkSmsConsent, fillConsent, leadConsent, smsConsent } from "@/lib/enterprise/portal/lead-capture"
import { checkInState, eventPageFor } from "@/lib/enterprise/portal/events"
import { listAgentLeads, saveAgentLead, updateAgentLead } from "@/lib/enterprise/portal/agent-data"

// POST /api/enterprise/nop/events/{code}/checkin — the check-in page at an
// event (/e/{code}/checkin): name and phone, the same consent box as the lead
// forms (required, against the approved text NOW) and the optional
// text-message box. Same guards: honeypot and rate limit answer 200 and store
// nothing. Open only while checkInState says so (around the event's time).
//
// Someone who RSVP'd (same event, same phone) has that RSVP marked checked in,
// with the check-in consent stored beside the RSVP's; anyone else becomes a
// new lead for the event, marked checked in, and the agent is emailed.
// Checking in twice changes nothing. The IP is only a rate-limit key.

const silentOk = () => NextResponse.json({ ok: true })
const FIELD_ERROR: Record<string, NopStringKey> = { name: "lead.err_name", phone: "lead.err_phone", email: "lead.err_email" }
const last10 = (phone: string) => phone.replace(/\D/g, "").slice(-10)

export async function POST(request: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  let body: Record<string, unknown>
  try {
    const parsed = await request.json()
    body = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {}
  } catch {
    return NextResponse.json({ error: "invalid", message: tNop("en", "lead.err_generic") }, { status: 400 })
  }
  const lang = parseNopLang(body.lang) ?? "en"
  if (typeof body.website === "string" && body.website.trim() !== "") return silentOk()

  const now = new Date()
  const page = await eventPageFor(code, now)
  if (!page || checkInState(page, now) !== "open") return NextResponse.json({ error: "unavailable", message: tNop(lang, "checkin.closed") }, { status: 404 })
  const [consent, sms] = await Promise.all([leadConsent(page.orgId, lang), smsConsent(page.orgId, lang)])
  if (consent.pending) return NextResponse.json({ error: "coming_soon", message: tNop(lang, "lead.err_unavailable") }, { status: 409 })

  const { allowed } = await checkRateLimit(`nop-checkin:${page.agentId}:${clientIp(request.headers)}`, LEAD_RATE_LIMIT, LEAD_RATE_WINDOW_SECONDS)
  if (!allowed) return silentOk()

  if (body.consent !== true) return NextResponse.json({ error: "consent_required", message: tNop(lang, "lead.err_consent") }, { status: 422 })
  if (body.consentVersion !== consent.version) return NextResponse.json({ error: "consent_changed", message: tNop(lang, "lead.err_generic") }, { status: 409 })
  const parsed = LeadSchema.safeParse({ ...body, email: body.email ?? "", message: "" })
  if (!parsed.success) {
    const field = String(parsed.error.issues[0]?.path[0] ?? "")
    return NextResponse.json({ error: "invalid", field, message: tNop(lang, FIELD_ERROR[field] ?? "lead.err_generic") }, { status: 422 })
  }
  const at = now.toISOString()
  const smsCheck = checkSmsConsent(body, sms, page.agentName, parsed.data.phone, lang, at)
  if (!smsCheck.ok) return NextResponse.json({ error: smsCheck.error, message: tNop(lang, "lead.err_generic") }, { status: 409 })
  const checkInConsent = { text: fillConsent(consent.text, page.agentName), textId: consent.id, version: consent.version, lang, at }

  // Already on the list for this event (RSVP or an earlier check-in), by phone.
  const existing = (await listAgentLeads(page.agentId)).find((l) => l.eventId === page.event.id && last10(l.phone) === last10(parsed.data.phone) && last10(l.phone).length === 10)
  if (existing) {
    if (!existing.checkedInAt) {
      await updateAgentLead(page.agentId, { ...existing, checkedInAt: at, checkInConsent, ...(smsCheck.value ? { smsConsent: smsCheck.value } : {}) })
    }
    return NextResponse.json({ ok: true, matched: true })
  }

  const lead: LeadRecord = {
    id: crypto.randomUUID(),
    flyerId: `nop-event-checkin:${page.event.id}`,
    code,
    ...parsed.data,
    createdAt: at,
    consent: checkInConsent,
    smsConsent: smsCheck.value,
    contactedAt: null,
    eventId: page.event.id,
    checkedInAt: at,
    checkInConsent,
  }
  await saveAgentLead(page.agentId, lead)
  const sent = await sendNopAgentLeadNotification({ to: page.owner, lang: page.agentLang, lead, portalUrl: `${CANONICAL_SITE_URL}/agent/leads`, checkIn: { title: page.event.title } })
  if (!sent.sent) console.error(`[nop-checkin] saved check-in ${lead.id} for ${page.agentId}, but the agent email failed:`, sent.reason)
  return NextResponse.json({ ok: true, matched: false })
}
