import { describe, it, expect } from "vitest"
import { enforceTypedPrecedence } from "@/lib/agent-pipeline/pipeline"
import { toGoogleSheetsCsvExportUrl } from "@/lib/agent-pipeline/info-link"
import type { IntakeSubmission } from "@/lib/types"
import type { NormalizedIntake } from "@/lib/agent-pipeline/schemas/intake"

/**
 * A saved business profile (PDF and/or Google Sheet) now feeds flyer intake,
 * not just form-fill.
 *
 * The precedence rule is enforced in CODE, not just stated in the prompt: a
 * months-old PDF silently overwriting the phone number someone just typed
 * would be invisible — the flyer would simply carry the wrong number.
 */

const submission = (over: Partial<IntakeSubmission> = {}): IntakeSubmission => ({
  planId: null, businessCategory: "Contractor", businessName: "Pearl Roofing",
  industry: "Roofing", yearsInBusiness: "12", services: [{ id: "s1", name: "Roof replacement" }],
  preferredStyle: "modern", voiceTone: "straightforward", targetAudience: "Homeowners",
  contact: { email: "owner@example.test", phone: "555-0142", address: "Bowling Green, KY", website: "", socialHandles: "" },
  wantsAiPhotos: false, wantsQrCode: true, flyerNotes: "Spring special", websitePreferences: "",
  ...over,
})

/** What the agent returns having read the PDF/sheet — deliberately stale. */
const fromProfile = (): NormalizedIntake =>
  ({
    businessName: "Pearl Roofing & Siding LLC", industry: "Roofing and siding", yearsInBusiness: 9,
    services: ["Roof replacement", "Siding", "Gutter cleaning"], targetAudience: "Property managers",
    contact: { phone: "555-9999", address: "Old Depot Rd", website: "pearlroofing.example", social: null, contactName: null },
    brandAssets: { logoUrl: null, existingColors: null, existingFontsNote: null },
    voiceTonePreference: "straightforward", fontStylePreference: "modern",
    photos: [], wantsAiPhotos: false, wantsQrCode: true,
    flyerRequests: [{ id: "f1", purpose: "Spring special", notes: null }],
    websitePreferences: null, existingMaterialsNotes: null, batchSize: 1,
  }) as unknown as NormalizedIntake

describe("typed input wins over the saved profile", () => {
  it("keeps the typed business name, industry and audience", () => {
    const data = fromProfile()
    enforceTypedPrecedence(data, submission())
    expect(data.businessName).toBe("Pearl Roofing")
    expect(data.industry).toBe("Roofing")
    expect(data.targetAudience).toBe("Homeowners")
  })

  it("keeps the typed phone and address over stale profile values", () => {
    // The failure that would be invisible: a flyer printed with an old number.
    const data = fromProfile()
    enforceTypedPrecedence(data, submission())
    expect(data.contact.phone).toBe("555-0142")
    expect(data.contact.address).toBe("Bowling Green, KY")
  })

  it("keeps the typed service list rather than the profile's longer one", () => {
    const data = fromProfile()
    enforceTypedPrecedence(data, submission())
    expect(data.services).toEqual(["Roof replacement"])
  })
})

describe("the profile fills gaps the client left blank", () => {
  it("keeps a website read from the profile when the form left it empty", () => {
    const data = fromProfile()
    enforceTypedPrecedence(data, submission({ contact: { ...submission().contact, website: "" } }))
    expect(data.contact.website).toBe("pearlroofing.example")
  })

  it("keeps profile-sourced services when the form listed none", () => {
    const data = fromProfile()
    enforceTypedPrecedence(data, submission({ services: [] }))
    expect(data.services).toEqual(["Roof replacement", "Siding", "Gutter cleaning"])
  })

  it("keeps everything from the profile when nothing was typed at all", () => {
    // The PDF-only case: values must be the PDF's real facts, untouched —
    // never blanked, and never replaced with something invented.
    const data = fromProfile()
    enforceTypedPrecedence(data, submission({
      businessName: "", industry: "", targetAudience: "", services: [],
      contact: { email: "owner@example.test", phone: "", address: "", website: "", socialHandles: "" },
    }))
    expect(data.businessName).toBe("Pearl Roofing & Siding LLC")
    expect(data.contact.phone).toBe("555-9999")
    expect(data.services).toEqual(["Roof replacement", "Siding", "Gutter cleaning"])
  })

  it("treats whitespace-only input as blank, not as a typed override", () => {
    const data = fromProfile()
    enforceTypedPrecedence(data, submission({ businessName: "   " }))
    expect(data.businessName).toBe("Pearl Roofing & Siding LLC")
  })
})

describe("the Google Sheets path is the one form-fill already proved", () => {
  it("converts a Sheets URL to its CSV export endpoint", () => {
    expect(toGoogleSheetsCsvExportUrl("https://docs.google.com/spreadsheets/d/ABC123/edit"))
      .toBe("https://docs.google.com/spreadsheets/d/ABC123/export?format=csv")
  })

  it("preserves a specific tab's gid", () => {
    expect(toGoogleSheetsCsvExportUrl("https://docs.google.com/spreadsheets/d/ABC123/edit#gid=77"))
      .toBe("https://docs.google.com/spreadsheets/d/ABC123/export?format=csv&gid=77")
  })

  it("returns null for a non-Sheets link, which is fetched as plain text", () => {
    expect(toGoogleSheetsCsvExportUrl("https://example.com/about")).toBeNull()
  })
})
