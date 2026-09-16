import { describe, it, expect } from "vitest"
import { applyBudget, fillTemplate, selectTemplate, TEMPLATES, escapeHtml } from "@/lib/agent-pipeline/template-mode"
import { LOGO_PLACEHOLDER, QR_PLACEHOLDER } from "@/lib/agent-pipeline/flyer-html"

const base = {
  template: TEMPLATES[0], headline: "Spring Roof Check", supporting: "Free inspection for homeowners.",
  businessName: "Pearl Roofing", phone: "555-0142", address: "Bowling Green, KY",
  hasLogo: true, hasQr: true, photoUrl: "https://images.unsplash.com/x",
  colors: { primary: "#12314f", secondary: "#e8edf2", accent: "#e39a2b" },
  fonts: { heading: "Georgia, serif", body: "Georgia, serif" },
}

describe("budgets are enforced in code, not asked of the model", () => {
  it("leaves text within budget untouched", () => {
    expect(applyBudget("Short line", 42)).toEqual({ text: "Short line", truncated: false })
  })

  it("cuts an overlong headline at a word boundary", () => {
    const r = applyBudget("Spring Roof Replacement And Gutter Cleaning Event This Month Only", 42)
    expect(r.truncated).toBe(true)
    expect(r.text.length).toBeLessThanOrEqual(42)
    expect(r.text.endsWith(" ")).toBe(false)
  })

  it("does not collapse the line when one word exceeds the budget", () => {
    const r = applyBudget("Supercalifragilisticexpialidocious offer", 20)
    expect(r.text.length).toBeGreaterThan(10)
  })

  it("strips trailing punctuation left by the cut", () => {
    expect(applyBudget("Roof repair, gutters, siding, windows", 18).text).not.toMatch(/[,;:\-–—]$/)
  })
})

describe("template fill", () => {
  it("emits the SAME tokens the existing post-processing substitutes", () => {
    const { html } = fillTemplate(base)
    expect(html).toContain(LOGO_PLACEHOLDER)
    expect(html).toContain(QR_PLACEHOLDER)
  })

  it("omits whole blocks rather than leaving empty boxes", () => {
    const { html } = fillTemplate({ ...base, hasLogo: false, hasQr: false, photoUrl: null })
    expect(html).not.toContain(LOGO_PLACEHOLDER)
    expect(html).not.toContain(QR_PLACEHOLDER)
    expect(html).not.toContain("<img")
  })

  it("leaves no unfilled slot tokens", () => {
    // LOGO_SRC and QR_CODE_SRC are deliberately still present — they are
    // substituted later by the same code the AI path uses. Every OTHER token
    // must be gone before the flyer is stored.
    const { html } = fillTemplate(base)
    const leftover = (html.match(/\{\{[A-Z_]+\}\}/g) ?? [])
      .filter((t) => t !== LOGO_PLACEHOLDER && t !== QR_PLACEHOLDER)
    expect(leftover).toEqual([])
  })

  it("applies brand colours and fonts as CSS variables", () => {
    const { html } = fillTemplate(base)
    expect(html).toContain("--brand-primary:#12314f")
    expect(html).toContain("--font-heading:Georgia, serif")
  })

  it("escapes client text so a business name cannot inject markup", () => {
    const { html } = fillTemplate({ ...base, businessName: `<script>alert(1)</script>` })
    expect(html).not.toContain("<script>alert(1)</script>")
    expect(html).toContain("&lt;script&gt;")
  })

  it("reports which slots overshot, so overshoot can be measured", () => {
    const r = fillTemplate({ ...base, headline: "x".repeat(200) })
    expect(r.truncated).toContain("headline")
  })
})

describe("template selection", () => {
  it("is deterministic for a flyer id, so a refine keeps its layout", () => {
    expect(selectTemplate("flyer-abc")!.id).toBe(selectTemplate("flyer-abc")!.id)
  })

  it("varies across flyers in a batch", () => {
    const ids = ["a", "b", "c", "d", "e", "f"].map((i) => selectTemplate(i)!.id)
    expect(new Set(ids).size).toBeGreaterThan(1)
  })
})

describe("format filtering", () => {
  it("never puts a square social layout on a printed flyer", () => {
    for (const id of ["a", "b", "c", "d", "e", "f", "g", "h"]) {
      expect(selectTemplate(id, "flyer")!.formatIds).toContain("flyer")
    }
  })

  it("selects the door-hanger template for a door hanger", () => {
    expect(selectTemplate("x", "door-hanger")!.id).toBe("door-hanger-stack")
  })

  it("selects the square template for a social post", () => {
    expect(selectTemplate("x", "social-post")!.id).toBe("social-square")
  })

  it("returns null for a canvas with no template, so the caller can fall back", () => {
    // proposal/one-pager paginate; rendering a fixed-height template would be
    // worse than routing to the AI agent.
    expect(selectTemplate("x", "proposal")).toBeNull()
  })
})

describe("escaping", () => {
  it("covers the five characters that matter in HTML", () => {
    expect(escapeHtml(`<>&"'`)).toBe("&lt;&gt;&amp;&quot;&#39;")
  })
})

describe("the kill-switch", () => {
  // Mirrors the gate in runBatch. Template mode is on unless explicitly
  // disabled, so an unset env var enables it and only "off" rolls back.
  const enabled = (v: string | undefined) => v !== "off"

  it("is ON when the env var is unset", () => {
    expect(enabled(undefined)).toBe(true)
  })

  it("stays ON for any value other than off, including the old opt-in", () => {
    expect(enabled("on")).toBe(true)
    expect(enabled("")).toBe(true)
  })

  it("is OFF only when explicitly set to off — the rollback", () => {
    expect(enabled("off")).toBe(false)
  })

  it("leaves the paginating format on the AI path regardless of the flip", () => {
    // proposal is the ONLY format that paginates; a fixed-height template
    // would truncate it, so it must keep falling back to the AI agent.
    expect(selectTemplate("x", "proposal")).toBeNull()
  })

  it("covers every non-paginating format with a correctly sized template", () => {
    expect(selectTemplate("x", "flyer")!.formatIds).toContain("flyer")
    expect(selectTemplate("x", "one-pager")!.formatIds).toContain("one-pager")
    expect(selectTemplate("x", "door-hanger")!.id).toBe("door-hanger-stack")
    expect(selectTemplate("x", "social-post")!.id).toBe("social-square")
  })
})
