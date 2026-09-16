import { describe, it, expect } from "vitest"
import {
  parseColor,
  contrastRatio,
  requiredRatio,
  compositeOver,
  applyLegibilityGuardrails,
  SCRIM_CLASS,
} from "@/lib/agent-pipeline/legibility"
import { assignDesignVariants } from "@/lib/agent-pipeline/design-variants"
import { palettePoolFor, PALETTES_BY_CATEGORY } from "@/lib/agent-pipeline/trade-palettes"
import { BUSINESS_CATEGORIES } from "@/lib/types"

describe("contrast maths", () => {
  it("matches known WCAG anchors", () => {
    const white = { r: 255, g: 255, b: 255 }
    const black = { r: 0, g: 0, b: 0 }
    expect(contrastRatio(white, black)).toBeCloseTo(21, 1)
    expect(contrastRatio(white, white)).toBeCloseTo(1, 3)
  })

  it("parses the colour formats a model actually emits", () => {
    expect(parseColor("#fff")).toEqual({ r: 255, g: 255, b: 255 })
    expect(parseColor("#1C2530")).toEqual({ r: 28, g: 37, b: 48 })
    expect(parseColor("rgba(0, 0, 0, 0.78)")).toEqual({ r: 0, g: 0, b: 0 })
    expect(parseColor("papayawhip")).toBeNull() // named colours aren't resolvable here
    expect(parseColor(undefined)).toBeNull()
  })

  it("applies the large-text threshold, not one blanket ratio", () => {
    expect(requiredRatio(16, false)).toBe(4.5)
    expect(requiredRatio(24, false)).toBe(3)
    expect(requiredRatio(19, true)).toBe(3)
    expect(requiredRatio(19, false)).toBe(4.5)
  })

  it("composites a translucent scrim over its backdrop", () => {
    const out = compositeOver({ r: 0, g: 0, b: 0 }, 0.5, { r: 255, g: 255, b: 255 })
    expect(out.r).toBeCloseTo(127.5, 1)
  })
})

describe("scrim injection", () => {
  const photoBlock = `<html><head></head><body>
    <div style="background-image:url(https://images.unsplash.com/x); color:#ffffff">
      <h1 style="font-size:40px">$500 Off Your New Roof</h1>
    </div></body></html>`

  it("scrims a text block sitting on a photo", () => {
    const { html, report } = applyLegibilityGuardrails(photoBlock)
    expect(report.scrimsInjected).toBe(1)
    expect(html).toContain(SCRIM_CLASS)
    expect(html).toContain("linear-gradient")
  })

  it("leaves a flyer with no photo completely untouched", () => {
    // The CSS-only design is already good; this must not touch it.
    const plain = `<html><head></head><body><h1 style="color:#111">Hello</h1></body></html>`
    const { html, report } = applyLegibilityGuardrails(plain)
    expect(report.scrimsInjected).toBe(0)
    expect(html).toBe(plain)
  })

  it("does not scrim a photo with no text over it", () => {
    const decorative = `<html><body><div style="background-image:url(x)"></div></body></html>`
    expect(applyLegibilityGuardrails(decorative).report.scrimsInjected).toBe(0)
  })

  it("is idempotent — a second pass adds nothing", () => {
    const once = applyLegibilityGuardrails(photoBlock).html
    expect(applyLegibilityGuardrails(once).report.scrimsInjected).toBe(0)
  })

  it("reports images it cannot verify geometrically rather than calling them safe", () => {
    // Text absolutely positioned over a sibling <img> needs layout to judge.
    // Counting that as a pass would turn an unverified flyer into a green tick.
    const floating = `<html><body><img src="x"><p style="position:absolute;color:#fff">Hi</p></body></html>`
    expect(applyLegibilityGuardrails(floating).report.unresolved).toBeGreaterThan(0)
  })
})

