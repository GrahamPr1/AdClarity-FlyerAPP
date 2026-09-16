import { describe, it, expect } from "vitest"
import { stockPhotosEnabled, aiPhotosEnabled, planAllowsAiPhotos } from "@/lib/agent-pipeline/plan-features"
import type { PlanId } from "@/lib/types"

const PLANS: PlanId[] = ["trial", "basic", "pro"]

/**
 * Regression cover for the bug where one flag gated BOTH photo sources.
 *
 * A free-trial flyer skipped Unsplash entirely — silently, with no log line —
 * and fell through to the no-photo design, which looked identical to
 * "Unsplash found nothing". Stock photography costs nothing per image; only
 * Higgsfield bills per call, so only Higgsfield should be plan-gated.
 */
describe("stock photos (Unsplash) are available on every tier", () => {
  it.each(PLANS)("is enabled on %s", (plan) => {
    expect(stockPhotosEnabled(plan)).toBe(true)
  })

  it("is enabled even when the client declined AI photos", () => {
    // wantsAiPhotos asks about AI-GENERATED imagery. Reading "no AI photos"
    // as "no photos at all" puts words in the client's mouth.
    for (const plan of PLANS) expect(stockPhotosEnabled(plan)).toBe(true)
  })
})

describe("AI generation (Higgsfield) stays Pro + opt-in", () => {
  it("needs both the plan and the client's own opt-in", () => {
    expect(aiPhotosEnabled("pro", true)).toBe(true)
    expect(aiPhotosEnabled("pro", false)).toBe(false)
    expect(aiPhotosEnabled("basic", true)).toBe(false)
    expect(aiPhotosEnabled("trial", true)).toBe(false)
  })

  it("is Pro-only at the plan level", () => {
    expect(planAllowsAiPhotos("pro")).toBe(true)
    expect(planAllowsAiPhotos("basic")).toBe(false)
    expect(planAllowsAiPhotos("trial")).toBe(false)
    expect(planAllowsAiPhotos(undefined)).toBe(false)
  })
})

describe("the two gates are genuinely independent", () => {
  it("a trial client gets stock but not AI — the exact reported failure", () => {
    expect(stockPhotosEnabled("trial")).toBe(true)
    expect(aiPhotosEnabled("trial", true)).toBe(false)
  })
})
