import { describe, it, expect } from "vitest"
import {
  resolveBrandColors, resolveFonts, findFontChoice, cleanHexList, normaliseHex, isHexColor,
  CURATED_FONTS,
} from "@/lib/brand-controls"

/**
 * Precedence between a website scan and a manual pick. Measured live before
 * building any of this: the scraper does work (mrrooter.com -> #005489 ->
 * colorSource "client_provided", hex preserved exactly), but produced colours
 * for only one of five real business sites. So both paths are real and the
 * ordering between them has to be explicit.
 */
describe("colour precedence", () => {
  const SCAN = ["#005489"]
  const MANUAL = ["#7A1F1C", "#F4EFE7"]
  // Normalised to lowercase on the way through, so two spellings of one
  // colour cannot both survive into the Brand Agent.
  const MANUAL_OUT = ["#7a1f1c", "#f4efe7"]

  it("uses scanned colours when a scan succeeded", () => {
    expect(resolveBrandColors({ scanned: SCAN, manual: null })).toEqual({ colors: SCAN, source: "scanned" })
  })

  it("does NOT let a manual pick silently beat a successful scan", () => {
    // The whole point: someone who scanned their real site and then idly
    // touched a swatch must not lose their actual brand colour.
    expect(resolveBrandColors({ scanned: SCAN, manual: MANUAL })).toEqual({ colors: SCAN, source: "scanned" })
  })

  it("lets a manual pick win ONLY when explicitly set as an override", () => {
    expect(resolveBrandColors({ scanned: SCAN, manual: MANUAL, manualOverridesScan: true }))
      .toEqual({ colors: MANUAL_OUT, source: "manual" })
  })

  it("ignores an override flag with nothing manual behind it", () => {
    expect(resolveBrandColors({ scanned: SCAN, manual: [], manualOverridesScan: true }))
      .toEqual({ colors: SCAN, source: "scanned" })
  })

  it("makes the manual pick primary when no site was scanned — the common case", () => {
    expect(resolveBrandColors({ scanned: null, manual: MANUAL })).toEqual({ colors: MANUAL_OUT, source: "manual" })
  })

  it("makes the manual pick primary when the scan found nothing", () => {
    // 4 of 5 real sites measured. Not an edge case.
    expect(resolveBrandColors({ scanned: [], manual: MANUAL })).toEqual({ colors: MANUAL_OUT, source: "manual" })
  })

  it("reports none when there is neither, so the Brand Agent proposes as today", () => {
    expect(resolveBrandColors({ scanned: null, manual: null })).toEqual({ colors: null, source: "none" })
  })
})

describe("hex handling", () => {
  it("accepts both shorthand and full hex", () => {
    expect(normaliseHex("#ABC")).toBe("#aabbcc")
    expect(normaliseHex("#00FF7f")).toBe("#00ff7f")
  })

  it("rejects anything that is not a hex colour", () => {
    // profile-defaults.ts deliberately refuses to map names to hex, and the
    // Brand Agent is told to use existingColors as exact hex values — so
    // "navy" reaching it would be treated as a colour literal.
    for (const bad of ["navy", "rgb(0,0,0)", "#12", "#1234567", "", "  "]) {
      expect(normaliseHex(bad)).toBeNull()
      expect(isHexColor(bad)).toBe(false)
    }
  })

  it("dedupes colours that differ only in spelling", () => {
    expect(cleanHexList(["#ABC", "#aabbcc", "#fff"])).toEqual(["#aabbcc", "#ffffff"])
  })

  it("drops invalid entries instead of passing them through", () => {
    expect(cleanHexList(["#005489", "navy", "#zzz"])).toEqual(["#005489"])
  })
})

describe("font choice", () => {
  it("returns null with no explicit pick, leaving today's behaviour untouched", () => {
    // The Brand Agent picks from fontStylePreference when nothing is chosen.
    // Substituting a default here would change every existing client's flyers.
    expect(resolveFonts(undefined)).toBeNull()
    expect(resolveFonts(null)).toBeNull()
    expect(resolveFonts("not-a-font")).toBeNull()
  })

  it("returns the chosen pairing", () => {
    const fonts = resolveFonts("classic-serif")
    expect(fonts?.heading).toContain("Georgia")
  })

  it("offers only stacks that need no network to render", () => {
    // A flyer is a data: URL in an iframe — an @import to a font CDN is
    // unreliable there, so the picker would show one font and print another.
    for (const f of CURATED_FONTS) {
      for (const stack of [f.heading, f.body]) {
        expect(stack).not.toMatch(/https?:|googleapis|@import/)
        expect(stack).toMatch(/serif|sans-serif|monospace/)
      }
    }
  })

  it("has unique ids and a fallback family in every stack", () => {
    expect(new Set(CURATED_FONTS.map((f) => f.id)).size).toBe(CURATED_FONTS.length)
    for (const f of CURATED_FONTS) expect(findFontChoice(f.id)).toBe(f)
  })
})
