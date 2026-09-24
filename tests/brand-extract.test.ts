import { describe, expect, it } from "vitest"
import * as cheerio from "cheerio"
import { extractLogo, extractColorRoles, rolesToFlatColors, isNeutralHex } from "@/lib/agent-pipeline/brand-extract"

const PAGE = "https://business.com/"
const $ = (html: string) => cheerio.load(html)

describe("extractLogo", () => {
  it("prefers a header SVG over a raster elsewhere on the page", () => {
    const doc = $(`
      <body>
        <img src="/hero-photo.jpg" alt="logo">
        <header><a href="/"><img src="/brand/logo.svg" alt="Acme Roofing"></a></header>
      </body>`)
    expect(extractLogo(doc, PAGE)?.url).toBe("https://business.com/brand/logo.svg")
  })

  it("does NOT take the first logo-ish image when it is a partner badge", () => {
    // The old heuristic returned this one, which is the bug being fixed.
    const doc = $(`
      <body>
        <footer><img src="/img/visa-logo.png" alt="Visa logo"></footer>
        <header><img src="/img/acme.png" alt="Acme" width="200" height="60"></header>
      </body>`)
    expect(extractLogo(doc, PAGE)?.url).toBe("https://business.com/img/acme.png")
  })

  it("excludes award, sponsor and review badges outright", () => {
    const doc = $(`<body><img src="/bbb-accredited-logo.png" alt="BBB logo"></body>`)
    expect(extractLogo(doc, PAGE)).toBeNull()
  })

  it("falls back to apple-touch-icon only when nothing else qualifies", () => {
    const doc = $(`<head><link rel="apple-touch-icon" href="/icon-180.png"></head><body></body>`)
    const logo = extractLogo(doc, PAGE)
    expect(logo?.url).toBe("https://business.com/icon-180.png")
    expect(logo?.why).toContain("favicon")
  })

  it("prefers a real logo over a favicon", () => {
    const doc = $(`
      <head><link rel="icon" href="/favicon.ico"></head>
      <body><header><img src="/logo.svg" alt="Acme logo"></header></body>`)
    expect(extractLogo(doc, PAGE)?.url).toBe("https://business.com/logo.svg")
  })

  it("penalises icon-sized and hero-sized images", () => {
    const doc = $(`<body><header><img src="/logo.png" alt="logo" width="16" height="16"></header></body>`)
    const logo = extractLogo(doc, PAGE)
    // Still found (header + alt + filename outweigh the penalty) but the
    // reason records why it was doubted.
    expect(logo?.why).toContain("icon-sized")
  })

  it("ignores tracking gifs", () => {
    const doc = $(`<body><img src="data:image/gif;base64,R0lGOD" alt="logo"></body>`)
    expect(extractLogo(doc, PAGE)).toBeNull()
  })

  it("returns null when the page has no images and no icon", () => {
    expect(extractLogo($("<body><p>hi</p></body>"), PAGE)).toBeNull()
  })
})

describe("extractColorRoles", () => {
  it("reads CSS custom properties as the strongest signal", () => {
    const doc = $(`<style>:root{--primary:#2f6d95;--secondary:#c9b28c;--accent:#e4796f}</style>`)
    const roles = extractColorRoles(doc)
    expect(roles.primary).toBe("#2f6d95")
    expect(roles.secondary).toBe("#c9b28c")
    expect(roles.accent).toBe("#e4796f")
  })

  it("reads body background and text colour", () => {
    const doc = $(`<style>body{background:#ffffff;color:#16181d}</style>`)
    const roles = extractColorRoles(doc)
    expect(roles.background).toBe("#ffffff")
    expect(roles.text).toBe("#16181d")
  })

  it("uses theme-color for primary when nothing better exists", () => {
    const doc = $(`<head><meta name="theme-color" content="#2f6d95"></head>`)
    expect(extractColorRoles(doc).primary).toBe("#2f6d95")
  })

  it("does not let a neutral theme-color become a brand colour", () => {
    const doc = $(`<head><meta name="theme-color" content="#111111"></head>`)
    expect(extractColorRoles(doc).primary).toBeNull()
  })

  it("leaves roles null when the page gives no evidence", () => {
    const roles = extractColorRoles($("<body><p>no styles here</p></body>"))
    expect(roles).toEqual({ primary: null, secondary: null, accent: null, background: null, text: null })
  })

  it("expands 3-digit hex", () => {
    const doc = $(`<style>:root{--primary:#abc}</style>`)
    expect(extractColorRoles(doc).primary).toBe("#aabbcc")
  })

  it("drops a background/text pair that is the same colour", () => {
    const doc = $(`<style>body{background:#ffffff;color:#ffffff}</style>`)
    const roles = extractColorRoles(doc)
    expect(roles.background).toBeNull()
    expect(roles.text).toBeNull()
  })

  it("drops text when it would be illegible against the detected background", () => {
    // both light — one of them is wrong, so text is discarded rather than shipped
    const doc = $(`<style>body{background:#ffffff;color:#f2f2f2}</style>`)
    expect(extractColorRoles(doc).text).toBeNull()
  })
})

describe("rolesToFlatColors", () => {
  it("returns the ranked non-null roles, preserving order", () => {
    expect(
      rolesToFlatColors({ primary: "#111111", secondary: null, accent: "#2f6d95", background: "#fff", text: "#000" }),
    ).toEqual(["#111111", "#2f6d95"])
  })
})

describe("isNeutralHex", () => {
  it("treats greys, white and black as neutral", () => {
    for (const hex of ["#ffffff", "#000000", "#f5f5f5", "#808080"]) {
      expect(isNeutralHex(hex), hex).toBe(true)
    }
  })
  it("treats saturated brand colours as non-neutral", () => {
    for (const hex of ["#2f6d95", "#e4796f", "#c9b28c"]) {
      expect(isNeutralHex(hex), hex).toBe(false)
    }
  })
})
