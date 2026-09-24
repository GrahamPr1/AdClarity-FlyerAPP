import { describe, expect, it } from "vitest"
import { normalizeWebsiteUrl, displayHost } from "@/lib/url-normalize"

describe("normalizeWebsiteUrl", () => {
  it("accepts a bare domain and adds https", () => {
    const r = normalizeWebsiteUrl("business.com")
    expect(r.ok && r.url).toBe("https://business.com/")
  })

  it("accepts www and keeps it — the apex may not serve", () => {
    const r = normalizeWebsiteUrl("www.business.com")
    expect(r.ok && r.url).toBe("https://www.business.com/")
    expect(r.ok && r.host).toBe("www.business.com")
  })

  it("accepts an explicit https URL unchanged", () => {
    const r = normalizeWebsiteUrl("https://business.com")
    expect(r.ok && r.url).toBe("https://business.com/")
  })

  it("upgrades http to https", () => {
    const r = normalizeWebsiteUrl("http://business.com")
    expect(r.ok && r.url).toBe("https://business.com/")
  })

  it("lowercases the host but preserves path case", () => {
    const r = normalizeWebsiteUrl("HTTPS://Business.COM/About-Us")
    expect(r.ok && r.url).toBe("https://business.com/About-Us")
  })

  it("strips a trailing slash from a subpath but keeps the root slash", () => {
    expect(normalizeWebsiteUrl("business.com/about/")).toMatchObject({ url: "https://business.com/about" })
    expect(normalizeWebsiteUrl("business.com/")).toMatchObject({ url: "https://business.com/" })
  })

  it("drops the fragment", () => {
    const r = normalizeWebsiteUrl("business.com/page#contact")
    expect(r.ok && r.url).toBe("https://business.com/page")
  })

  it("keeps the query string — it can select the real page", () => {
    const r = normalizeWebsiteUrl("business.com/p?id=2")
    expect(r.ok && r.url).toBe("https://business.com/p?id=2")
  })

  // --- rejections -----------------------------------------------------

  it("rejects empty input", () => {
    expect(normalizeWebsiteUrl("   ")).toMatchObject({ ok: false, reason: "empty" })
  })

  it("rejects free text with no dot", () => {
    expect(normalizeWebsiteUrl("hello world")).toMatchObject({ ok: false })
    expect(normalizeWebsiteUrl("mybusiness")).toMatchObject({ ok: false, reason: "no_dot" })
  })

  it("rejects an email address rather than treating it as a host", () => {
    expect(normalizeWebsiteUrl("owner@business.com")).toMatchObject({ ok: false, reason: "looks_like_email" })
  })

  it("rejects non-http schemes", () => {
    expect(normalizeWebsiteUrl("ftp://business.com")).toMatchObject({ ok: false, reason: "unsupported_scheme" })
    expect(normalizeWebsiteUrl("javascript://business.com")).toMatchObject({ ok: false, reason: "unsupported_scheme" })
  })

  it("refuses local and private addresses (SSRF)", () => {
    for (const host of ["localhost", "127.0.0.1", "10.0.0.5", "192.168.1.1", "169.254.169.254", "172.16.0.1"]) {
      expect(normalizeWebsiteUrl(host), host).toMatchObject({ ok: false })
    }
  })

  it("rejects a hostname with no real TLD", () => {
    expect(normalizeWebsiteUrl("business.")).toMatchObject({ ok: false })
    expect(normalizeWebsiteUrl("business..com")).toMatchObject({ ok: false })
  })

  it("always supplies a human-readable message when it fails", () => {
    const r = normalizeWebsiteUrl("hello world")
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.message.length).toBeGreaterThan(0)
  })
})

describe("displayHost", () => {
  it("strips protocol, www and path", () => {
    expect(displayHost("https://www.business.com/about")).toBe("business.com")
  })
  it("returns the raw input when it cannot be parsed", () => {
    expect(displayHost("not a url")).toBe("not a url")
  })
})
