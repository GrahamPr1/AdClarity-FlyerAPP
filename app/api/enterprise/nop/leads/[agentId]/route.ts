import { NextRequest, NextResponse } from "next/server"
import { checkRateLimit, clientIp } from "@/lib/rate-limit"
import { sendNopAgentLeadNotification } from "@/lib/email"
import { CANONICAL_SITE_URL } from "@/lib/site-url"
import type { LeadRecord } from "@/lib/types"
import { LEAD_RATE_LIMIT, LEAD_RATE_WINDOW_SECONDS, LeadSchema } from "@/lib/leads"
import { parseNopLang, tNop, type NopStringKey } from "@/lib/enterprise/nop-i18n"
import { agentLeadCapture } from "@/lib/enterprise/portal/lead-capture"
import { saveAgentLead } from "@/lib/enterprise/portal/agent-data"

// POST /api/enterprise/nop/leads/{agentId} — the form on a NOP agent's public
// lead page (/a/{agentId}/contact). The SMB route's guards, unchanged in kind:
//   - honeypot and per-IP, per-agent rate limit answer 200 and store nothing;
//   - whether the form is open is decided here (agentLeadCapture): an agent
//     who isn't active Pro/Leader with lead capture on gets nothing, and while
//     the consent text is a placeholder nothing is accepted at all;
//   - the consent box must be ticked; the exact approved text shown, its
//     version and the time are stored with the lead;
//   - the lead is saved under the Agent ID before the agent is emailed.
// The IP is only a rate-limit key and is never stored.

const silentOk = () => NextResponse.json({ ok: true })

const FIELD_ERROR: Record<string, NopStringKey> = { name: "lead.err_name", phone: "lead.err_phone", email: "lead.err_email" }

export async function POST(request: NextRequest, { params }: { params: Promise<{ agentId: string }> }) {
  const { agentId } = await params

  let body: Record<string, unknown>
  try {
    const parsed = await request.json()
    body = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {}
  } catch {
    return NextResponse.json({ error: "invalid", message: tNop("en", "lead.err_generic") }, { status: 400 })
  }
  const lang = parseNopLang(body.lang) ?? "en"

  if (typeof body.website === "string" && body.website.trim() !== "") {
    console.info(`[nop-leads] honeypot hit for ${agentId}; dropped`)
    return silentOk()
  }

  const capture = await agentLeadCapture(agentId, lang)
  if (capture.state !== "open") {
    return NextResponse.json({ error: capture.state, message: tNop(lang, "lead.err_unavailable") }, { status: capture.state === "unavailable" ? 404 : 409 })
  }

  const { allowed } = await checkRateLimit(`nop-lead:${agentId}:${clientIp(request.headers)}`, LEAD_RATE_LIMIT, LEAD_RATE_WINDOW_SECONDS)
  if (!allowed) {
    console.info(`[nop-leads] rate limit hit for ${agentId}; dropped`)
    return silentOk()
  }

  // The box must be ticked, against the text that is approved NOW: a form
  // left open across an edit of the wording must be reloaded, not credited
  // with consent to words the person never saw.
  if (body.consent !== true) return NextResponse.json({ error: "consent_required", message: tNop(lang, "lead.err_consent") }, { status: 422 })
  if (body.consentVersion !== capture.consent.version) {
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
    code: agentId,
    ...parsed.data,
    createdAt: now,
    consent: { text: capture.consent.text, textId: capture.consent.id, version: capture.consent.version, lang, at: now },
    contactedAt: null,
  }
  await saveAgentLead(agentId, lead)

  const sent = await sendNopAgentLeadNotification({ to: capture.owner, lang: capture.agentLang, lead, portalUrl: `${CANONICAL_SITE_URL}/agent/leads` })
  if (!sent.sent) console.error(`[nop-leads] saved lead ${lead.id} for ${agentId}, but the agent email failed:`, sent.reason)

  return NextResponse.json({ ok: true })
}
