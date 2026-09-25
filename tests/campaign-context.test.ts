import { describe, expect, it } from "vitest"
import { buildCampaignContext, ctaCandidates } from "@/lib/agent-pipeline/campaign-context"
import { anglesFor, CREATIVE_ANGLES } from "@/lib/agent-pipeline/creative-angles"
import { emptyProduct, productPurpose, type ProductProfile } from "@/lib/product-profile"
import { emptyBusinessProfile, type BusinessProfile } from "@/lib/business-profile"
import { NormalizedIntakeSchema } from "@/lib/agent-pipeline/schemas/intake"

function business(over: Partial<BusinessProfile> = {}): BusinessProfile {
  return {
    ...emptyBusinessProfile(),
    businessName: "Bluegrass Roofing",
    industry: "Roofing contractor",
    services: ["Roof replacement", "Storm damage repair"],
    website: "https://bluegrassroofing.com/",
    contact: { phone: "(270) 555-0142", email: null, address: "Bowling Green, KY", social: [] },
    brand: { logoUrl: "https://x/logo.svg", colors: { primary: "#1b3a5c", secondary: null, accent: "#e8a33d", background: null, text: null }, tone: "friendly" },
    ...over,
  }
}

function product(over: Partial<ProductProfile> = {}): ProductProfile {
  return {
    ...emptyProduct("p1", "Spring roof inspection"),
    offer: "$99 spring roof inspection",
    pricing: "$99",
    features: ["Written report", "Photos included"],
    benefits: ["Catch leaks before winter"],
    limitations: ["New customers only", "Ends June 30"],
    claims: ["Licensed and insured"],
    ctaOpportunities: ["Book a free estimate"],
    ...over,
  }
}

const ids = (n: number) => Array.from({ length: n }, (_, i) => `id-${i}`)

describe("buildCampaignContext", () => {
  it("produces a NormalizedIntake the existing pipeline accepts", () => {
    const r = buildCampaignContext(business(), product(), { variations: 3, ids: ids(3) })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    // The real contract: whatever we build must validate against the schema
    // continuePipelineFromIntake already relies on.
    expect(() => NormalizedIntakeSchema.parse(r.intake)).not.toThrow()
  })

  it("creates one flyer request per variation, with distinct angles", () => {
    const r = buildCampaignContext(business(), product(), { variations: 4, ids: ids(4) })
    if (!r.ok) throw new Error("expected ok")
    expect(r.intake.flyerRequests).toHaveLength(4)
    expect(r.intake.batchSize).toBe(4)
    const angleNames = r.angles.map((a) => a.name)
    expect(new Set(angleNames).size).toBe(4) // genuinely different, not repeated
    // each request carries its own creative direction
    for (const req of r.intake.flyerRequests) {
      expect(req.notes).toContain("CREATIVE ANGLE")
    }
    expect(r.intake.flyerRequests[0].notes).not.toBe(r.intake.flyerRequests[1].notes)
  })

  it("inherits brand assets so the client never re-uploads a logo", () => {
    const r = buildCampaignContext(business(), product(), { variations: 1, ids: ids(1) })
    if (!r.ok) throw new Error("expected ok")
    expect(r.intake.brandAssets.logoUrl).toBe("https://x/logo.svg")
    expect(r.intake.brandAssets.existingColors).toEqual(["#1b3a5c", "#e8a33d"])
    expect(r.intake.contact.phone).toBe("(270) 555-0142")
    expect(r.intake.voiceTonePreference).toBe("friendly")
  })

  it("puts offer conditions in the brief as MUST APPEAR", () => {
    const r = buildCampaignContext(business(), product(), { variations: 1, ids: ids(1) })
    if (!r.ok) throw new Error("expected ok")
    const notes = r.intake.flyerRequests[0].notes!
    expect(notes).toContain("MUST APPEAR")
    expect(notes).toContain("New customers only")
    expect(notes).toContain("Ends June 30")
  })

  it("forbids invention explicitly in every brief", () => {
    const r = buildCampaignContext(business(), product(), { variations: 2, ids: ids(2) })
    if (!r.ok) throw new Error("expected ok")
    for (const req of r.intake.flyerRequests) {
      expect(req.notes).toMatch(/Do not add prices, dates, phone numbers/i)
    }
  })

  it("never leaks a price the product does not have", () => {
    const r = buildCampaignContext(business(), product({ pricing: null, offer: null }), { variations: 1, ids: ids(1) })
    if (!r.ok) throw new Error("expected ok")
    expect(r.intake.flyerRequests[0].notes).not.toMatch(/PRICING/)
    expect(r.intake.flyerRequests[0].notes).not.toMatch(/OFFER/)
  })

  it("refuses when there is no business", () => {
    const r = buildCampaignContext(null, product(), { variations: 1, ids: ids(1) })
    expect(r).toMatchObject({ ok: false, reason: "no_business" })
  })

  it("refuses when the business has no way to be contacted", () => {
    const b = business({ contact: { phone: null, email: null, address: null, social: [] }, website: null })
    const r = buildCampaignContext(b, product(), { variations: 1, ids: ids(1) })
    expect(r).toMatchObject({ ok: false, reason: "no_contact" })
  })

  it("falls back to website or email when there is no phone", () => {
    const b = business({ contact: { phone: null, email: "a@b.com", address: null, social: [] } })
    const r = buildCampaignContext(b, product(), { variations: 1, ids: ids(1) })
    if (!r.ok) throw new Error("expected ok")
    expect(r.intake.contact.phone).toBe("a@b.com")
  })

  it("caps requests at the number of ids supplied", () => {
    const r = buildCampaignContext(business(), product(), { variations: 5, ids: ids(2) })
    if (!r.ok) throw new Error("expected ok")
    expect(r.intake.flyerRequests).toHaveLength(2)
  })
})

