import { describe, it, expect } from "vitest"
import { COLORING_AGENT_SYSTEM_PROMPT } from "@/lib/agent-pipeline/prompts/coloring"
import { ColoringPageRequestSchema } from "@/lib/agent-pipeline/schemas/coloring"

/**
 * A coloring page is a different product from a flyer, and the rules that
 * make it actually colourable are easy to erode. These pin the ones a real
 * generation proved matter.
 */
describe("coloring page request", () => {
  it("asks what to DRAW, not about a business", () => {
    const ok = ColoringPageRequestSchema.safeParse({
      subject: "A friendly dragon reading a book",
      audience: "young-child",
      theme: null,
      caption: null,
    })
    expect(ok.success).toBe(true)
  })

  it("requires a subject — there is nothing to draw without one", () => {
    expect(ColoringPageRequestSchema.safeParse({ subject: "", audience: "adult", theme: null, caption: null }).success).toBe(false)
  })

  it("only accepts the four real age bands", () => {
    expect(ColoringPageRequestSchema.safeParse({ subject: "x", audience: "teenager", theme: null, caption: null }).success).toBe(false)
  })
})

describe("the rules that make it colourable", () => {
  it("forbids fills — a filled shape is a black blob on paper", () => {
    expect(COLORING_AGENT_SYSTEM_PROMPT).toMatch(/Outlines only\. No fills, ever/i)
    expect(COLORING_AGENT_SYSTEM_PROMPT).toMatch(/fill="none"/)
  })

  it("requires closed regions, or colour bleeds across the page", () => {
    expect(COLORING_AGENT_SYSTEM_PROMPT).toMatch(/Every region must be CLOSED/i)
  })

  it("scales stroke weight to the age band", () => {
    for (const band of ["toddler", "young-child", "older-child", "adult"]) {
      expect(COLORING_AGENT_SYSTEM_PROMPT, band).toContain(band)
    }
  })

  it("carries none of the flyer product's furniture", () => {
    expect(COLORING_AGENT_SYSTEM_PROMPT).toMatch(/never add branding, an offer, contact details, or a QR code/i)
  })

  it("enforces a shape budget so a page can finish inside the time limit", () => {
    // Measured: without this, "a detailed mandala" truncated mid-path or blew
    // the 300s function ceiling. An unclosed path leaks colour everywhere, so
    // a truncated page is worthless rather than merely simpler.
    expect(COLORING_AGENT_SYSTEM_PROMPT).toMatch(/Hard budget: at most 40 unique drawn elements/i)
    expect(COLORING_AGENT_SYSTEM_PROMPT).toMatch(/<use>/)
  })

  it("keeps the caption clear of the artwork", () => {
    // Observed in a real render: hollow caption letters overlapped a tree.
    expect(COLORING_AGENT_SYSTEM_PROMPT).toMatch(/Reserve a clear horizontal band/i)
  })
})
