import { describe, it, expect } from "vitest"
import { attributeBlocks, summariseAttribution, isVerbatimViolation } from "@/lib/agent-pipeline/attribution"
import type { EnterpriseAssetContext } from "@/lib/agent-pipeline/enterprise"

const LOCKED =
  "Guarantees are backed solely by the claims-paying ability of Northstar Mutual. This material is for educational purposes only and is not a recommendation to buy any product."
const SHEET =
  "Northstar Mutual's retirement income solutions are designed for people within ten years of retiring. Options include guaranteed lifetime income, flexible withdrawal schedules, and spousal continuation."

const LIB: EnterpriseAssetContext[] = [
  { assetId: "d1", label: "Compliance Disclosure 2026", locked: true, content: LOCKED },
  { assetId: "p1", label: "Retirement Income Product Sheet v3", locked: false, content: SHEET },
]

/**
 * The shape real generations produced, reduced to their text blocks. Every
 * line here was observed on an actual run, including the mixed paragraph —
 * the model fused an approved sentence with its own invitation copy into one
 * block, which is the case block-level attribution handles least well and so
 * the one most worth pinning.
 */
const MIXED =
  "Northstar Mutual's retirement income solutions are designed for people within ten years of retiring — join Dana Reyes for a clear, no-pressure evening on your options."

const REAL_FLYER = `<html><head><title>Ignore me</title></head><body>
  <h1>You're Invited: An Evening on Retirement Income</h1>
  <p>Thursday, October 8 at 6:00 PM, Bowling Green Public Library.</p>
  <p>${MIXED}</p>
  <p>Northstar Mutual's retirement income solutions are designed for people within ten years of retiring.</p>
  <ul><li>Guaranteed lifetime income</li><li>Flexible withdrawal schedules</li><li>Spousal continuation</li></ul>
  <footer><p>${LOCKED}</p></footer>
  <div><span>Dana Reyes, Northstar Mutual</span></div>
</body></html>`

describe("per-block attribution", () => {
  const blocks = attributeBlocks(REAL_FLYER, LIB)
  const find = (needle: string) => blocks.find((b) => b.text.includes(needle))!

  it("marks the locked disclosure exact, against the locked asset", () => {
    const b = find("claims-paying ability")
    expect(b.fidelity).toBe("exact")
    expect(b.locked).toBe(true)
    expect(b.label).toBe("Compliance Disclosure 2026")
  })

  it("marks a verbatim sentence from the UNLOCKED sheet exact, not adapted", () => {
    // Unlocked does not mean reworded. Faithfulness and lock status are
    // separate axes, and a reviewer signing off needs both.
    const b = find("ten years of retiring.")
    expect(b.fidelity).toBe("exact")
    expect(b.locked).toBe(false)
    expect(b.label).toBe("Retirement Income Product Sheet v3")
  })

  it("marks a bullet quoted from the sheet exact, despite sentence-casing", () => {
    // "Guaranteed lifetime income" is a verbatim run from the sheet with only
    // its first letter changed for a list. Same claim, so exact.
    const b = find("Guaranteed lifetime income")
    expect(b.fidelity).toBe("exact")
    expect(b.locked).toBe(false)
    expect(b.assetId).toBe("p1")
  })

  it("marks a block fusing approved text with the model's own copy as ADAPTED", () => {
    // Pilot-readiness item 1 made visible. Part of this line is approved and
    // part is not, and a reviewer needs it to land in the amber bucket rather
    // than be certified by the approved half.
    const b = find("no-pressure evening")
    expect(b.fidelity).toBe("adapted")
    expect(b.locked).toBe(false)
    expect(b.assetId).toBe("p1")
    expect(b.coverage).toBeGreaterThanOrEqual(0.5)
    expect(b.coverage).toBeLessThan(1)
  })

  it("marks event logistics and the contact block as generated", () => {
    expect(find("Bowling Green Public Library").fidelity).toBe("generated")
    expect(find("Dana Reyes, Northstar Mutual").fidelity).toBe("generated")
  })

  it("marks the invented headline as generated", () => {
    expect(find("You're Invited").fidelity).toBe("generated")
  })

  it("reports leaf blocks, not the wrappers around them", () => {
    // A <ul> and a <footer> must not swallow their children and report once.
    expect(blocks.filter((b) => b.text === "Guaranteed lifetime income")).toHaveLength(1)
    expect(blocks.some((b) => b.text.includes("Guaranteed lifetime income") && b.text.includes("Spousal"))).toBe(false)
  })

  it("ignores <head>, so a <title> duplicating the headline is not a block", () => {
    expect(blocks.some((b) => b.text === "Ignore me")).toBe(false)
  })

  it("summarises cleanly with no violations", () => {
    const s = summariseAttribution(blocks)
    expect(s.violations).toBe(0)
    expect(s.exact).toBeGreaterThan(0)
    expect(s.adapted).toBeGreaterThan(0)
    expect(s.generated).toBeGreaterThan(0)
  })
})

