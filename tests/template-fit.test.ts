import { describe, it, expect } from "vitest"
import * as cheerio from "cheerio"
import { estimateLines, fillTemplate, fitText, refitTemplateFlyer, templateColors, TEMPLATES } from "@/lib/agent-pipeline/template-mode"
import { templateById } from "@/lib/agent-pipeline/templates"
import { contrastRatio, parseColor } from "@/lib/agent-pipeline/legibility"

const base = {
  headline: "Fall Furnace Tune-Up for $89",
  supporting: "21-point safety check before the cold hits. Book by November 30.",
  businessName: "Miller Heating & Air",
  phone: "(502) 555-0142",
  address: "Louisville, KY",
  hasLogo: true,
  hasQr: true,
  photoUrl: null,
  colors: { primary: "#12314f", secondary: "#e8edf2", accent: "#e39a2b" },
  fonts: { heading: "Georgia, serif", body: "Georgia, serif" },
}
const sizeOf = (html: string, v: string) => Number(html.match(new RegExp(`${v}:(\\d+)px`))?.[1])

describe("fitting text in code", () => {
  it("never accepts a size that breaks a word, unless told it may", () => {
    expect(estimateLines("Architectural shingles", 80, 300, 0.63)).toBe(Infinity)
    expect(estimateLines("Architectural shingles", 80, 300, 0.63, true)).toBeGreaterThan(1)
    expect(estimateLines("Roof sale", 60, 738, 0.63)).toBe(1)
  })

  it("gives short copy large type and long copy smaller type, in the same box", () => {
    const box = templateById("banner-hero")!.layout({ hasLogo: false, hasQr: true, hasPhoto: false }).text
    const short = fitText("Roof sale", "$500 off.", box)
    const long = fitText("Architectural Shingle Replacements Professionally", "Includes tear-off, synthetic underlayment, ice-and-water shield and full debris haul-away.", box)
    expect(short.headline.size).toBeGreaterThan(long.headline.size)
    expect(short.headline.truncated || long.headline.truncated).toBe(false)
  })

  it("trims words rather than go below the template's legibility floor", () => {
    const box = templateById("door-hanger-stack")!.layout({ hasLogo: true, hasQr: true, hasPhoto: true }).text
    const fit = fitText("Architectural Shingle Replacements Today", "x ".repeat(400).trim(), box)
    expect(fit.supporting.size).toBeGreaterThanOrEqual(13)
    expect(fit.supporting.truncated).toBe(true)
  })
})

describe("colours", () => {
  it("public accounts: text on a pale primary becomes dark, and the headline colour passes on white", () => {
    const c = templateColors({ primary: "#f5c518", secondary: "#fff7d6", accent: "#2b2b2b" }, "repair")
    const primary = parseColor("#f5c518")!
    expect(contrastRatio(parseColor(c.vars["--on-primary"])!, primary)).toBeGreaterThanOrEqual(4.5)
    expect(contrastRatio(parseColor(c.vars["--ink"])!, { r: 255, g: 255, b: 255 })).toBeGreaterThanOrEqual(4.5)
    expect(c.notes.every((n) => n.repaired)).toBe(true)
  })

  it("enterprise accounts: brand colours untouched, the failures returned as notes", () => {
    const c = templateColors({ primary: "#f5c518", secondary: "#fff7d6", accent: "#2b2b2b" }, "preserve")
    expect(c.vars["--on-primary"]).toBe("#ffffff")
    expect(c.vars["--ink"].toLowerCase()).toBe("#f5c518")
    expect(c.notes).toHaveLength(2)
    expect(c.notes.some((n) => n.repaired)).toBe(false)
  })

  it("a dark primary needs no change under either policy", () => {
    for (const policy of ["repair", "preserve"] as const) {
      const c = templateColors(base.colors, policy)
      expect(c.vars["--on-primary"]).toBe("#ffffff")
      expect(c.notes).toEqual([])
    }
  })
})

describe("re-fitting after an edit", () => {
  const flyer = fillTemplate({ ...base, template: TEMPLATES[0], headline: "Roof sale", supporting: "$500 off." }).html

  it("records the template and layout a re-fit needs", () => {
    expect(flyer).toMatch(/<div class="page" data-template="banner-hero" data-layout="logo,qr"/)
  })

  it("shrinks the type when the headline is lengthened, without changing the text", () => {
    const longer = flyer.replace(">Roof sale<", ">Architectural Shingle Replacements Professionally<")
    const r = refitTemplateFlyer(longer)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(sizeOf(r.html, "--h1")).toBeLessThan(sizeOf(flyer, "--h1"))
    expect(r.html).toContain(">Architectural Shingle Replacements Professionally<")
  })

  it("refuses text that cannot fit even at the smallest sizes, rather than clip it", () => {
    const tooLong = flyer.replace(">$500 off.<", `>${"word ".repeat(400).trim()}<`)
    expect(refitTemplateFlyer(tooLong).ok).toBe(false)
  })

  it("leaves a flyer made before re-fitting existed exactly as it was", () => {
    const old = "<html><body><div class=\"page\"><span data-field=\"headline\" data-max=\"52\">Hi</span></div></body></html>"
    expect(refitTemplateFlyer(old)).toEqual({ ok: true, html: old })
  })
})

describe("social square", () => {
  it("never sets text directly on the photo: every text block sits on a solid panel", () => {
    const html = fillTemplate({ ...base, template: templateById("social-square")!, hasQr: false, photoUrl: "https://images.unsplash.com/photo-1?w=1080" }).html
    const $ = cheerio.load(html)
    for (const field of ["headline", "supporting", "phone"]) {
      const panel = $(`[data-field="${field}"]`).parents().filter((_, el) => /background:var\(--brand-primary\)/.test($(el).attr("style") ?? ""))
      expect(panel.length, field).toBeGreaterThan(0)
    }
  })
})

describe("direct edits re-fit (flyer-edit.ts applyFieldEdits)", () => {
  const flyer = fillTemplate({ ...base, template: TEMPLATES[0], headline: "Roof sale", supporting: "$500 off." }).html

  it("re-fits the type when a short headline is lengthened", async () => {
    const { applyFieldEdits } = await import("@/lib/agent-pipeline/flyer-edit")
    const r = applyFieldEdits(flyer, { headline: "Architectural shingle roof replacements" })
    expect(r.applied).toEqual(["headline"])
    expect(sizeOf(r.html, "--h1")).toBeLessThan(sizeOf(flyer, "--h1"))
  })

  it("refuses an edit that cannot fit with a clear 'shorten to about N characters', and still applies the rest", async () => {
    const { applyFieldEdits } = await import("@/lib/agent-pipeline/flyer-edit")
    // Raise the budget so only the physical fit can refuse it.
    const loose = flyer.replace(/(data-field="supporting" data-max=")\d+/, "$12000")
    const r = applyFieldEdits(loose, { supporting: "word ".repeat(300).trim(), phone: "(502) 555-0199" })
    expect(r.applied).toEqual(["phone"])
    const rej = r.rejected.find((x) => x.field === "supporting")
    expect(rej?.reason).toBe("too_long")
    expect(rej?.message).toMatch(/^Supporting is too long to fit this layout — shorten it to about \d+ characters\.$/)
    expect(r.html).toContain("(502) 555-0199")
    expect(r.html).toContain(">$500 off.<")
  })
})
