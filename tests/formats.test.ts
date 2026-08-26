import { describe, it, expect } from "vitest"
import { OUTPUT_FORMATS, FORMAT_IDS, DEFAULT_FORMAT, getFormat, formatIdFromLabel, formatForAgent, formatTakesPrintFurniture } from "@/lib/agent-pipeline/formats"
import { LAYOUT_ARCHETYPES, assignDesignVariants } from "@/lib/agent-pipeline/design-variants"

/**
 * Formats have to be genuinely different documents, not one flyer restyled.
 * These pin the properties that make that true structurally, so a later edit
 * can't quietly collapse them back into variants of each other.
 */
describe("formats are genuinely distinct documents", () => {
  it("covers every format the product offers", () => {
    expect(FORMAT_IDS).toEqual(["flyer", "one-pager", "proposal", "door-hanger", "social-post"])
  })

  it("gives each format its own canvas", () => {
    const dims = FORMAT_IDS.map((id) => OUTPUT_FORMATS[id].dimensions)
    // Letter-size formats legitimately share dimensions; the narrow and
    // square ones must not.
    expect(OUTPUT_FORMATS["door-hanger"].dimensions).toBe("3.5in x 8.5in portrait")
    expect(OUTPUT_FORMATS["social-post"].dimensions).toBe("1080px x 1080px square")
    expect(new Set(dims).size).toBeGreaterThanOrEqual(3)
  })

  it("only the social post is screen-only, and it alone skips print furniture", () => {
    expect(formatTakesPrintFurniture("social-post")).toBe(false)
    for (const id of FORMAT_IDS.filter((i) => i !== "social-post")) {
      expect(formatTakesPrintFurniture(id), id).toBe(true)
    }
  })

  it("every brief describes structure, at real length", () => {
    for (const id of FORMAT_IDS) {
      // A one-liner is what the old prose-hint approach was; that's the bug.
      expect(OUTPUT_FORMATS[id].brief.length, id).toBeGreaterThan(250)
      expect(OUTPUT_FORMATS[id].chooseWhen.length, id).toBeGreaterThan(10)
    }
  })

  it("does NOT solve overflow by telling the model to write less", () => {
    // A clipped signature line was observed in a real proposal render. The
    // first fix told the model to trim a section, which caps how thorough a
    // proposal can be to suit the worst case. Overflow is a layout problem —
    // it belongs in the page-construction principle (see prompts/flyer.ts),
    // not in the content brief.
    for (const id of FORMAT_IDS) {
      expect(OUTPUT_FORMATS[id].brief, id).not.toMatch(/trim a (block|section)/i)
      expect(OUTPUT_FORMATS[id].brief, id).not.toMatch(/fewer, tighter sections/i)
    }
  })
})

describe("layouts are restricted to canvases that can carry them", () => {
  it("never offers a split-vertical composition on a door hanger", () => {
    expect(OUTPUT_FORMATS["door-hanger"].allowedLayouts).not.toContain("split-vertical")
  })

  it("only names archetypes that actually exist", () => {
    const known = new Set(LAYOUT_ARCHETYPES.map((l) => l.name))
    for (const id of FORMAT_IDS) {
      for (const name of OUTPUT_FORMATS[id].allowedLayouts) {
        expect(known.has(name), `${id} references unknown layout "${name}"`).toBe(true)
      }
    }
  })

  it("assigns only permitted layouts for a format", () => {
    const allowed = OUTPUT_FORMATS["door-hanger"].allowedLayouts
    const variants = assignDesignVariants(["a", "b", "c"], true, allowed)
    for (const v of variants.values()) expect(allowed).toContain(v.layoutName)
  })

  it("falls back rather than dividing by zero on a bad config", () => {
    const variants = assignDesignVariants(["a"], false, ["does-not-exist"])
    expect(variants.get("a")!.layoutName).toBeTruthy()
  })
})

describe("pagination", () => {
  it("only the proposal may flow to a second page", () => {
    // A flyer, door hanger or social post is ONE physical piece; a second
    // sheet is meaningless. A proposal is a document and a long scope of work
    // legitimately runs longer, exactly as a real quote would.
    expect(OUTPUT_FORMATS.proposal.paginates).toBe(true)
    for (const id of FORMAT_IDS.filter((i) => i !== "proposal")) {
      expect(OUTPUT_FORMATS[id].paginates, id).toBe(false)
    }
  })

  it("tells the agent which behaviour applies", () => {
    expect(formatForAgent("proposal").paginates).toBe(true)
    expect(formatForAgent("door-hanger").paginates).toBe(false)
  })
})

describe("format resolution", () => {
  it("defaults to flyer for anything unknown or absent", () => {
    expect(getFormat(undefined).id).toBe(DEFAULT_FORMAT)
    expect(getFormat("nonsense").id).toBe(DEFAULT_FORMAT)
  })

  it("maps the shipped Quick Prompt labels onto real ids", () => {
    expect(formatIdFromLabel("Flyer")).toBe("flyer")
    expect(formatIdFromLabel("One-Pager")).toBe("one-pager")
    expect(formatIdFromLabel("Proposal")).toBe("proposal")
    expect(formatIdFromLabel("Door Hanger")).toBe("door-hanger")
    expect(formatIdFromLabel("Social Post")).toBe("social-post")
    expect(formatIdFromLabel("something else")).toBe(DEFAULT_FORMAT)
  })

  it("hands the agent only what it needs", () => {
    expect(Object.keys(formatForAgent("proposal")).sort()).toEqual(["brief", "dimensions", "id", "label", "medium", "paginates"])
  })
})
