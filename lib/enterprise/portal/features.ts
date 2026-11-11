// Agent tiers and the features they unlock. Pure: no Redis, no request, so the
// rule is unit-tested and shared by pages, API routes and admin.
//
//   basic   flyers only, no analytics of any kind (every agent starts here)
//   pro     everything in Phases 2–6 and 8, including results
//   leader  everything in Pro, plus the team dashboard
//
// Every Pro/Leader feature can also be switched off per org, and needs the
// agent's roster record to be active right now (a suspended or terminated Pro
// agent gets none of it). canUse() checks all three, and is the ONE place
// these rules live.

export const AGENT_TIERS = ["basic", "pro", "leader"] as const
export type AgentTier = (typeof AGENT_TIERS)[number]

export function isAgentTier(v: unknown): v is AgentTier {
  return typeof v === "string" && (AGENT_TIERS as readonly string[]).includes(v)
}

export const AGENT_FEATURES = ["results", "leads", "qrLeadPage", "agentPage", "agentPhoto", "followUps", "followUpReminders", "emailSignature", "events", "recruiting", "team", "printRequests", "monthlyEmail"] as const
export type AgentFeature = (typeof AGENT_FEATURES)[number]

export function isAgentFeature(v: unknown): v is AgentFeature {
  return typeof v === "string" && (AGENT_FEATURES as readonly string[]).includes(v)
}

/** The lowest tier each feature needs. */
export const FEATURE_TIER: Record<AgentFeature, AgentTier> = {
  results: "pro",
  leads: "pro",
  qrLeadPage: "pro",
  agentPage: "pro",
  agentPhoto: "pro",
  followUps: "pro",
  followUpReminders: "pro",
  emailSignature: "pro",
  events: "pro",
  recruiting: "pro",
  team: "leader",
  printRequests: "pro",
  monthlyEmail: "pro",
}

/** For the admin screens. Admin is English-only. */
export const FEATURE_LABELS: Record<AgentFeature, string> = {
  results: "Results (scans and counts)",
  leads: "Lead capture",
  qrLeadPage: "QR opens a page (Enroll now + lead form) instead of forwarding",
  agentPage: "Personal agent page + booking",
  agentPhoto: "Photo on the personal agent page",
  followUps: "Follow-up messages",
  followUpReminders: "Daily follow-up reminder email",
  emailSignature: "Email signature (with the personal page link and QR)",
  events: "Event kit",
  recruiting: "Recruiting kit",
  team: "Team dashboard (Leader)",
  printRequests: "Print requests",
  monthlyEmail: "Monthly results email",
}

const RANK: Record<AgentTier, number> = { basic: 0, pro: 1, leader: 2 }

export type OrgFeatures = Record<AgentFeature, boolean>

/**
 * Off for every org until an admin switches them on, NOP included: changes
 * Basic Benefits haven't approved yet. qrLeadPage changes where a printed QR
 * lands, so it waits for their yes. agentPhoto puts an agent's photo on their
 * public page, which they haven't said yes to either.
 */
// events: off until the privacy policy covers event pages and their reminder email; admin turns it on.
// recruiting: off until the owner has reviewed it (recruiters see their recruits' names and status); admin turns it on.
// team: off until the privacy text covers what Leaders see of their team; admin turns it on.
// printRequests, monthlyEmail: off until the owner switches them on (Phase 8).
export const FEATURES_OFF_BY_DEFAULT: readonly AgentFeature[] = ["qrLeadPage", "agentPhoto", "events", "recruiting", "team", "printRequests", "monthlyEmail"]

/** Basic Benefits approved the Phase 1 feature list, so the NOP org starts with those on; any other org starts with none. */
export function defaultOrgFeatures(orgIsNop: boolean): OrgFeatures {
  return Object.fromEntries(AGENT_FEATURES.map((f) => [f, orgIsNop && !FEATURES_OFF_BY_DEFAULT.includes(f)])) as OrgFeatures
}

/** What canUse needs to know about an agent. `active`: their roster record is active now. */
export interface FeatureSubject {
  tier: AgentTier
  orgFeatures: OrgFeatures
  active: boolean
}

/** Tier AND org switch AND an active roster record. Nothing else unlocks a feature. */
export function canUse(agent: FeatureSubject, feature: AgentFeature): boolean {
  return agent.active === true && RANK[agent.tier] >= RANK[FEATURE_TIER[feature]] && agent.orgFeatures[feature] === true
}

/** Every feature at once, for a page or the /api/enterprise/agent/portal answer. */
export function entitlements(agent: FeatureSubject): Record<AgentFeature, boolean> {
  return Object.fromEntries(AGENT_FEATURES.map((f) => [f, canUse(agent, f)])) as Record<AgentFeature, boolean>
}

/**
 * The bottom navigation. Home and Create always; Leads whenever the org has
 * lead capture on (a Basic agent sees it as a short locked "Pro" screen);
 * Team only for a Leader whose org has it on. An org switch that's off hides
 * its tab completely, for every tier.
 */
export type PortalTab = "home" | "create" | "leads" | "team"
export function portalTabs(agent: FeatureSubject): PortalTab[] {
  const tabs: PortalTab[] = ["home", "create"]
  if (agent.orgFeatures.leads) tabs.push("leads")
  if (canUse(agent, "team")) tabs.push("team")
  return tabs
}