describe("capitalisation is permitted on unlocked assets, not on locked ones", () => {
  it("treats a sentence-cased quote from an UNLOCKED asset as exact", () => {
    // Observed on a real run: the sheet says "...and spousal continuation",
    // the flyer renders the bullet "Spousal continuation". Same claim, and
    // reporting it as AI-generated told the reviewer the model invented an
    // approved product term.
    const html = `<html><body><li>Spousal continuation</li><li>Guaranteed lifetime income</li></body></html>`
    const blocks = attributeBlocks(html, LIB)
    expect(blocks.map((b) => b.fidelity)).toEqual(["exact", "exact"])
    expect(blocks.every((b) => b.assetId === "p1")).toBe(true)
  })

  it("does NOT absorb a capitalisation change on a LOCKED asset", () => {
    // The enterprise prompt forbids changing a locked asset's capitalisation,
    // so this has to stay visible rather than being normalised away.
    const shouted = LOCKED.replace("Guarantees are backed", "GUARANTEES ARE BACKED")
    const blocks = attributeBlocks(`<html><body><p>${shouted}</p></body></html>`, LIB)
    expect(blocks[0].fidelity).not.toBe("exact")
    expect(blocks[0].locked).toBe(true)
    expect(isVerbatimViolation(blocks[0])).toBe(true)
  })
})

describe("the failure the panel must make visible", () => {
  it("flags a REWORDED locked disclosure as a verbatim violation", () => {
    const paraphrased =
      "Guarantees are backed only by the claims-paying ability of Northstar Mutual. This material is educational and is not a recommendation to buy."
    const blocks = attributeBlocks(`<html><body><p>${paraphrased}</p></body></html>`, LIB)
    const b = blocks.find((x) => x.text.includes("claims-paying"))!
    expect(b.fidelity).toBe("adapted")
    expect(b.locked).toBe(true)
    expect(isVerbatimViolation(b)).toBe(true)
    expect(summariseAttribution(blocks).violations).toBe(1)
  })
})

describe("attribution does not manufacture provenance", () => {
  it("does not attribute a block too short to judge", () => {
    // "income" is a substring of both assets. Claiming it came from one would
    // be inventing a provenance record, which is the opposite of the point.
    const blocks = attributeBlocks(`<html><body><p>Income</p><p>6:00 PM</p></body></html>`, LIB)
    expect(blocks.every((b) => b.fidelity === "generated")).toBe(true)
  })

  it("leaves everything generated when the library is empty", () => {
    const blocks = attributeBlocks(`<html><body><p>${LOCKED}</p></body></html>`, [])
    expect(blocks[0].fidelity).toBe("generated")
    expect(blocks[0].assetId).toBeNull()
  })

  it("does not call unrelated prose adapted just for sharing a word", () => {
    const html = `<html><body><p>Parking is free in the lot behind the library building.</p></body></html>`
    expect(attributeBlocks(html, LIB)[0].fidelity).toBe("generated")
  })
})
