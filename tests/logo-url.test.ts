import { describe, it, expect } from "vitest"
import * as cheerio from "cheerio"
import { safeLogoUrl, escapeHtmlAttr } from "@/lib/logo-url"
import { substituteLogo, logoPresentIn, LOGO_PLACEHOLDER } from "@/lib/agent-pipeline/flyer-html"

const PAGE = (body: string) => `<!doctype html><html><head><title>t</title></head><body>${body}</body></html>`
const WITH_TOKEN = PAGE(`<header><img class="logo" src="${LOGO_PLACEHOLDER}" alt="" /></header><h1>Offer</h1>`)

/** Every element and attribute in the output — so an injected onerror/script would show up. */
function inspect(html: string) {
  const $ = cheerio.load(html)
  const imgs = $("img").toArray().map((el) => ({ src: $(el).attr("src"), attrs: Object.keys(el.attribs).sort() }))
  return { imgs, scripts: $("script").length, lower: html.toLowerCase() }
}

describe("safeLogoUrl — what is accepted", () => {
  it("accepts a plain https URL, normalised", () => {
    expect(safeLogoUrl("https://cdn.example.com/brand/logo.png")).toBe("https://cdn.example.com/brand/logo.png")
    expect(safeLogoUrl("  https://Example.COM/a b.png  ")).toBe("https://example.com/a%20b.png")
  })

  it("accepts http only on loopback, only when development allows it", () => {
    expect(safeLogoUrl("http://localhost:3000/api/photos/x.png", { allowDevLocalhost: true })).toBe("http://localhost:3000/api/photos/x.png")
    expect(safeLogoUrl("http://localhost:3000/api/photos/x.png")).toBeNull()
    expect(safeLogoUrl("http://example.com/logo.png", { allowDevLocalhost: true })).toBeNull()
  })
})

describe("safeLogoUrl — malicious and invalid values are rejected", () => {
  const rejected: [string, unknown][] = [
    ["javascript: URL", "javascript:alert(1)"],
    ["javascript: with odd case and whitespace", "  JaVaScRiPt:alert(document.cookie)"],
    ["attribute breakout, no scheme", '"><script>alert(1)</script>'],
    ["attribute breakout with onerror", '" onerror="alert(1)'],
    ["data: SVG", "data:image/svg+xml,<svg onload=alert(1)>"],
    ["vbscript:", "vbscript:msgbox(1)"],
    ["plain http", "http://example.com/logo.png"],
    ["protocol-relative", "//evil.example/logo.png"],
    ["relative path", "/api/photos/logo.png"],
    ["embedded credentials", "https://user:pass@example.com/logo.png"],
    ["file:", "file:///etc/passwd"],
    ["empty", "   "],
    ["not a string", { toString: () => "https://x.test/a.png" }],
    ["too long", "https://example.com/" + "a".repeat(2100)],
  ]
  for (const [label, value] of rejected) {
    it(`rejects ${label}`, () => expect(safeLogoUrl(value)).toBeNull())
  }

  it("neutralises quotes inside an otherwise valid https URL (percent-encoded by the parser)", () => {
    const out = safeLogoUrl('https://example.com/logo.png"onerror="alert(1)')!
    expect(out).not.toContain('"')
    expect(out).toBe("https://example.com/logo.png%22onerror=%22alert(1)")
  })
})

describe("escapeHtmlAttr", () => {
  it("escapes everything that can end or alter an attribute", () => {
    expect(escapeHtmlAttr(`a&b"c'd<e>f`)).toBe("a&amp;b&quot;c&#39;d&lt;e&gt;f")
  })
})

describe("substituteLogo — what actually lands in the flyer HTML", () => {
  it("inserts a valid https logo, attribute-escaped (& → &amp;), and the browser reads it back intact", () => {
    const url = "https://cdn.example.com/logo.png?w=200&h=80"
    const out = substituteLogo(WITH_TOKEN, url)
    expect(out).toContain('src="https://cdn.example.com/logo.png?w=200&amp;h=80"')
    const { imgs } = inspect(out)
    expect(imgs).toEqual([{ src: url, attrs: ["alt", "class", "src"] }])
    expect(logoPresentIn(out, url)).toBe(true)
  })

  const hostile = [
    "javascript:alert(1)",
    '"><script>alert(1)</script>',
    '" onerror="alert(1)',
    "data:image/svg+xml,<svg onload=alert(1)>",
    "http://evil.example/logo.png",
  ]
  for (const value of hostile) {
    it(`treats ${JSON.stringify(value)} as no logo: token stripped, nothing injected`, () => {
      for (const html of [WITH_TOKEN, PAGE("<h1>Offer</h1>")]) {
        const out = substituteLogo(html, value)
        const { imgs, scripts, lower } = inspect(out)
        expect(scripts).toBe(0)
        expect(lower).not.toContain("javascript:")
        expect(lower).not.toContain("onerror")
        expect(lower).not.toContain("onload")
        expect(out).not.toContain(LOGO_PLACEHOLDER)
        expect(imgs.every((i) => i.src === "" || i.src === undefined)).toBe(true)
      }
    })
  }

  it("a quote smuggled into an https URL cannot add attributes (injected path too)", () => {
    const out = substituteLogo(PAGE("<h1>Offer</h1>"), 'https://example.com/x.png" onerror="alert(1)')
    const { imgs, lower } = inspect(out)
    expect(imgs).toHaveLength(1)
    expect(imgs[0].attrs).toEqual(["alt", "class", "src"])
    expect(lower).not.toMatch(/\sonerror=/)
  })

  it("does not add a second logo on refine when the escaped one is already present", () => {
    const url = "https://cdn.example.com/logo.png?a=1&b=2"
    const once = substituteLogo(PAGE("<h1>Offer</h1>"), url)
    expect(inspect(substituteLogo(once, url)).imgs).toHaveLength(1)
  })
})
