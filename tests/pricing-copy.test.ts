import { describe, it, expect } from "vitest"
import { PLANS } from "@/lib/plans"

// Trial now gets QR scan counts, so Basic can't be sold as "plus scan tracking".
// Pro's bullets are the approved wording below, which folds these into "Everything in Basic".
describe("Basic leads with leads and editable offers", () => {
  it.each(["basic"])("%s", (id) => {
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

describe("Pro's approved wording (2026-11-12)", () => {
  const pro = PLANS.find((p) => p.id === "pro")!
  it("is the approved tagline and three bullets, with 'fillable' — form-fill refuses flat PDFs", () => {
    expect(pro.tagline).toBe("Everything in Basic, with double the flyers and less paperwork.")
    expect(pro.features).toEqual([
      "50 flyers a month (Basic includes 25)",
      "Form-fill: save your business details once, and OneFlyer fills in fillable PDF forms for you",
      "Everything in Basic: Instagram, text and Nextdoor versions, click tracking, lead capture and print requests",
    ])
    expect(pro.description).toBe("")
    expect(pro.outcome).toBe("")
  })
})
