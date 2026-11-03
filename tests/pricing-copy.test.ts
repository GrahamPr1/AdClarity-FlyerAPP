import { describe, it, expect } from "vitest"
import { PLANS } from "@/lib/plans"

// Trial now gets QR scan counts, so Basic can't be sold as "plus scan tracking".
describe("Basic and Pro lead with leads and editable offers", () => {
  it.each(["basic", "pro"])("%s", (id) => {
    expect(PLANS.find((p) => p.id === id)?.features.slice(0, 2)).toEqual(["Get customer leads from every flyer", "Update your offer without reprinting"])
  })

  it("Trial's bullets are unchanged", () => {
    expect(PLANS.find((p) => p.id === "trial")?.features).toEqual(["3 flyers free", "No credit card required"])
  })
})

describe("Basic's description", () => {
  it("sells what Trial doesn't have", () => {
    expect(PLANS.find((p) => p.id === "basic")?.description).toBe("Everything in Trial, plus lead capture and editable offer pages.")
  })
})