describe("ctaCandidates", () => {
  it("prefers the product's own CTA opportunities", () => {
    expect(ctaCandidates(business(), product())).toEqual(["Book a free estimate"])
  })

  it("derives from real contact channels when the product has none", () => {
    const ctas = ctaCandidates(business(), product({ ctaOpportunities: [] }))
    expect(ctas).toContain("Call (270) 555-0142")
    expect(ctas).toContain("Visit our website")
  })

  it("never suggests a channel the business does not have", () => {
    const b = business({ website: null, contact: { phone: null, email: null, address: null, social: [] } })
    // no phone, no site, no email -> nothing suggested rather than a fake CTA
    expect(ctaCandidates(b, product({ ctaOpportunities: [] }))).toEqual([])
  })
})

describe("anglesFor", () => {
  it("only offers urgency when the product really has a deadline", () => {
    const withDeadline = anglesFor(product(), 5).map((a) => a.id)
    expect(withDeadline).toContain("urgency")
    const noDeadline = anglesFor(product({ limitations: ["One per household"] }), 5).map((a) => a.id)
    expect(noDeadline).not.toContain("urgency")
  })

  it("only offers trust-led when the client supplied claims", () => {
    expect(anglesFor(product({ claims: [] }), 5).map((a) => a.id)).not.toContain("trust-led")
  })

  it("only offers offer-led when there is an offer or a price", () => {
    expect(anglesFor(product({ offer: null, pricing: null }), 5).map((a) => a.id)).not.toContain("offer-led")
  })

  it("still returns the requested count for a bare product", () => {
    const bare = emptyProduct("p", "Dog grooming")
    expect(anglesFor(bare, 4)).toHaveLength(4)
  })

  it("returns exactly the requested count, never more", () => {
    for (const n of [1, 2, 3, 4, 5]) expect(anglesFor(product(), n)).toHaveLength(n)
  })

  it("every angle has a non-empty brief", () => {
    for (const a of CREATIVE_ANGLES) expect(a.brief.length).toBeGreaterThan(40)
  })
})

describe("productPurpose", () => {
  it("leads with the offer when there is one", () => {
    expect(productPurpose(product())).toContain("$99 spring roof inspection")
  })
  it("falls back to the name", () => {
    expect(productPurpose(emptyProduct("p", "Dog grooming"))).toBe("Dog grooming")
  })
})
