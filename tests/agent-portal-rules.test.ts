import { describe, it, expect } from "vitest"
import { AGENT_FEATURES, AGENT_TIERS, canUse, defaultOrgFeatures, entitlements, portalTabs, type AgentFeature, type AgentTier, type OrgFeatures } from "@/lib/enterprise/portal/features"

/**
 * canUse(): tier AND org switch, nothing else. Basic gets no Pro/Leader
 * feature at all (including results), Pro gets everything but Team, Leader
 * gets everything; an org switch that's off removes a feature for every tier.
 */

const allOn = defaultOrgFeatures(true)
const agent = (tier: AgentTier, orgFeatures: OrgFeatures = allOn) => ({ tier, orgFeatures })

describe("tiers", () => {
  it("Basic can use none of the Pro/Leader features, results included", () => {
    for (const f of AGENT_FEATURES) expect(canUse(agent("basic"), f), f).toBe(false)
  })

  it("Pro can use everything except Team", () => {
    for (const f of AGENT_FEATURES) expect(canUse(agent("pro"), f), f).toBe(f !== "team")
  })

  it("Leader can use everything", () => {
    for (const f of AGENT_FEATURES) expect(canUse(agent("leader"), f), f).toBe(true)
  })
})

describe("org switches", () => {
  it.each(AGENT_FEATURES)("%s off hides it from every tier", (feature) => {
    const off = { ...allOn, [feature]: false }
    for (const tier of AGENT_TIERS) expect(canUse(agent(tier, off), feature as AgentFeature)).toBe(false)
  })

  it("start ON for the NOP org (Basic Benefits approved them) and OFF for any other org", () => {
    expect(Object.values(defaultOrgFeatures(true)).every(Boolean)).toBe(true)
    expect(Object.values(defaultOrgFeatures(false)).some(Boolean)).toBe(false)
  })
})

describe("tabs", () => {
  it("Basic: Home, Create and Leads (shown as a locked Pro screen); no Team", () => {
    expect(portalTabs(agent("basic"))).toEqual(["home", "create", "leads"])
  })

  it("Pro: no Team; Leader: all four, never more", () => {
    expect(portalTabs(agent("pro"))).toEqual(["home", "create", "leads"])
    expect(portalTabs(agent("leader"))).toEqual(["home", "create", "leads", "team"])
  })

  it("an org with lead capture off shows no Leads tab to anyone; Team off hides it from a Leader", () => {
    expect(portalTabs(agent("leader", { ...allOn, leads: false, team: false }))).toEqual(["home", "create"])
  })

  it("entitlements matches canUse feature by feature", () => {
    const a = agent("pro", { ...allOn, events: false })
    expect(entitlements(a)).toEqual(Object.fromEntries(AGENT_FEATURES.map((f) => [f, canUse(a, f)])))
  })
})
