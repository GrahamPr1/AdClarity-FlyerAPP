import { NextRequest, NextResponse } from "next/server"
import { checkRateLimit, clientIp } from "@/lib/rate-limit"
import { sendNopAgentLeadNotification } from "@/lib/email"
import { CANONICAL_SITE_URL } from "@/lib/site-url"
import type { LeadRecord } from "@/lib/types"
import { LEAD_RATE_LIMIT, LEAD_RATE_WINDOW_SECONDS, LeadSchema } from "@/lib/leads"
import { parseNopLang, tNop, type NopLang, type NopStringKey } from "@/lib/enterprise/nop-i18n"
import { checkSmsConsent, fillConsent, leadConsent, qrLanding, smsConsent } from "@/lib/enterprise/portal/lead-capture"
import { agentPageFor } from "@/lib/enterprise/portal/agent-page"
import { saveAgentLead } from "@/lib/enterprise/portal/agent-data"

// POST /api/enterprise/nop/leads/{code} — the form on a NOP agent's QR lead
// page (/a/{code}/contact), or, with "source": "page", on their personal page
// (/p/{code}). The SMB route's guards, unchanged in kind:
//   - honeypot and per-IP, per-agent rate limit answer 200 and store nothing;
//   - whether the form is open is decided here: unless the agent is an active
//     Pro/Leader with lead capture AND the page the form is on is switched on
//     for their org (qrLanding for the QR lead page, agentPageFor for the
//     personal page), nothing is accepted; while the consent text is a
//     placeholder, nothing is accepted either;
//   - the consent box must be ticked; the exact approved text shown, its
//     version and the time are stored with the lead;
//   - the text-message box is optional and separate: when its wording is
//     approved, the answer (yes or no), the words shown and the phone number
//     are stored with the lead; it never blocks a submission;
//   - the lead is saved under the Agent ID before the agent is emailed.
// The IP is only a rate-limit key and is never stored.

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

  if (typeof body.website === "string" && body.website.trim() !== "") {
    console.info(`[nop-leads] honeypot hit for ${code}; dropped`)
    return silentOk()
  }

  const fromPage = body.source === "page"
  const landing = await formTarget(code, fromPage)
  if (!landing) return NextResponse.json({ error: "unavailable", message: tNop(lang, "lead.err_unavailable") }, { status: 404 })
  const [consent, sms] = await Promise.all([leadConsent(landing.orgId, lang), smsConsent(landing.orgId, lang)])
  if (consent.pending) return NextResponse.json({ error: "coming_soon", message: tNop(lang, "lead.err_unavailable") }, { status: 409 })
  const { agentId } = landing

  const { allowed } = await checkRateLimit(`nop-lead:${agentId}:${clientIp(request.headers)}`, LEAD_RATE_LIMIT, LEAD_RATE_WINDOW_SECONDS)
  if (!allowed) {
    console.info(`[nop-leads] rate limit hit for ${agentId}; dropped`)
    return silentOk()
  }

  // The box must be ticked, against the text that is approved NOW: a form
  // left open across an edit of the wording must be reloaded, not credited
  // with consent to words the person never saw.
  if (body.consent !== true) return NextResponse.json({ error: "consent_required", message: tNop(lang, "lead.err_consent") }, { status: 422 })
  if (body.consentVersion !== consent.version) {
    return NextResponse.json({ error: "consent_changed", message: tNop(lang, "lead.err_generic") }, { status: 409 })
  }

  const parsed = LeadSchema.safeParse(body)
  if (!parsed.success) {
    const field = String(parsed.error.issues[0]?.path[0] ?? "")
    return NextResponse.json({ error: "invalid", field, message: tNop(lang, FIELD_ERROR[field] ?? "lead.err_generic") }, { status: 422 })
  }

  const now = new Date().toISOString()
  const smsCheck = checkSmsConsent(body, sms, landing.agentName, parsed.data.phone, lang, now)
  if (!smsCheck.ok) return NextResponse.json({ error: smsCheck.error, message: tNop(lang, "lead.err_generic") }, { status: 409 })
  const lead: LeadRecord = {
    id: crypto.randomUUID(),
    // Which form it came from: the QR lead page, or the agent's own page.
    flyerId: fromPage ? `nop-agent-page:${agentId}` : `nop-agent:${agentId}`,
    code,
    ...parsed.data,
    createdAt: now,
    // The words the person agreed to: the approved text with their agent's name filled in, as the form showed it.
    consent: { text: fillConsent(consent.text, landing.agentName), textId: consent.id, version: consent.version, lang, at: now },
    smsConsent: smsCheck.value,
    contactedAt: null,
  }
  await saveAgentLead(agentId, lead)

  const sent = await sendNopAgentLeadNotification({ to: landing.owner, lang: landing.agentLang, lead, portalUrl: `${CANONICAL_SITE_URL}/agent/leads`, fromPage })
  if (!sent.sent) console.error(`[nop-leads] saved lead ${lead.id} for ${agentId}, but the agent email failed:`, sent.reason)

  return NextResponse.json({ ok: true })
}

async function formTarget(code: string, fromPage: boolean): Promise<{ agentId: string; agentName: string; orgId: string; owner: string; agentLang: NopLang } | null> {
  if (fromPage) {
    const page = await agentPageFor(code)
    return page?.leads ? { ...page, agentName: page.name } : null
  }
  const landing = await qrLanding(code)
  return landing.state === "lead_page" ? landing : null
}
