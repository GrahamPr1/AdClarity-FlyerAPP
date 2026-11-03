import { describe, it, expect } from "vitest"
import { PLANS } from "@/lib/plans"

// Trial now gets QR scan counts, so Basic can't be sold as "plus scan tracking".
describe("Basic's description", () => {
  it("sells what Trial doesn't have", () => {
    expect(PLANS.find((p) => p.id === "basic")?.description).toBe("Everything in Trial, plus lead capture and editable offer pages.")
  })
})
