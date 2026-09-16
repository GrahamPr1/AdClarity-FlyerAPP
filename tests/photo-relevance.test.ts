import { describe, it, expect } from "vitest"
import { buildSpecificSearchQuery, buildSearchQuery } from "@/lib/unsplash"

/**
 * The search query put industry first, then the service, then the offer.
 * Because Unsplash ANDs terms the cap of three was reached before the offer
 * was read, so what the flyer was actually advertising never reached the
 * query. Measured against the real builder before the fix:
 *
 *   "Summer Kickboxing Bootcamp"     -> "gym personal training"
 *   "Back to School Checkup Special" -> "dental teeth whitening"
 *   "Live Jazz Brunch Every Sunday"  -> "restaurant catering live"
 *
 * Every one returns a photo of the trade in general and nothing of the
 * promotion.
 */
const CASES = [
  {
    name: "kickboxing bootcamp at a gym",
    input: { industry: "Gym", services: ["Personal training"], purpose: "Summer Kickboxing Bootcamp" },
    mustInclude: ["kickboxing"],
    mustNotBeOnly: ["gym", "personal", "training"],
  },
  {
    name: "back-to-school checkup at a dentist",
    input: { industry: "Dental", services: ["Teeth whitening"], purpose: "Back to School Checkup Special" },
    mustInclude: ["checkup"],
    mustNotBeOnly: ["dental", "teeth", "whitening"],
  },
  {
    name: "jazz brunch at a restaurant",
    input: { industry: "Restaurant", services: ["Catering"], purpose: "Live Jazz Brunch Every Sunday" },
    mustInclude: ["jazz"],
    mustNotBeOnly: ["restaurant", "catering"],
  },
]

describe("the promotion reaches the photo query", () => {
  for (const c of CASES) {
    it(`surfaces the promotion for ${c.name}`, () => {
      const q = buildSpecificSearchQuery(c.input).split(" ")
      for (const term of c.mustInclude) expect(q).toContain(term)
    })

    it(`does not reduce ${c.name} to industry terms alone`, () => {
      const q = buildSpecificSearchQuery(c.input).split(" ")
      expect(q.every((t) => c.mustNotBeOnly.includes(t))).toBe(false)
    })
  }

  it("still anchors on the trade so a promotion can't match another industry", () => {
    const q = buildSpecificSearchQuery(CASES[0].input).split(" ")
    expect(q).toContain("gym")
  })

  it("keeps the near-duplicate collapse that a measured query depends on", () => {
    // "Roofing" + "Roof replacement" must not become "roofing roof
    // replacement" — that measured 59 results against 2,179 for the collapsed
    // form.
    const q = buildSpecificSearchQuery({
      industry: "Roofing",
      services: ["Roof replacement"],
      purpose: "Fall Roof Replacement — $500 Off",
    })
    expect(q).toBe("roof replacement")
  })

  it("respects the three-term cap, since Unsplash ANDs terms", () => {
    const q = buildSpecificSearchQuery({
      industry: "Landscaping",
      services: ["Garden design"],
      purpose: "Spring Patio Pergola Decking Fence Installation Event",
    })
    expect(q.split(" ").length).toBeLessThanOrEqual(3)
  })

  it("drops scheduling noise that describes nothing visual", () => {
    const q = buildSpecificSearchQuery({
      industry: "Dental",
      services: ["Cleaning"],
      purpose: "Book Every Tuesday — Limited Time",
    }).split(" ")
    for (const noise of ["book", "every", "tuesday", "limited", "time"]) {
      expect(q).not.toContain(noise)
    }
  })

  it("falls back to the industry when a promotion carries no visual terms", () => {
    const q = buildSpecificSearchQuery({
      industry: "Plumbing",
      services: ["Drain cleaning"],
      purpose: "Save Now — Limited Time Only",
    })
    expect(q.length).toBeGreaterThan(0)
    expect(q.split(" ")).toContain("plumbing")
  })
})

describe("the broad fallback query is unchanged", () => {
  it("still behaves exactly as measured against the live API", () => {
    // Deliberately pinned: this is the safety net, and its result counts were
    // measured for real. Tightening relevance must not disturb it.
    expect(buildSearchQuery({ industry: "Gym", services: ["Personal training"], purpose: "Summer Kickboxing Bootcamp" }))
      .toBe("gym personal training")
  })
})
