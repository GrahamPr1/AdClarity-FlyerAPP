import { describe, it, expect } from "vitest"
import { findVerbatimViolations, findInventedComplianceLanguage, toAssetContext, ENTERPRISE_MODE_PROMPT, type EnterpriseAssetContext } from "@/lib/agent-pipeline/enterprise"
import { FLYER_AGENT_SYSTEM_PROMPT } from "@/lib/agent-pipeline/prompts/flyer"
import type { CampaignSource, ContentAsset } from "@/lib/types"

const DISCLOSURE = "Guarantees are backed by the claims-paying ability of the issuer."
const LIBRARY: EnterpriseAssetContext[] = [
  { assetId: "a1", label: "Compliance Disclosure 2026", locked: true, content: DISCLOSURE },
  { assetId: "a2", label: "Carrier Product Sheet v3", locked: false, content: "Coverage options for retirees." },
]
const CLAIM_LOCKED: CampaignSource[] = [{ assetId: "a1", label: "Compliance Disclosure 2026", locked: true }]

describe("the verbatim check catches a paraphrase (the case that matters)", () => {
  it("FLAGS a reworded locked disclosure", () => {
    // The deliberately broken case. A prompt asked for verbatim; the model
    // "improved" it. This is a compliance failure nobody notices until it
    // matters, which is why it is checked in code.
    const paraphrased = `<html><body><p>Guarantees depend on the issuer's ability to pay claims.</p></body></html>`
    const v = findVerbatimViolations(paraphrased, CLAIM_LOCKED, LIBRARY)
    expect(v).toHaveLength(1)
    expect(v[0].assetId).toBe("a1")
  })

  it("PASSES when the locked text is reproduced exactly", () => {
    const correct = `<html><body><p class="disclosure">${DISCLOSURE}</p></body></html>`
    expect(findVerbatimViolations(correct, CLAIM_LOCKED, LIBRARY)).toHaveLength(0)
  })

  it("flags a single dropped word", () => {
    const clipped = `<html><body><p>Guarantees are backed by the ability of the issuer.</p></body></html>`
    expect(findVerbatimViolations(clipped, CLAIM_LOCKED, LIBRARY)).toHaveLength(1)
  })

  it("flags altered punctuation, which changes legal meaning", () => {
    const repunctuated = `<html><body><p>Guarantees are backed by the claims paying ability of the issuer.</p></body></html>`
    expect(findVerbatimViolations(repunctuated, CLAIM_LOCKED, LIBRARY)).toHaveLength(1)
  })
})

describe("what must NOT be treated as tampering", () => {
  it("allows the text to be wrapped in markup and styled", () => {
    const styled = `<html><body><div class="x"><span style="font-weight:600">${DISCLOSURE}</span></div></body></html>`
    expect(findVerbatimViolations(styled, CLAIM_LOCKED, LIBRARY)).toHaveLength(0)
  })

  it("allows reflowed whitespace", () => {
    const reflowed = `<html><body><p>Guarantees are backed by the\n   claims-paying ability\n of the issuer.</p></body></html>`
    expect(findVerbatimViolations(reflowed, CLAIM_LOCKED, LIBRARY)).toHaveLength(0)
  })

  it("allows HTML-entity and smart-quote encoding", () => {
    const lib: EnterpriseAssetContext[] = [{ assetId: "a3", label: "CTA", locked: true, content: `Call today — it's free & simple.` }]
    const claim: CampaignSource[] = [{ assetId: "a3", label: "CTA", locked: true }]
    const encoded = `<html><body><p>Call today — it&#39;s free &amp; simple.</p></body></html>`
    expect(findVerbatimViolations(encoded, claim, lib)).toHaveLength(0)
  })
})

describe("scope of the check", () => {
  it("ignores non-locked assets — those may legitimately be paraphrased", () => {
    const claim: CampaignSource[] = [{ assetId: "a2", label: "Carrier Product Sheet v3", locked: false }]
    expect(findVerbatimViolations("<html><body><p>Options for people nearing retirement.</p></body></html>", claim, LIBRARY)).toHaveLength(0)
  })

  it("ignores a locked asset the agent correctly chose NOT to use", () => {
    // Checking the whole library would flag every disclosure the agent
    // rightly left out, making the signal useless.
    expect(findVerbatimViolations("<html><body><p>Nothing here.</p></body></html>", [], LIBRARY)).toHaveLength(0)
  })

  it("ignores a claimed source that isn't in the library", () => {
    const claim: CampaignSource[] = [{ assetId: "ghost", label: "Missing", locked: true }]
    expect(findVerbatimViolations("<html><body></body></html>", claim, LIBRARY)).toHaveLength(0)
  })
})

describe("asset context handed to the agent", () => {
  const base = { orgId: "o1", createdAt: new Date(0).toISOString() }
  it("passes text assets through verbatim", () => {
    const assets: ContentAsset[] = [{ ...base, id: "a1", assetType: "text", sourceLabel: "L", locked: true, content: DISCLOSURE }]
    expect(toAssetContext(assets)[0].content).toBe(DISCLOSURE)
  })

  it("marks binary assets as unquotable rather than pretending they are prose", () => {
    // A Blob URL quoted into a flyer as if it were approved copy would be
    // both nonsense and a false provenance claim.
    const assets: ContentAsset[] = [{ ...base, id: "a2", assetType: "logo", sourceLabel: "Logo", locked: true, content: "https://blob/logo.png" }]
    expect(toAssetContext(assets)[0].content).toContain("not quotable")
  })
})

