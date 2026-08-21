import { describe, it, expect, vi, afterEach } from "vitest"
import {
  QR_PLACEHOLDER,
  substituteQr,
  collapseQrToToken,
  canonicalOfferFrom,
  assertOfferPreserved,
  ensureScrollable,
  toDataUrl,
} from "@/lib/agent-pipeline/flyer-html"
import type { FlyerSpecification } from "@/lib/agent-pipeline/schemas/flyer"

// A realistically-sized QR payload. The real one is ~4,200 characters; the
// point of the token is that a string this size never reaches the model.
const FAKE_QR = "data:image/png;base64," + "iVBORw0KGgoAAAANSUhEUg" + "A".repeat(4000)

describe("QR token substitution", () => {
  it("replaces the token with the real image", () => {
    const html = `<html><body><img src="${QR_PLACEHOLDER}" alt="Scan"></body></html>`
    const out = substituteQr(html, FAKE_QR)
    expect(out).toContain(FAKE_QR)
    expect(out).not.toContain(QR_PLACEHOLDER)
  })

  it("is deterministic — same input gives byte-identical output", () => {
    const html = `<img src="${QR_PLACEHOLDER}">`
    expect(substituteQr(html, FAKE_QR)).toBe(substituteQr(html, FAKE_QR))
  })

  it("replaces every occurrence, not just the first", () => {
    const html = `<img src="${QR_PLACEHOLDER}"><img src="${QR_PLACEHOLDER}">`
    expect(substituteQr(html, FAKE_QR).split(FAKE_QR)).toHaveLength(3)
    expect(substituteQr(html, FAKE_QR)).not.toContain(QR_PLACEHOLDER)
  })

  it("leaves html untouched when there is no QR (Trial has no tracking)", () => {
    const html = "<html><body>No QR here</body></html>"
    expect(substituteQr(html, null)).toBe(html)
  })

  it("collapses a real QR back to the token before html is re-shown to a model", () => {
    // This is the refine path: stored html already has the real image in it.
    const stored = `<html><img src="${FAKE_QR}" alt="Scan"></html>`
    const forPrompt = collapseQrToToken(stored)
    expect(forPrompt).toContain(QR_PLACEHOLDER)
    expect(forPrompt).not.toContain("iVBORw0KGgo")
    // And the payload the model would have had to reproduce is gone entirely.
    expect(forPrompt.length).toBeLessThan(stored.length - 3000)
  })

  it("round-trips: collapse then substitute restores the original html", () => {
    const original = `<html><img src="${FAKE_QR}"></html>`
    expect(substituteQr(collapseQrToToken(original), FAKE_QR)).toBe(original)
  })
})

describe("ensureScrollable", () => {
  it("overrides a model's overflow:hidden so an opened flyer can scroll", () => {
    const html = "<html><head><style>body{overflow:hidden;height:100vh}</style></head><body>x</body></html>"
    const out = ensureScrollable(html)
    expect(out).toContain("overflow-y:auto !important")
    // Appended after the model's own style block so it wins the cascade.
    expect(out.indexOf("overflow-y:auto")).toBeGreaterThan(out.indexOf("overflow:hidden"))
  })

  it("still injects when there is no <head>", () => {
    expect(ensureScrollable("<html><body>x</body></html>")).toContain("overflow-y:auto !important")
  })
})

describe("toDataUrl", () => {
  it("produces a decodable html data url with the scroll fix applied", () => {
    const url = toDataUrl("<html><body>hi</body></html>")
    expect(url.startsWith("data:text/html;charset=utf-8;base64,")).toBe(true)
    const decoded = Buffer.from(url.split("base64,")[1], "base64").toString("utf-8")
    // Content is preserved, and ensureScrollable's override is injected
    // before </body> — so the decoded doc is NOT byte-identical to the input.
    expect(decoded).toContain("<body>hi")
    expect(decoded).toContain("overflow-y:auto !important")
  })
})

