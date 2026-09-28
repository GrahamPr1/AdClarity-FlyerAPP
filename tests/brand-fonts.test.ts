import { describe, expect, it, vi } from "vitest"
import { CURATED_FONTS, STYLE_FONT_STACKS, renderableFonts } from "@/lib/brand-controls"
import { BRAND_AGENT_SYSTEM_PROMPT as BRAND_PROMPT } from "@/lib/agent-pipeline/prompts/brand"

/**
 * The font contract.
 *
 * A flyer is a self-contained document with no @font-face and no link to a
 * font CDN, so a bare family name does not render as that family — it
 * silently falls back. The bug that motivated these tests was invisible in
 * every artifact we had: the HTML said "Poppins", and measuring showed it
 * rendered at exactly the width of a deliberately nonexistent family.
 *
 * Nothing here can catch "this font looks wrong". What it catches is the
 * SHAPE that fails silently: a value with no fallbacks behind it.
 */

/** A value that can survive with no network: has fallbacks or is generic. */
const isRenderable = (v: string) =>
  v.includes(",") || /\b(serif|sans-serif|monospace|cursive|fantasy)\s*$/.test(v.trim())

describe("the font stacks we ship", () => {
  it("every curated font carries fallbacks", () => {
    for (const f of CURATED_FONTS) {
      expect(isRenderable(f.heading), `${f.id} heading: ${f.heading}`).toBe(true)
      expect(isRenderable(f.body), `${f.id} body: ${f.body}`).toBe(true)
    }
  })

  it("every style maps to a stack, not a family name", () => {
    for (const [style, pair] of Object.entries(STYLE_FONT_STACKS)) {
      expect(isRenderable(pair.heading), `${style} heading: ${pair.heading}`).toBe(true)
      expect(isRenderable(pair.body), `${style} body: ${pair.body}`).toBe(true)
    }
  })

  it("covers exactly the four values the intake schema allows", () => {
    expect(Object.keys(STYLE_FONT_STACKS).sort()).toEqual(["classic", "minimal", "modern", "playful"])
  })
})

describe("the Brand Agent prompt", () => {
  // The prompt used to name these, and none of them resolved.
  const WEBFONT_ONLY = ["Poppins", "Inter", "Playfair Display", "Baloo 2", "Quicksand", "Work Sans"]

  it("no longer asks for fonts that cannot load", () => {
    // Strip the block that explains the bug — it names one on purpose.
    const explanation = /These are FULL CSS STACKS[\s\S]*?no network at all\./
    expect(BRAND_PROMPT, "the explanatory block moved; this test's exclusion is stale").toMatch(explanation)
    const asks = BRAND_PROMPT.replace(explanation, "")
    for (const name of WEBFONT_ONLY) {
      expect(asks, `prompt still asks for ${name}`).not.toContain(name)
    }
  })

  it("gives the agent the real stacks to copy", () => {
    for (const pair of Object.values(STYLE_FONT_STACKS)) {
      expect(BRAND_PROMPT).toContain(pair.heading)
      expect(BRAND_PROMPT).toContain(pair.body)
    }
  })
})

describe("renderableFonts", () => {
  it("passes through a value that already has fallbacks", () => {
    const fonts = { heading: "'Acme Sans', Helvetica, sans-serif", body: "Georgia, serif" }
    expect(renderableFonts(fonts, "modern")).toEqual(fonts)
  })

  it("passes through a bare generic family", () => {
    expect(renderableFonts({ heading: "serif", body: "monospace" }, "classic")).toEqual({
      heading: "serif",
      body: "monospace",
    })
  })

  it("REPLACES a bare family name, which would render as nothing it names", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    const out = renderableFonts({ heading: "Poppins", body: "Inter" }, "modern")
    expect(out).toEqual(STYLE_FONT_STACKS.modern)
    expect(warn).toHaveBeenCalledTimes(2)
    warn.mockRestore()
  })

  it("uses the stack for the requested style, not a fixed one", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    expect(renderableFonts({ heading: "Playfair Display", body: "Lora" }, "classic")).toEqual(
      STYLE_FONT_STACKS.classic,
    )
    expect(renderableFonts({ heading: "Baloo 2", body: "Quicksand" }, "playful")).toEqual(
      STYLE_FONT_STACKS.playful,
    )
    warn.mockRestore()
  })

  it("fixes one side without disturbing the other", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    const out = renderableFonts({ heading: "Poppins", body: "Georgia, 'Times New Roman', serif" }, "modern")
    expect(out.heading).toBe(STYLE_FONT_STACKS.modern.heading)
    expect(out.body).toBe("Georgia, 'Times New Roman', serif")
    warn.mockRestore()
  })

  it("replaces an empty value rather than leaving the flyer unstyled", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    expect(renderableFonts({ heading: "", body: "  " }, "minimal")).toEqual(STYLE_FONT_STACKS.minimal)
    warn.mockRestore()
  })

  it("falls back to modern for a style it doesn't know", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    // @ts-expect-error deliberately outside the union — the agent is a model
    expect(renderableFonts({ heading: "Poppins", body: "Inter" }, "whimsical")).toEqual(
      STYLE_FONT_STACKS.modern,
    )
    warn.mockRestore()
  })
})
