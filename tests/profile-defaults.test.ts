import { describe, it, expect } from "vitest"
import {
  nonEmpty,
  parseYearsInBusiness,
  fillContactGapsFromProfile,
} from "@/lib/agent-pipeline/profile-defaults"
import type { CampaignDefaults } from "@/lib/types"
import type { NormalizedIntake } from "@/lib/agent-pipeline/schemas/intake"

// A saved profile in the shape /profile actually writes.
const PROFILE: CampaignDefaults = {
  savedAt: "2026-09-08T00:00:00.000Z",
  yearsInBusiness: "7",
  brandColors: "navy, gold",
  preferredStyle: "playful",
  voiceTone: "friendly, no-nonsense",
  contactName: "Sarah Miller",
  website: "millerheatingandair.com",
  address: "12 Oak St, Louisville",
  socialHandles: "@millerhvac",
  targetAudience: "homeowners 35-65 with aging HVAC systems",
  serviceArea: "Louisville + 30 miles",
  pastOffers: ["$500 off a new furnace"],
}

const EMPTY_CONTACT: NormalizedIntake["contact"] = {
  phone: "555-0142",
  address: null,
  website: null,
  social: null,
  contactName: null,
}

describe("nonEmpty", () => {
  it("treats blank and whitespace-only as absent", () => {
    expect(nonEmpty(undefined)).toBeNull()
    expect(nonEmpty(null)).toBeNull()
    expect(nonEmpty("")).toBeNull()
    expect(nonEmpty("   ")).toBeNull()
  })

  it("trims real values", () => {
    expect(nonEmpty("  friendly  ")).toBe("friendly")
  })
})

describe("parseYearsInBusiness", () => {
  it("parses a plain count", () => {
    expect(parseYearsInBusiness("7")).toBe(7)
    expect(parseYearsInBusiness(" 12 ")).toBe(12)
    expect(parseYearsInBusiness("0")).toBe(0)
  })

  it("drops anything that isn't a sensible year count rather than guessing", () => {
    // This ends up printed on a flyer as a credibility claim, so a bad parse
    // is worse than no value.
    expect(parseYearsInBusiness("")).toBeNull()
    expect(parseYearsInBusiness(undefined)).toBeNull()
    expect(parseYearsInBusiness("about five")).toBeNull()
    expect(parseYearsInBusiness("-3")).toBeNull()
    expect(parseYearsInBusiness("9999")).toBeNull()
  })
})

describe("fillContactGapsFromProfile", () => {
  it("is a no-op when the client has no saved profile", () => {
    // The case that must not regress: a Basic/Pro client who never opened
    // /profile has to behave exactly as before this change.
    const contact = { ...EMPTY_CONTACT, address: "9 Elm St" }
    expect(fillContactGapsFromProfile(contact, null)).toEqual(contact)
  })

  it("fills only the blanks", () => {
    const out = fillContactGapsFromProfile(EMPTY_CONTACT, PROFILE)
    expect(out.address).toBe("12 Oak St, Louisville")
    expect(out.website).toBe("millerheatingandair.com")
    expect(out.contactName).toBe("Sarah Miller")
  })

  it("never overwrites a value the request already resolved", () => {
    const resolved: NormalizedIntake["contact"] = {
      phone: "555-0142",
      address: "9 Elm St, Springfield",
      website: "other-site.com",
      social: null,
      contactName: "Dana Reyes",
    }
    const out = fillContactGapsFromProfile(resolved, PROFILE)
    expect(out.address).toBe("9 Elm St, Springfield")
    expect(out.website).toBe("other-site.com")
    expect(out.contactName).toBe("Dana Reyes")
  })

  it("never touches the phone — that's this campaign's call-to-action", () => {
    const out = fillContactGapsFromProfile(EMPTY_CONTACT, PROFILE)
    expect(out.phone).toBe("555-0142")
  })

  it("treats whitespace-only saved values as absent", () => {
    const blanks: CampaignDefaults = { ...PROFILE, address: "   ", website: "", contactName: " " }
    const out = fillContactGapsFromProfile(EMPTY_CONTACT, blanks)
    expect(out.address).toBeNull()
    expect(out.website).toBeNull()
    expect(out.contactName).toBeNull()
  })

  it("survives a record saved before the Phase 1 fields existed", () => {
    // targetAudience/serviceArea/pastOffers are optional on the type; older
    // records simply don't have the keys.
    const legacy = {
      savedAt: "2026-01-01T00:00:00.000Z",
      yearsInBusiness: "3",
      brandColors: "",
      preferredStyle: "modern",
      voiceTone: "",
      contactName: "",
      website: "",
      address: "",
      socialHandles: "",
    } as CampaignDefaults
    expect(() => fillContactGapsFromProfile(EMPTY_CONTACT, legacy)).not.toThrow()
    expect(fillContactGapsFromProfile(EMPTY_CONTACT, legacy).address).toBeNull()
  })
})

