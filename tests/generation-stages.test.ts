import { describe, it, expect } from "vitest"
import { GENERATION_STAGES } from "@/lib/agent-pipeline/pipeline"

/**
 * The labels a customer reads during a ~2 minute wait. Pinned because they
 * are the entire perceived-speed fix — a typo'd or missing stage puts the
 * blank wait back.
 */
describe("customer-facing generation stages", () => {
  it("covers every real pipeline step", () => {
    expect(Object.keys(GENERATION_STAGES).sort()).toEqual(["brand", "flyer", "photos", "repurpose"])
  })

  it("describes the customer's campaign, not our agents", () => {
    for (const label of Object.values(GENERATION_STAGES)) {
      expect(label).not.toMatch(/agent|pipeline|LLM|model|API/i)
      expect(label.length).toBeGreaterThan(8)
      // Rendered as `${label}…` — a trailing period would read as "step..…"
      expect(label.endsWith(".")).toBe(false)
    }
  })

  it("speaks to the person waiting", () => {
    expect(GENERATION_STAGES.flyer).toMatch(/your/i)
    expect(GENERATION_STAGES.repurpose).toMatch(/your/i)
  })
})