function flyer(overrides: Partial<FlyerSpecification> = {}): FlyerSpecification {
  return {
    id: "f1",
    purpose: "Promo flyer",
    dimensions: "8.5in x 11in",
    headline: "$500 Off Your New Roof",
    subheadline: "Free inspection",
    offer: "$500 off a new roof",
    cta: "Call for a free estimate",
    disclaimer: null,
    html: "<html></html>",
    paletteUsed: { primary: "#1b3a5c", secondary: "#fff", accent: "#5eb8f0" },
    fontsUsed: { heading: "Inter", body: "Inter" },
    notes: "",
    repurposed: null,
    ...overrides,
  }
}

describe("canonicalOfferFrom", () => {
  it("derives the offer from the generated flyer, which is the source of truth", () => {
    const c = canonicalOfferFrom(flyer())
    expect(c.headline).toBe("$500 Off Your New Roof")
    expect(c.offer).toBe("$500 off a new roof")
    expect(c.cta).toBe("Call for a free estimate")
  })

  it("carries the palette and fonts so repurposed assets look like the same campaign", () => {
    const c = canonicalOfferFrom(flyer())
    expect(c.paletteUsed.primary).toBe("#1b3a5c")
    expect(c.fontsUsed.heading).toBe("Inter")
  })

  it("does not leak the flyer html into the repurpose prompt", () => {
    expect(Object.keys(canonicalOfferFrom(flyer()))).not.toContain("html")
  })
})

describe("assertOfferPreserved", () => {
  afterEach(() => vi.restoreAllMocks())

  const spy = () => vi.spyOn(console, "error").mockImplementation(() => {})

  it("stays silent when every channel repeats the same figure", () => {
    const e = spy()
    assertOfferPreserved("f1", flyer(), {
      instagramCaption: "$500 off a new roof this month",
      textBlurb: "Bluegrass Roofing: $500 off a new roof. Call us.",
      nextdoorPost: "Neighbors — we're offering $500 off a new roof.",
    })
    expect(e).not.toHaveBeenCalled()
  })

  it("flags a channel that changes the amount", () => {
    const e = spy()
    assertOfferPreserved("f1", flyer(), {
      instagramCaption: "$500 off a new roof",
      textBlurb: "$400 off a new roof", // drifted
      nextdoorPost: "$500 off a new roof",
    })
    expect(e).toHaveBeenCalledTimes(1)
    expect(e.mock.calls[0][0]).toContain("textBlurb")
    expect(e.mock.calls[0][0]).toContain("OFFER DRIFT")
  })

  it("tolerates formatting differences in the same figure", () => {
    const e = spy()
    assertOfferPreserved("f1", flyer({ headline: "$1,500 Off", offer: "$1,500 off" }), {
      instagramCaption: "$1500 off", // no comma
      textBlurb: "$1,500 off",
      nextdoorPost: "no figure mentioned here",
    })
    expect(e).not.toHaveBeenCalled()
  })

  it("does not flag a channel that mentions no figure at all", () => {
    const e = spy()
    assertOfferPreserved("f1", flyer(), {
      instagramCaption: "$500 off a new roof",
      textBlurb: "We're running a promotion — call us.",
      nextdoorPost: "Happy to take a look, neighbors.",
    })
    expect(e).not.toHaveBeenCalled()
  })

  it("handles percentage offers", () => {
    const e = spy()
    assertOfferPreserved("f1", flyer({ headline: "20% Off", offer: "20% off your next visit" }), {
      instagramCaption: "20% off",
      textBlurb: "15% off", // drifted
      nextdoorPost: "20% off",
    })
    expect(e).toHaveBeenCalledTimes(1)
    expect(e.mock.calls[0][0]).toContain("textBlurb")
  })

  it("is advisory only — never throws, because the flyer is already delivered", () => {
    spy()
    expect(() =>
      assertOfferPreserved("f1", flyer(), { instagramCaption: "$1 off", textBlurb: "$2 off", nextdoorPost: "$3 off" }),
    ).not.toThrow()
  })

  it("does nothing when the offer contains no figure to protect", () => {
    const e = spy()
    assertOfferPreserved("f1", flyer({ headline: "Free AC Inspection", offer: "Free inspection" }), {
      instagramCaption: "Free AC inspection",
      textBlurb: "Free inspection before summer",
      nextdoorPost: "Free inspection",
    })
    expect(e).not.toHaveBeenCalled()
  })
})
