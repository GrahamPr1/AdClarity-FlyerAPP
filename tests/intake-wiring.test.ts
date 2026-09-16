import { describe, it, expect } from "vitest"
import { buildRawIntakePayload, stampClientPreferences } from "@/lib/agent-pipeline/pipeline"
import type { IntakeSubmission } from "@/lib/types"
import type { NormalizedIntake } from "@/lib/agent-pipeline/schemas/intake"

/**
 * WIRING tests, deliberately not helper tests.
 *
 * resolveBrandColors and substituteLogo both had green unit tests while the
 * pipeline that calls them was broken — twice. Testing the pure function in
 * isolation proves the function, not the product. Everything here drives the
 * real functions runIntakeStage uses, with realistic agent output, so a repeat
 * of either bug fails here.
 *
 * The two bugs, both caused by brand-control fields being visible to the
 * Intake Agent:
 *   1. POST /api/intake returned 500 (AgentTruncatedError) — measured 3/3 with
 *      these fields, 0/3 without.
 *   2. Manual colours were reported as "scanned", because the agent folded
 *      brandColorHexes into existingColors.
 */

const LOGO = "https://oneflyer.org/api/photos/onboarding-photos/uuid-logo.png"

const submission = (extra: Partial<IntakeSubmission> = {}): IntakeSubmission => ({
  planId: null, businessCategory: "Contractor", businessName: "Pearl Roofing",
  industry: "Roofing", yearsInBusiness: "12", services: [{ id: "s1", name: "Roof replacement" }],
  preferredStyle: "modern", voiceTone: "straightforward", targetAudience: "Homeowners",
  contact: { email: "owner@example.test", phone: "555-0142", address: "KY", website: "", socialHandles: "" },
  wantsAiPhotos: false, wantsQrCode: true, flyerNotes: "Spring special", websitePreferences: "",
  ...extra,
})

/** What the Intake Agent realistically returns before stamping. */
const agentOutput = (existingColors: string[] | null = null): NormalizedIntake =>
  ({
    businessName: "Pearl Roofing", industry: "Roofing", yearsInBusiness: 12,
    services: ["Roof replacement"], targetAudience: "Homeowners",
    contact: { phone: "555-0142", address: "KY", website: null, social: null, contactName: null },
    // The agent is instructed to ALWAYS null this.
    brandAssets: { logoUrl: null, existingColors, existingFontsNote: null },
    voiceTonePreference: "straightforward", fontStylePreference: "modern",
    photos: [], wantsAiPhotos: false, wantsQrCode: true,
    flyerRequests: [{ id: "f1", purpose: "Spring special", notes: null }],
    websitePreferences: null, existingMaterialsNotes: null, batchSize: 1,
  }) as unknown as NormalizedIntake

describe("what the Intake Agent is allowed to see", () => {
  const sent = buildRawIntakePayload(
    submission({ logoUrl: LOGO, logoFileName: "logo.png", brandColors: "navy", brandColorHexes: ["#12314f"], brandColorsOverrideScan: true, fontChoiceId: "classic-serif", existingMaterialsUrl: "https://x/b.pdf" }),
  ) as Record<string, unknown>

  it("hides brand-control fields — the cause of the 500s", () => {
    // The agent has no output slot for these and narrates what it can't place
    // into normalizationNotes, which pushed the response past max_tokens.
    for (const k of ["brandColorHexes", "brandColorsOverrideScan", "fontChoiceId"]) {
      expect(sent).not.toHaveProperty(k)
    }
  })

  it("hides code-consumed URLs the agent has no use for", () => {
    expect(sent).not.toHaveProperty("logoUrl")
    expect(sent).not.toHaveProperty("existingMaterialsUrl")
  })

  it("still sends everything the intake prompt refers to by name", () => {
    for (const k of ["logoFileName", "brandColors", "flyerNotes", "services", "contact"]) {
      expect(sent).toHaveProperty(k)
    }
  })
})

describe("logo + manual colours + font, together (the combination that regressed)", () => {
  it("keeps the uploaded logo when colours and a font are also set", () => {
    const data = agentOutput()
    stampClientPreferences(data, submission({ logoUrl: LOGO, brandColorHexes: ["#12314f", "#23262b"], fontChoiceId: "classic-serif" }))
    expect(data.brandAssets.logoUrl).toBe(LOGO)
    expect(data.brandAssets.existingColors).toEqual(["#12314f", "#23262b"])
  })

  it("keeps the uploaded logo with no colours or font set", () => {
    const data = agentOutput()
    stampClientPreferences(data, submission({ logoUrl: LOGO }))
    expect(data.brandAssets.logoUrl).toBe(LOGO)
  })

  it("leaves a scraped logo alone when nothing was uploaded", () => {
    const data = agentOutput()
    data.brandAssets.logoUrl = "https://client.example/logo.svg"
    stampClientPreferences(data, submission({ brandColorHexes: ["#12314f"] }))
    expect(data.brandAssets.logoUrl).toBe("https://client.example/logo.svg")
  })
})

describe("colour source labelling through the real stamping path", () => {
  it("does not treat manual colours as scanned — the mislabelling bug", () => {
    // Agent returns no colours (it can no longer see brandColorHexes), so the
    // manual pick is unambiguously manual.
    const data = agentOutput(null)
    stampClientPreferences(data, submission({ brandColorHexes: ["#7a1f1c"] }))
    expect(data.brandAssets.existingColors).toEqual(["#7a1f1c"])
  })

  it("a genuine scrape still wins over a manual pick", () => {
    const data = agentOutput(["#005489"])
    stampClientPreferences(data, submission({ brandColorHexes: ["#7a1f1c"] }))
    expect(data.brandAssets.existingColors).toEqual(["#005489"])
  })

  it("an explicit override beats a genuine scrape", () => {
    const data = agentOutput(["#005489"])
    stampClientPreferences(data, submission({ brandColorHexes: ["#7a1f1c"], brandColorsOverrideScan: true }))
    expect(data.brandAssets.existingColors).toEqual(["#7a1f1c"])
  })

  it("leaves colours null when neither exists, so the Brand Agent proposes", () => {
    const data = agentOutput(null)
    stampClientPreferences(data, submission())
    expect(data.brandAssets.existingColors).toBeNull()
  })
})
