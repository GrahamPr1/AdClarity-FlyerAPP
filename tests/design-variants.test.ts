import { describe, it, expect } from "vitest"
import {
  assignDesignVariants,
  LAYOUT_ARCHETYPES,
  MASS_APPEAL_PALETTES,
  PRESERVE_EXISTING_VARIANT,
} from "@/lib/agent-pipeline/design-variants"

const ids = (n: number) => Array.from({ length: n }, (_, i) => `flyer-${i}-abc123`)

describe("layouts differ per flyer", () => {
  it("gives every flyer in a batch a different composition", () => {
    const variants = assignDesignVariants(ids(5), false)
    const layouts = [...variants.values()].map((v) => v.layoutName)
    expect(new Set(layouts).size).toBe(5)
  })

  it("fills a batch the size of the archetype pool without repeating", () => {
    const variants = assignDesignVariants(ids(LAYOUT_ARCHETYPES.length), false)
    expect(new Set([...variants.values()].map((v) => v.layoutName)).size).toBe(LAYOUT_ARCHETYPES.length)
  })

  it("still returns a variant for every flyer when a batch exceeds the pool", () => {
    // MAX_FLYERS_PER_BATCH is 10; the pool may be smaller. Wrapping is fine,
    // dropping a flyer is not.
    const variants = assignDesignVariants(ids(10), false)
    expect(variants.size).toBe(10)
    for (const v of variants.values()) expect(v.layoutBrief.length).toBeGreaterThan(40)
  })

  it("gives different clients different starting compositions", () => {
    // Otherwise every campaign in the product opens with the same design.
    const a = assignDesignVariants(["aaaa-1111"], false).get("aaaa-1111")!
    const b = assignDesignVariants(["zzzz-9999"], false).get("zzzz-9999")!
    expect(a.layoutName).not.toBe(b.layoutName)
  })

  it("is deterministic, so regenerating a flyer keeps its design", () => {
    const first = assignDesignVariants(ids(4), true)
    const second = assignDesignVariants(ids(4), true)
    for (const id of ids(4)) {
      expect(second.get(id)).toEqual(first.get(id))
    }
  })
})

describe("the client's own brand wins", () => {
  it("never substitutes a palette when the brand colours are the client's", () => {
    const variants = assignDesignVariants(ids(4), false)
    for (const v of variants.values()) expect(v.palette).toBeNull()
  })

  it("varies the palette only when the colours were invented for them", () => {
    const variants = assignDesignVariants(ids(4), true)
    const palettes = [...variants.values()].map((v) => v.palette?.name)
    expect(palettes.every(Boolean)).toBe(true)
    expect(new Set(palettes).size).toBe(4)
  })

  it("still varies layout for a client with real brand colours", () => {
    // Brand fidelity constrains colour, not composition — three flyers should
    // still look like three flyers.
    const variants = assignDesignVariants(ids(3), false)
    expect(new Set([...variants.values()].map((v) => v.layoutName)).size).toBe(3)
  })
})

describe("the palettes themselves", () => {
  it("are all valid hex triples", () => {
    for (const p of MASS_APPEAL_PALETTES) {
      for (const hex of [p.primary, p.secondary, p.accent]) {
        expect(hex, `${p.name} ${hex}`).toMatch(/^#[0-9A-Fa-f]{6}$/)
      }
    }
  })

  it("pair a dark primary with a light secondary, so reversed-out text stays legible", () => {
    const luminance = (hex: string) => {
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
      return 0.2126 * r + 0.7152 * g + 0.0722 * b
    }
    for (const p of MASS_APPEAL_PALETTES) {
      expect(luminance(p.primary), `${p.name} primary should be dark`).toBeLessThan(0.35)
      expect(luminance(p.secondary), `${p.name} secondary should be light`).toBeGreaterThan(0.8)
    }
  })

  it("has no duplicate palettes or layout names", () => {
    expect(new Set(MASS_APPEAL_PALETTES.map((p) => p.primary)).size).toBe(MASS_APPEAL_PALETTES.length)
    expect(new Set(LAYOUT_ARCHETYPES.map((l) => l.name)).size).toBe(LAYOUT_ARCHETYPES.length)
  })
})

describe("refinement", () => {
  it("tells the agent to preserve the existing design rather than pick a new one", () => {
    expect(PRESERVE_EXISTING_VARIANT.palette).toBeNull()
    expect(PRESERVE_EXISTING_VARIANT.layoutBrief).toMatch(/keep its existing composition/i)
  })
})
