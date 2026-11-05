import { NOP_ORG_ID, NOP_ORG_NAME } from "@/lib/enterprise/nop-roster"
import { loadNopAgent, type NopAgentContext } from "@/lib/enterprise/nop-render/agent-context"
import { entitlements, portalTabs, type AgentFeature, type AgentTier, type OrgFeatures, type PortalTab } from "./features"
import { getAgentTier, getOrgFeatures } from "./store"
import { canUse } from "./features"

/** Everything a portal page or route needs to decide what an agent sees and may do. */
export interface PortalContext {
  email: string
  agent: NopAgentContext
  orgId: string
  orgName: string
  tier: AgentTier
  orgFeatures: OrgFeatures
  /** The roster record is active now: required for every Pro/Leader feature. */
  active: boolean
  can: Record<AgentFeature, boolean>
  tabs: PortalTab[]
}

/** The NOP agent behind an account, with tier and org switches, or null if it isn't one. */
export async function loadPortalContext(email: string): Promise<PortalContext | null> {
  const agent = await loadNopAgent(email)
  if (!agent) return null
  const orgId = agent.profile.orgId || NOP_ORG_ID
  const [tier, orgFeatures] = await Promise.all([getAgentTier(email), getOrgFeatures(orgId)])
  const base = { tier, orgFeatures, active: agent.active }
  return { email, agent, orgId, orgName: NOP_ORG_NAME, tier, orgFeatures, active: agent.active, can: entitlements(base), tabs: portalTabs(base) }
}

/** The server-side check every tier-gated route calls. */
export async function canUseFor(email: string, feature: AgentFeature): Promise<boolean> {
  const ctx = await loadPortalContext(email)
  return !!ctx && canUse(ctx, feature)
}
