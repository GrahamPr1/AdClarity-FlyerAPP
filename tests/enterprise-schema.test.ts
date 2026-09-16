import { describe, it, expect } from "vitest"
import { campaignSources } from "@/lib/store"
import type { CampaignSource, ContentAsset, EnterpriseOrg, AgentProfile } from "@/lib/types"

/**
 * Pure-logic cover only. The Redis CRUD helpers are exercised against a real
 * database by scripts/verify-enterprise-schema.ts — store.ts constructs its
 * Redis client at import time, so round-trip assertions belong in a script
 * with a live connection, not in the pure vitest suite.
 */
describe("campaign sources are additive, never imposed on SMB records", () => {
  it("normalises an absent sources field to an empty array", () => {
    // SMB flyers have no `sources` key at all. Defaulting it to [] on write
    // would change the stored JSON of records that have nothing to do with
    // the content library, so absence is the normal case and must be safe.
    expect(campaignSources({ sources: undefined })).toEqual([])
  })

  it("passes a populated sources list through untouched", () => {
    const sources: CampaignSource[] = [
      { assetId: "a1", label: "Compliance Disclosure 2026", locked: true },
      { assetId: "a2", label: "Carrier Product Sheet v3", locked: false },
    ]
    expect(campaignSources({ sources })).toEqual(sources)
  })

  it("preserves the locked flag, which is the compliance-relevant bit", () => {
    const out = campaignSources({ sources: [{ assetId: "a", label: "L", locked: true }] })
    expect(out[0].locked).toBe(true)
  })
})

describe("enterprise type shapes", () => {
  it("a content asset carries everything the Sources panel needs", () => {
    const asset: ContentAsset = {
      id: "a1", orgId: "org1", assetType: "text",
      sourceLabel: "Compliance Disclosure 2026", locked: true,
      content: "Guarantees are backed by the claims-paying ability of the issuer.",
      createdAt: new Date(0).toISOString(),
    }
    expect(asset.sourceLabel).toBeTruthy()
    expect(typeof asset.locked).toBe("boolean")
  })

  it("an org holds only asset ids, not embedded assets", () => {
    // Keeps a single asset writable without rewriting the whole library.
    const org: EnterpriseOrg = { id: "org1", name: "Northstar Mutual (fictional)", assets: ["a1", "a2"] }
    expect(org.assets.every((a) => typeof a === "string")).toBe(true)
  })

  it("an agent profile is its own record, not a CampaignDefaults extension", () => {
    // Overlap with CampaignDefaults is one field (name ~ contactName); phone
    // isn't on it at all. See the note on AgentProfile in lib/types.ts.
    const p: AgentProfile = {
      name: "Dana Reyes", title: "Retirement Specialist", phone: "555-0142",
      email: "agent@example.invalid", headshotUrl: null, licenseStates: ["KY", "TN"],
      qrDestination: "https://example.invalid/dana", orgId: "org1",
      savedAt: new Date(0).toISOString(),
    }
    expect(p.licenseStates).toContain("KY")
    expect(p.orgId).toBe("org1")
  })
})
