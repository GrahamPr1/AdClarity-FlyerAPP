import { describe, it, expect } from "vitest"
import { GENERATION_STAGES } from "@/lib/agent-pipeline/pipeline"
import { FLYER_AGENT_SYSTEM_PROMPT } from "@/lib/agent-pipeline/prompts/flyer"

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

/**
 * The page must absorb its own content. A fixed-height page silently clips
 * whatever sits at the bottom when the content runs long — on a proposal that
 * is the signature line, which makes the document unusable.
 *
 * The fix is structural (flex column, anchored footer, no fixed inner
 * heights), NOT "write less" — capping content to suit the worst case is what
 * the format briefs deliberately no longer do.
 */
describe("page construction rules", () => {
  it("requires a flex page with an anchored footer", () => {
    expect(FLYER_AGENT_SYSTEM_PROMPT).toMatch(/flex-direction:column/)
    expect(FLYER_AGENT_SYSTEM_PROMPT).toMatch(/margin-top:auto/)
    expect(FLYER_AGENT_SYSTEM_PROMPT).toMatch(/flex:1; min-height:0/)
  })

  it("forbids fixed heights on text blocks and requires border-box", () => {
    expect(FLYER_AGENT_SYSTEM_PROMPT).toMatch(/box-sizing: border-box/)
    expect(FLYER_AGENT_SYSTEM_PROMPT).toMatch(/Never put a fixed .*height.* on an inner block/i)
  })

  it("explicitly rules out solving overflow by writing less", () => {
    expect(FLYER_AGENT_SYSTEM_PROMPT).toMatch(/Do NOT solve length by writing less/i)
  })
})
