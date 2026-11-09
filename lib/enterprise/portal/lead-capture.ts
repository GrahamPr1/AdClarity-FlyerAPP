import { getAgentIdOwner, getRosterRecord } from "@/lib/enterprise/agents-store"
import { nopQrTarget, qrDestinationFor } from "@/lib/enterprise/nop-roster"
import { agentIdForQrCode } from "@/lib/enterprise/nop-qr-code"
import { getEnrollDomain } from "@/lib/enterprise/nop-enroll-domain"
import type { NopLang } from "@/lib/enterprise/nop-i18n"
import { canUse } from "./features"
import { loadPortalContext } from "./context"
import { getApprovedText, type ApprovedText } from "./approved-text"

// What a scan of oneflyer.org/a/{code} does. The QR route, the lead page
// (/a/{code}/contact) and POST /api/enterprise/nop/leads/{code} all ask this,
// so the server alone decides.
//
//   forward     the default for everyone: straight to the enrollment URL
//               (nopQrTarget: the agent's own while active, else the program's)
//   lead_page   option (a), only when ALL hold: the code is an active roster
//               agent's, an account holds the ID, they can use lead capture,
//               and their org has switched qrLeadPage on (off by default).
//               The page puts "Enroll now" (same enrollment URL) first and
//               the lead form below it.

export type QrLanding =
  | { state: "forward"; agentId: string | null; onRoster: boolean; target: string }
  | { state: "lead_page"; agentId: string; agentName: string; enrollUrl: string; owner: string; orgId: string; agentLang: NopLang }

export async function qrLanding(code: string): Promise<QrLanding> {
  const [agentId, domain] = await Promise.all([agentIdForQrCode(code), getEnrollDomain()])
  if (!agentId) return { state: "forward", agentId: null, onRoster: false, target: nopQrTarget(null, null, domain) }
  const roster = await getRosterRecord(agentId)
  const forward: QrLanding = { state: "forward", agentId, onRoster: !!roster, target: nopQrTarget(agentId, roster, domain) }
  if (roster?.status !== "active") return forward
  const owner = await getAgentIdOwner(agentId)
  if (!owner) return forward
  const ctx = await loadPortalContext(owner)
  if (!ctx || ctx.agent.agentId !== agentId || !canUse(ctx, "leads") || !canUse(ctx, "qrLeadPage")) return forward
  return {
    state: "lead_page",
    agentId,
    agentName: ctx.agent.profile.displayName ?? ctx.agent.profile.name,
    enrollUrl: qrDestinationFor(agentId, domain),
    owner,
    orgId: ctx.orgId,
    agentLang: ctx.agent.profile.preferredLanguage ?? "en",
  }
}

/** The consent line for the lead form in this language; pending = show "Coming soon" and accept nothing. */
export function leadConsent(orgId: string, lang: NopLang): Promise<ApprovedText> {
  return getApprovedText(orgId, "leadConsent", lang)
}

/** The fill-ins the consent text may use. {agent_name}: the agent's display name. */
export const CONSENT_FIELDS = ["agent_name"] as const

/**
 * The consent text exactly as the person sees it and as it is stored with the
 * lead: the approved wording with {agent_name} filled in. Page and API both
 * call this with the same agent, so what is stored is what was shown.
 */
export function fillConsent(text: string, agentName: string): string {
  return text.replace(/\{agent_name\}/g, agentName)
}

/** For the admin save: only known fill-ins. */
export function checkConsentText(text: string): { ok: true } | { ok: false; message: string } {
  const unknown = [...text.matchAll(/\{([^{}\s]*)\}/g)].map((m) => m[1]).filter((f) => !(CONSENT_FIELDS as readonly string[]).includes(f))
  if (unknown.length) return { ok: false, message: `Unknown fill-in ${unknown.map((f) => `{${f}}`).join(", ")}. Use only {agent_name}.` }
  return { ok: true }
}
