import type { LeadRecord } from "@/lib/types"
import { NOP_LANGS, type NopLang } from "@/lib/enterprise/nop-i18n"
import { qrDestinationFor } from "@/lib/enterprise/nop-roster"
import { canUse } from "./features"
import type { PortalContext } from "./context"
import { getApprovedText, type ApprovedTextKey } from "./approved-text"

// Follow-up messages on the Leads tab: up to three org-approved messages per
// lead, filled in with the agent's and the lead's details. One tap opens the
// agent's OWN Messages or email app with the text ready (sms: / mailto:).
// OneFlyer never sends anything.
//
// Each message is approved text (followUp1..3, EN and ES), admin-edited:
//   first line   the email subject
//   the rest     the message, used for both the text and the email body
// Fill-ins are written {like_this}; only FOLLOW_UP_FIELDS are allowed, and the
// admin route refuses anything else. A message still on its placeholder (in
// the lead's language) has no button.

export const FOLLOW_UP_KEYS = ["followUp1", "followUp2", "followUp3"] as const satisfies readonly ApprovedTextKey[]
export type FollowUpKey = (typeof FOLLOW_UP_KEYS)[number]

export function isFollowUpKey(v: unknown): v is FollowUpKey {
  return typeof v === "string" && (FOLLOW_UP_KEYS as readonly string[]).includes(v)
}

export const FOLLOW_UP_FIELDS = ["lead_first_name", "lead_name", "agent_name", "agent_first_name", "agent_phone", "agent_email", "enroll_url"] as const
export type FollowUpField = (typeof FOLLOW_UP_FIELDS)[number]

const TOKEN = /\{([^{}\s]*)\}/g

/** For the admin save: the first line is the subject, a message must follow, and only known fill-ins. */
export function checkFollowUpText(text: string): { ok: true } | { ok: false; message: string } {
  if (text.trim() === "") return { ok: true } // blank puts the placeholder back
  const { subject, body } = splitFollowUp(text)
  if (!subject || !body) return { ok: false, message: "Put the email subject on the first line and the message on the lines below it." }
  const unknown = [...text.matchAll(TOKEN)].map((m) => m[1]).filter((f) => !(FOLLOW_UP_FIELDS as readonly string[]).includes(f))
  if (unknown.length) return { ok: false, message: `Unknown fill-in ${unknown.map((f) => `{${f}}`).join(", ")}. Use only: ${FOLLOW_UP_FIELDS.map((f) => `{${f}}`).join(", ")}.` }
  return { ok: true }
}

export function splitFollowUp(text: string): { subject: string; body: string } {
  const [first, ...rest] = text.trim().split("\n")
  return { subject: first.trim(), body: rest.join("\n").trim() }
}

export function fillFollowUp(template: string, values: Record<FollowUpField, string>): string {
  return template.replace(TOKEN, (m, f: string) => ((FOLLOW_UP_FIELDS as readonly string[]).includes(f) ? values[f as FollowUpField] : m))
}

const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? ""

/** sms: works on iOS and Android with "?&body="; mailto: carries subject and body. */
export function followUpLinks(to: { phone: string; email: string | null }, subject: string, body: string): { sms: string; mailto: string | null } {
  const digits = to.phone.replace(/[^0-9+]/g, "")
  return {
    sms: `sms:${digits}?&body=${encodeURIComponent(body)}`,
    mailto: to.email ? `mailto:${encodeURIComponent(to.email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}` : null,
  }
}

export interface FollowUp {
  n: number
  lang: NopLang
  subject: string
  body: string
  sms: string
  mailto: string | null
}

/**
 * Each lead's ready-to-open follow-ups, by lead id. Empty when the agent
 * can't use follow-ups (tier, org switch, active roster status). A lead gets
 * the messages in the language they used on the form, else the agent's.
 */
export async function followUpsForLeads(ctx: PortalContext, leads: LeadRecord[]): Promise<Record<string, FollowUp[]>> {
  if (!canUse(ctx, "followUps") || leads.length === 0) return {}
  const texts = await Promise.all(NOP_LANGS.flatMap((lang) => FOLLOW_UP_KEYS.map((key) => getApprovedText(ctx.orgId, key, lang))))
  const p = ctx.agent.profile
  const agentName = p.displayName ?? p.name
  const agent = {
    agent_name: agentName,
    agent_first_name: firstName(agentName),
    agent_phone: p.displayPhone ?? p.phone,
    agent_email: p.displayEmail ?? p.email,
    enroll_url: qrDestinationFor(ctx.agent.agentId),
  }
  const agentLang: NopLang = p.preferredLanguage ?? "en"
  const out: Record<string, FollowUp[]> = {}
  for (const lead of leads) {
    const lang = lead.consent?.lang ?? agentLang
    const values = { ...agent, lead_name: lead.name, lead_first_name: firstName(lead.name) }
    out[lead.id] = texts
      .filter((t) => t.lang === lang && !t.pending)
      .map((t) => {
        const subject = fillFollowUp(splitFollowUp(t.text).subject, values)
        const body = fillFollowUp(splitFollowUp(t.text).body, values)
        return { n: FOLLOW_UP_KEYS.indexOf(t.key as FollowUpKey) + 1, lang, subject, body, ...followUpLinks(lead, subject, body) }
      })
  }
  return out
}
