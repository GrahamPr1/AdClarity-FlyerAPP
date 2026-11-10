import { NextRequest, NextResponse } from "next/server"
import { checkRateLimit, clientIp } from "@/lib/rate-limit"
import { sendNopAgentLeadNotification } from "@/lib/email"
import { CANONICAL_SITE_URL } from "@/lib/site-url"
import type { LeadRecord } from "@/lib/types"
import { LEAD_RATE_LIMIT, LEAD_RATE_WINDOW_SECONDS, LeadSchema } from "@/lib/leads"
import { parseNopLang, tNop, type NopStringKey } from "@/lib/enterprise/nop-i18n"
import { fillConsent, leadConsent } from "@/lib/enterprise/portal/lead-capture"
import { EVENT_LIMITS, eventPageFor } from "@/lib/enterprise/portal/events"
import { saveAgentLead } from "@/lib/enterprise/portal/agent-data"

// POST /api/enterprise/nop/events/{code}/rsvp — the RSVP form on an event page
// (/e/{code}). The same guards as the lead forms: honeypot and rate limit
// answer 200 and store nothing; RSVPs only while the event is open (not
// cancelled or over, agent active with events and leads); the consent box is
// required against the approved text NOW (stored as shown, with the agent's
// name); the RSVP is saved as a lead under the Agent ID (eventId, guests)
// before the agent is emailed. The IP is only a rate-limit key.

const silentOk = () => NextResponse.json({ ok: true })
const FIELD_ERROR: Record<string, NopStringKey> = { name: "lead.err_name", phone: "lead.err_phone", email: "lead.err_email" }

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

  const page = await eventPageFor(code)
  if (!page || !page.open) return NextResponse.json({ error: "unavailable", message: tNop(lang, "event.rsvp_closed") }, { status: 404 })
  const consent = await leadConsent(page.orgId, lang)
  if (consent.pending) return NextResponse.json({ error: "coming_soon", message: tNop(lang, "lead.err_unavailable") }, { status: 409 })

  const { allowed } = await checkRateLimit(`nop-rsvp:${page.agentId}:${clientIp(request.headers)}`, LEAD_RATE_LIMIT, LEAD_RATE_WINDOW_SECONDS)
  if (!allowed) return silentOk()

  if (body.consent !== true) return NextResponse.json({ error: "consent_required", message: tNop(lang, "lead.err_consent") }, { status: 422 })
  if (body.consentVersion !== consent.version) return NextResponse.json({ error: "consent_changed", message: tNop(lang, "lead.err_generic") }, { status: 409 })
  const parsed = LeadSchema.safeParse(body)
  if (!parsed.success) {
    const field = String(parsed.error.issues[0]?.path[0] ?? "")
    return NextResponse.json({ error: "invalid", field, message: tNop(lang, FIELD_ERROR[field] ?? "lead.err_generic") }, { status: 422 })
  }
  const guests = Number(body.guests ?? 0)
  if (!Number.isInteger(guests) || guests < 0 || guests > EVENT_LIMITS.maxGuests) return NextResponse.json({ error: "invalid", field: "guests", message: tNop(lang, "event.err_guests") }, { status: 422 })

  const now = new Date().toISOString()
  const lead: LeadRecord = {
    id: crypto.randomUUID(),
    flyerId: `nop-event:${page.event.id}`,
    code,
    ...parsed.data,
    createdAt: now,
    consent: { text: fillConsent(consent.text, page.agentName), textId: consent.id, version: consent.version, lang, at: now },
    contactedAt: null,
    eventId: page.event.id,
    guests,
    reminderSentAt: null,
  }
  await saveAgentLead(page.agentId, lead)
  const sent = await sendNopAgentLeadNotification({ to: page.owner, lang: page.agentLang, lead, portalUrl: `${CANONICAL_SITE_URL}/agent/leads`, event: { title: page.event.title, guests } })
  if (!sent.sent) console.error(`[nop-rsvp] saved RSVP ${lead.id} for ${page.agentId}, but the agent email failed:`, sent.reason)
  return NextResponse.json({ ok: true })
}
