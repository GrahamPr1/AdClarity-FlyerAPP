import { describe, it, expect } from "vitest"
import { PLANS } from "@/lib/plans"

// Trial now gets QR scan counts, so Basic can't be sold as "plus scan tracking".
describe("Basic and Pro lead with leads and editable offers", () => {
  it.each(["basic", "pro"])("%s", (id) => {
    expect(PLANS.find((p) => p.id === id)?.features.slice(0, 2)).toEqual(["Get customer leads from every flyer", "Update your offer without reprinting"])
  })

  it("Trial's bullets say what trial really gets, QR and scan count included (qrEnabled)", () => {
    expect(PLANS.find((p) => p.id === "trial")?.features).toEqual(["3 flyers free", "A QR code on every flyer, with a scan count", "No credit card required"])
  })
})

describe("Basic's description", () => {
  it("sells what Trial doesn't have", () => {
    expect(PLANS.find((p) => p.id === "basic")?.description).toBe("Everything in Trial, plus lead capture and editable offer pages.")
  })
})

describe("Pro claims only what Pro is enforced to get (Phase 3)", () => {
  const pro = PLANS.find((p) => p.id === "pro")!
  const copy = [pro.tagline, pro.description, ...pro.features, pro.note, pro.outcome].join(" ")
  it("promises no AI-generated images while generation isn't producing them", () => {
    expect(copy).not.toMatch(/\bAI[- ]generated\b|\bAI images?\b|\bAI photos?\b/i)
  })
  it("counts the allowance in flyers, the unit the code counts", () => {
    expect(copy).not.toMatch(/\bcampaigns\b/i)
  })
})
