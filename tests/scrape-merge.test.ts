import { describe, it, expect } from "vitest"
import { mergeScrapedContact } from "@/lib/agent-pipeline/scrape-merge"
import type { NormalizedIntake } from "@/lib/agent-pipeline/schemas/intake"

function extracted(overrides: Partial<NormalizedIntake["contact"]> = {}): NormalizedIntake {
  return {
    businessName: "Bluegrass Roofing",
    industry: "Residential roofing",
    yearsInBusiness: null,
    services: ["Roof replacement"],
    targetAudience: "Homeowners",
    contact: {
      phone: "",
      address: null,
      website: "bluegrassroofing.com",
      social: null,
      contactName: null,
      ...overrides,
    },
    brandAssets: { logoUrl: null, existingColors: null, existingFontsNote: null },
    voiceTonePreference: "professional",
    fontStylePreference: "modern",
    photos: [],
    wantsAiPhotos: false,
    flyerRequests: [{ id: "flyer-1", purpose: "General business flyer", notes: null }],
    batchSize: 1,
    normalizationNotes: [],
  } as unknown as NormalizedIntake
}

const noCrawlAssets = { logoUrl: null, colors: [] }

describe("phone precedence — the original scraper bug", () => {
  it("case 3: user provides a phone, website publishes none → user's phone is used", () => {
    const out = mergeScrapedContact(extracted({ phone: "" }), noCrawlAssets, { phone: "(555) 014-2200" })
    expect(out.contact.phone).toBe("(555) 014-2200")
  })

  it("case 4: user phone and a DIFFERENT website phone → user's phone wins", () => {
    const out = mergeScrapedContact(extracted({ phone: "(800) 999-0000" }), noCrawlAssets, {
      phone: "(555) 014-2200",
    })
    expect(out.contact.phone).toBe("(555) 014-2200")
    // The site's number must not survive anywhere in contact.
    expect(JSON.stringify(out.contact)).not.toContain("800) 999-0000")
  })

  it("case 1: website publishes a phone and the user left the field blank → site phone is the fallback", () => {
    const out = mergeScrapedContact(extracted({ phone: "(800) 999-0000" }), noCrawlAssets, { phone: "" })
    expect(out.contact.phone).toBe("(800) 999-0000")
  })

  it("case 2: neither has a phone → empty, but the merge still succeeds (never throws)", () => {
    const out = mergeScrapedContact(extracted({ phone: "" }), noCrawlAssets, {})
    expect(out.contact.phone).toBe("")
    expect(out.businessName).toBe("Bluegrass Roofing")
  })

  it("whitespace-only user input does not beat a real website phone", () => {
    const out = mergeScrapedContact(extracted({ phone: "(800) 999-0000" }), noCrawlAssets, { phone: "   " })
    expect(out.contact.phone).toBe("(800) 999-0000")
  })

  it("trims the user's phone", () => {
    const out = mergeScrapedContact(extracted(), noCrawlAssets, { phone: "  (555) 014-2200  " })
    expect(out.contact.phone).toBe("(555) 014-2200")
  })
})

describe("contact name precedence", () => {
  it("the name typed on the form wins over anything scraped", () => {
    const out = mergeScrapedContact(extracted({ contactName: "Web Admin" }), noCrawlAssets, { fullName: "Jane Smith" })
    expect(out.contact.contactName).toBe("Jane Smith")
  })

  it("falls back to the scraped name when the form field is blank", () => {
    const out = mergeScrapedContact(extracted({ contactName: "Web Admin" }), noCrawlAssets, { fullName: "" })
    expect(out.contact.contactName).toBe("Web Admin")
  })
})

describe("brand assets — code wins over the model", () => {
  it("uses the crawler's logo, which the agent never sees (it only gets text)", () => {
    const out = mergeScrapedContact(extracted(), { logoUrl: "https://x.com/logo.png", colors: [] }, {})
    expect(out.brandAssets.logoUrl).toBe("https://x.com/logo.png")
  })

  it("uses crawled colors when there are any", () => {
    const out = mergeScrapedContact(extracted(), { logoUrl: null, colors: ["#1b3a5c"] }, {})
    expect(out.brandAssets.existingColors).toEqual(["#1b3a5c"])
  })

  it("falls back to the agent's colors when the crawler found none", () => {
    const base = extracted()
    base.brandAssets.existingColors = ["#abcdef"]
    const out = mergeScrapedContact(base, { logoUrl: null, colors: [] }, {})
    expect(out.brandAssets.existingColors).toEqual(["#abcdef"])
  })
})

describe("everything else passes through untouched", () => {
  it("preserves business identity and services", () => {
    const out = mergeScrapedContact(extracted(), noCrawlAssets, { phone: "(555) 014-2200" })
    expect(out.businessName).toBe("Bluegrass Roofing")
    expect(out.industry).toBe("Residential roofing")
    expect(out.services).toEqual(["Roof replacement"])
    expect(out.contact.website).toBe("bluegrassroofing.com")
  })

  it("a null address is preserved — it must never block a scrape", () => {
    const out = mergeScrapedContact(extracted({ address: null }), noCrawlAssets, { phone: "(555) 014-2200" })
    expect(out.contact.address).toBeNull()
  })
})
