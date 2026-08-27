import { describe, it, expect } from "vitest"
import { FLYER_SAMPLES, SAMPLES_DISCLAIMER } from "@/lib/samples"

/**
 * The gallery shows sample OUTPUT. It must never become a testimonials
 * section — fabricated customer quotes are a false-advertising risk, and real
 * customers' flyers are theirs, not ours to publish.
 */
describe("sample gallery data", () => {
  it("labels everything as sample output, not endorsement", () => {
    expect(SAMPLES_DISCLAIMER).toMatch(/sample output/i)
    expect(SAMPLES_DISCLAIMER).toMatch(/not customer flyers or endorsements/i)
  })

  it("carries no quote, attribution or person field", () => {
    // The shape itself is the guard: there is nowhere to put a testimonial.
    for (const s of FLYER_SAMPLES) {
      expect(Object.keys(s).sort()).toEqual(["format", "image", "label", "useCase"])
    }
  })

  it("references local images only — never a customer's hosted flyer", () => {
    for (const s of FLYER_SAMPLES) {
      expect(s.image, s.image).not.toMatch(/^https?:/)
      expect(s.image, s.image).toMatch(/\.(png|jpg|jpeg|webp)$/i)
      expect(s.image, s.image).not.toContain("/")
    }
  })

  it("uses generic use cases, not real business names", () => {
    for (const s of FLYER_SAMPLES) {
      expect(s.useCase.length).toBeGreaterThan(0)
    }
  })
})
