import { NextRequest, NextResponse } from "next/server"
import { checkRateLimit, clientIp } from "@/lib/rate-limit"
import { sendNopAgentLeadNotification } from "@/lib/email"
import { CANONICAL_SITE_URL } from "@/lib/site-url"
import type { LeadRecord } from "@/lib/types"
import { LEAD_RATE_LIMIT, LEAD_RATE_WINDOW_SECONDS, LeadSchema } from "@/lib/leads"
import { parseNopLang, tNop, type NopStringKey } from "@/lib/enterprise/nop-i18n"
import { leadConsent, qrLanding } from "@/lib/enterprise/portal/lead-capture"
import { saveAgentLead } from "@/lib/enterprise/portal/agent-data"

// POST /api/enterprise/nop/leads/{code} — the form on a NOP agent's QR lead
// page (/a/{code}/contact). The SMB route's guards, unchanged in kind:
//   - honeypot and per-IP, per-agent rate limit answer 200 and store nothing;
//   - whether the form is open is decided here (qrLanding): unless the org has
//     the QR lead page on and the agent is an active Pro/Leader with lead
//     capture, nothing is accepted; while the consent text is a placeholder,
//     nothing is accepted either;
//   - the consent box must be ticked; the exact approved text shown, its
//     version and the time are stored with the lead;
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

  const landing = await qrLanding(code)
  if (landing.state !== "lead_page") return NextResponse.json({ error: "unavailable", message: tNop(lang, "lead.err_unavailable") }, { status: 404 })
  const consent = await leadConsent(landing.orgId, lang)
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
  const lead: LeadRecord = {
    id: crypto.randomUUID(),
    flyerId: `nop-agent:${agentId}`,
    code,
    ...parsed.data,
    createdAt: now,
    consent: { text: consent.text, textId: consent.id, version: consent.version, lang, at: now },
    contactedAt: null,
  }
  await saveAgentLead(agentId, lead)

  const sent = await sendNopAgentLeadNotification({ to: landing.owner, lang: landing.agentLang, lead, portalUrl: `${CANONICAL_SITE_URL}/agent/leads` })
  if (!sent.sent) console.error(`[nop-leads] saved lead ${lead.id} for ${agentId}, but the agent email failed:`, sent.reason)

  return NextResponse.json({ ok: true })
}