describe("precedence expressions used by the Quick Prompt route", () => {
  // Mirrors the exact chains in app/api/quick-prompt/route.ts. These are the
  // rules the fix turns on, so they're asserted rather than left implicit.
  const tone = (styleOverride: string | null, styleCue: string | undefined, profile: CampaignDefaults | null) =>
    styleOverride?.toLowerCase() ?? styleCue?.toLowerCase() ?? nonEmpty(profile?.voiceTone) ?? "professional"

  it("an explicit style pick beats the saved profile", () => {
    expect(tone("Playful", undefined, PROFILE)).toBe("playful")
  })

  it("a tone read out of the prompt beats the saved profile", () => {
    // Otherwise "make it playful" would be impossible to honour for anyone
    // who ever saved a tone.
    expect(tone(null, "urgent", PROFILE)).toBe("urgent")
  })

  it("the saved profile beats the hardcoded fallback", () => {
    expect(tone(null, undefined, PROFILE)).toBe("friendly, no-nonsense")
  })

  it("with no profile it still lands on the previous default", () => {
    expect(tone(null, undefined, null)).toBe("professional")
  })

  // The Quick Prompt agent ALWAYS fills targetAudience — it's told to infer
  // one when the prompt doesn't say (see prompts/quickPrompt.ts). So the
  // route can't use "is it empty?" to decide; it uses targetAudienceStated,
  // which reports whether the client actually named an audience.
  const audience = (
    parsed: { targetAudience: string; targetAudienceStated: boolean },
    profile: CampaignDefaults | null,
    scraped?: string,
  ) =>
    (parsed.targetAudienceStated ? nonEmpty(parsed.targetAudience) : null) ??
    nonEmpty(profile?.targetAudience) ??
    nonEmpty(parsed.targetAudience) ??
    nonEmpty(scraped) ??
    ""

  const STATED = { targetAudience: "first-time buyers", targetAudienceStated: true }
  const GUESSED = { targetAudience: "local homeowners", targetAudienceStated: false }

  it("an audience named in the prompt beats the saved profile", () => {
    expect(audience(STATED, PROFILE)).toBe("first-time buyers")
  })

  it("a merely INFERRED audience loses to the saved profile", () => {
    // This is the whole bug: the parser's guess used to win unconditionally,
    // so a saved audience could never apply on the Quick Prompt path.
    expect(audience(GUESSED, PROFILE)).toBe("homeowners 35-65 with aging HVAC systems")
  })

  it("with no saved profile the inferred guess is still used, as before", () => {
    expect(audience(GUESSED, null)).toBe("local homeowners")
  })

  it("falls back to the scraped site, then to empty", () => {
    const none = { targetAudience: "", targetAudienceStated: false }
    expect(audience(none, null, "site visitors")).toBe("site visitors")
    expect(audience(none, null)).toBe("")
  })
})
