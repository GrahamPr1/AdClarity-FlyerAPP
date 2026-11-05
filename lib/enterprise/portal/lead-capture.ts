import { getAgentIdOwner, getRosterRecord } from "@/lib/enterprise/agents-store"
import { AGENT_ID_RE, isGenerationStatus, qrDestinationFor } from "@/lib/enterprise/nop-roster"
import type { NopLang } from "@/lib/enterprise/nop-i18n"
import { canUse } from "./features"
import { loadPortalContext } from "./context"
import { getApprovedText, type ApprovedText } from "./approved-text"

// Whether an agent's public lead form (/a/{agentId}/contact) takes leads, and
// in which language. The page and POST /api/enterprise/nop/leads/{agentId}
// both ask this, so the server decides, never the form.
//
//   unavailable   no such agent, no account holds the ID, roster not active,
//                 not Pro/Leader, or the org has lead capture off
//   coming_soon   everything else is in place, but the consent text for this
//                 language is still the placeholder: the page shows "Coming soon"
//   open          the form shows, with the approved consent text verbatim

export type LeadCapture =
  | { state: "unavailable" }
  | { state: "coming_soon"; agentId: string; agentName: string; enrollUrl: string }
  | { state: "open"; agentId: string; agentName: string; enrollUrl: string; owner: string; agentLang: NopLang; consent: ApprovedText }

export async function agentLeadCapture(agentId: string, lang: NopLang): Promise<LeadCapture> {
  if (!AGENT_ID_RE.test(agentId)) return { state: "unavailable" }
  const roster = await getRosterRecord(agentId)
  if (!isGenerationStatus(roster)) return { state: "unavailable" }
  const owner = await getAgentIdOwner(agentId)
  if (!owner) return { state: "unavailable" }
  const ctx = await loadPortalContext(owner)
  if (!ctx || ctx.agent.agentId !== agentId || !canUse(ctx, "leads")) return { state: "unavailable" }

  const agentName = ctx.agent.profile.displayName ?? ctx.agent.profile.name
  const enrollUrl = qrDestinationFor(agentId)
  const consent = await getApprovedText(ctx.orgId, "leadConsent", lang)
  if (consent.pending) return { state: "coming_soon", agentId, agentName, enrollUrl }
  return { state: "open", agentId, agentName, enrollUrl, owner, agentLang: ctx.agent.profile.preferredLanguage ?? "en", consent }
}