describe("contrast reporting", () => {
  it("flags low-contrast text where both colours are resolvable", () => {
    const bad = `<html><body><p style="color:#bbbbbb;background-color:#ffffff;font-size:14px">faint</p></body></html>`
    const { report } = applyLegibilityGuardrails(bad)
    expect(report.contrastFailures).toHaveLength(1)
    expect(report.contrastFailures[0].required).toBe(4.5)
  })

  it("passes strong contrast", () => {
    const good = `<html><body><p style="color:#111111;background-color:#ffffff;font-size:14px">clear</p></body></html>`
    expect(applyLegibilityGuardrails(good).report.contrastFailures).toHaveLength(0)
  })

  it("treats the scrim as the effective background, which is the point", () => {
    // White text on a photo is unverifiable; white text on a scrim over a
    // photo is verifiable, and passes. The scrim is what makes the check
    // possible at all.
    const onPhoto = `<html><body><div style="background-image:url(x)"><p style="color:#ffffff;font-size:30px">Offer</p></div></body></html>`
    expect(applyLegibilityGuardrails(onPhoto).report.contrastFailures).toHaveLength(0)
  })
})

describe("trade palettes", () => {
  it("covers every real BusinessCategory with distinct options", () => {
    for (const c of BUSINESS_CATEGORIES) {
      const pool = PALETTES_BY_CATEGORY[c]
      expect(pool.length).toBeGreaterThanOrEqual(4)
      expect(new Set(pool.map((p) => p.primary)).size).toBe(pool.length)
    }
  })

  it("every primary is dark enough to carry reversed-out white text", () => {
    const white = { r: 255, g: 255, b: 255 }
    for (const c of BUSINESS_CATEGORIES) {
      for (const p of PALETTES_BY_CATEGORY[c]) {
        const primary = parseColor(p.primary)!
        expect(contrastRatio(white, primary)).toBeGreaterThanOrEqual(4.5)
      }
    }
  })

  it("falls back to the broad pool for an unknown category", () => {
    expect(palettePoolFor(undefined)).toBe(PALETTES_BY_CATEGORY.Other)
  })
})

describe("design selection: palette stable per business, layout varied per flyer", () => {
  const seed = "Miller Heating & Air:Contractor"
  const pool = palettePoolFor("Contractor")

  it("gives one business the same palette across separate generations", () => {
    const a = assignDesignVariants(["flyer-1"], true, undefined, { businessSeed: seed, palettePool: pool })
    const b = assignDesignVariants(["flyer-99"], true, undefined, { businessSeed: seed, palettePool: pool })
    expect(a.get("flyer-1")!.palette!.name).toBe(b.get("flyer-99")!.palette!.name)
  })

  it("still varies LAYOUT within one batch — three pieces must not be identical", () => {
    // The original reason design-variants.ts exists. Seeding the palette on
    // the business must not undo it.
    const v = assignDesignVariants(["a", "b", "c"], true, undefined, { businessSeed: seed, palettePool: pool })
    expect(new Set([...v.values()].map((x) => x.layoutName)).size).toBe(3)
  })

  it("gives different businesses in the same trade different palettes", () => {
    const names = ["Alpha Roofing", "Beta Roofing", "Gamma Roofing", "Delta Roofing"].map(
      (n) => assignDesignVariants(["f"], true, undefined, { businessSeed: `${n}:Contractor`, palettePool: pool }).get("f")!.palette!.name,
    )
    expect(new Set(names).size).toBeGreaterThan(1)
  })

  it("never overrides a client's real brand colours", () => {
    // allowPaletteVariation is false when colorSource is "client_provided".
    const v = assignDesignVariants(["f"], false, undefined, { businessSeed: seed, palettePool: pool })
    expect(v.get("f")!.palette).toBeNull()
  })

  it("draws from the trade's own pool", () => {
    const v = assignDesignVariants(["f"], true, undefined, { businessSeed: seed, palettePool: pool })
    expect(pool.map((p) => p.name)).toContain(v.get("f")!.palette!.name)
  })
})