describe("SMB prompt is byte-for-byte unchanged", () => {
  it("enterprise instructions are appended, never woven in", () => {
    const enterprise = FLYER_AGENT_SYSTEM_PROMPT + ENTERPRISE_MODE_PROMPT
    expect(enterprise.startsWith(FLYER_AGENT_SYSTEM_PROMPT)).toBe(true)
    expect(FLYER_AGENT_SYSTEM_PROMPT).not.toContain("ENTERPRISE MODE")
    expect(FLYER_AGENT_SYSTEM_PROMPT).not.toContain("approvedAssets")
  })
})

describe("invented compliance language (check 2 — a different failure)", () => {
  const LOCKED = "Guarantees are backed solely by the claims-paying ability of Northstar Mutual. This material is for educational purposes only and is not a recommendation to buy any product."
  const LIB: EnterpriseAssetContext[] = [
    { assetId: "d1", label: "Compliance Disclosure 2026", locked: true, content: LOCKED },
    { assetId: "p1", label: "Product Sheet v3", locked: false, content: "Options include guaranteed lifetime income and spousal continuation." },
  ]

  it("FLAGS the exact text a real generation invented", () => {
    // Verbatim from the first enterprise run: the model wrote this itself and
    // placed it immediately before the genuine locked disclosure.
    const html = `<html><body><p>This event is for educational purposes only and is not intended as individualized financial, legal, or tax advice. No purchase, obligation, or commitment is necessary to attend.</p><p>${LOCKED}</p></body></html>`
    const found = findInventedComplianceLanguage(html, LIB)
    expect(found.length).toBeGreaterThan(0)
  })

  it("does NOT flag the approved disclosure itself", () => {
    // The locked text legitimately contains "guarantees" and "not a
    // recommendation to buy". Stripping approved text BEFORE scanning is what
    // stops this check flagging the very thing it exists to protect.
    expect(findInventedComplianceLanguage(`<html><body><p>${LOCKED}</p></body></html>`, LIB)).toHaveLength(0)
  })

  it("does not flag approved text the agent used without claiming it", () => {
    const html = `<html><body><p>Options include guaranteed lifetime income and spousal continuation.</p></body></html>`
    expect(findInventedComplianceLanguage(html, LIB)).toHaveLength(0)
  })

  it("leaves permitted connective copy alone", () => {
    const html = `<html><body><h1>Retirement Income Workshop</h1><p>Thursday, October 8 at 6:00 PM, Bowling Green Public Library.</p><p>Dana Reyes, Retirement Income Specialist. RSVP: 555-0142. Seating is limited.</p></body></html>`
    expect(findInventedComplianceLanguage(html, LIB)).toHaveLength(0)
  })

  it("catches an invented guarantee claim even when short", () => {
    const html = `<html><body><p>Your income is guaranteed for life.</p></body></html>`
    expect(findInventedComplianceLanguage(html, LIB)[0].pattern).toBe("guarantee statement")
  })
})

describe("phrase-level stripping of unlocked assets", () => {
  // The real unlocked asset, and the bullets a real generation reformatted it
  // into. Permitted — unlocked content may be reworded — but the reformatting
  // meant the exact-match strip missed it and the bare `guarantee` pattern
  // fired on asset-backed copy.
  const SHEET =
    "Northstar Mutual's retirement income solutions are designed for people within ten years of retiring. Options include guaranteed lifetime income, flexible withdrawal schedules, and spousal continuation."
  const LOCKED =
    "Guarantees are backed solely by the claims-paying ability of Northstar Mutual. This material is for educational purposes only and is not a recommendation to buy any product."
  const LIB: EnterpriseAssetContext[] = [
    { assetId: "d1", label: "Compliance Disclosure 2026", locked: true, content: LOCKED },
    { assetId: "p1", label: "Retirement Income Product Sheet v3", locked: false, content: SHEET },
  ]

  it("does NOT flag an unlocked asset reformatted into bullets", () => {
    const html = `<html><body><ul><li>Guaranteed lifetime income</li><li>Flexible withdrawal schedules</li><li>Spousal continuation options</li></ul><p>Seating is limited. RSVP requested.</p></body></html>`
    expect(findInventedComplianceLanguage(html, LIB)).toHaveLength(0)
  })

  it("still flags the text the first real generation invented", () => {
    // The regression guard for the whole check: this shares no approved
    // phrasing, so pass 2 leaves it entirely intact.
    const html = `<html><body><p>This event is for educational purposes only and is not intended as individualized financial, legal, or tax advice. No purchase, obligation, or commitment is necessary to attend.</p><p>${LOCKED}</p></body></html>`
    expect(findInventedComplianceLanguage(html, LIB).length).toBeGreaterThan(0)
  })

  it("does not let a LOCKED asset lend its phrasing to invented text", () => {
    // "backed solely by the claims-paying ability" is locked phrasing. Reused
    // around a different carrier it is invented compliance language, and pass 2
    // must not dissolve it — that path belongs to findVerbatimViolations.
    const html = `<html><body><p>Guarantees are backed solely by the claims-paying ability of Southstar Casualty.</p></body></html>`
    expect(findInventedComplianceLanguage(html, LIB).length).toBeGreaterThan(0)
  })

  it("does not strip a two-word overlap with an unlocked asset", () => {
    // "lifetime income" alone is not evidence the copy came from the library.
    const html = `<html><body><p>Every lifetime income plan we write is guaranteed to beat your current one.</p></body></html>`
    expect(findInventedComplianceLanguage(html, LIB).length).toBeGreaterThan(0)
  })
})
