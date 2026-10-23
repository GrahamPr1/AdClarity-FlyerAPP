import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: vi.fn(async () => ({ allowed: true, retryAfterSeconds: 0 })) }))

import { findFallbackStockPhoto, GENERIC_FALLBACK_QUERY } from "@/lib/unsplash"

const photo = (id: string, alt: string) => ({
  id,
  urls: { regular: `https://images.unsplash.com/${id}` },
  links: { download_location: `https://api.unsplash.com/photos/${id}/download` },
  user: { name: "P", links: { html: "https://unsplash.com/@p" } },
  description: null,
  alt_description: alt,
})
const page = (total: number, results: ReturnType<typeof photo>[]) =>
  new Response(JSON.stringify({ total, results }), { status: 200, headers: { "content-type": "application/json" } })
const queryOf = (url: string) => new URL(url).searchParams.get("query")

describe("findFallbackStockPhoto", () => {
  let fetchMock: ReturnType<typeof vi.fn>
  beforeEach(() => {
    vi.stubEnv("UNSPLASH_ACCESS_KEY", "test")
    fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it("tries the industry alone first", async () => {
    fetchMock.mockResolvedValueOnce(page(500, [photo("a", "hvac technician tools")]))
    const r = await findFallbackStockPhoto({ industry: "HVAC", context: "t" })
    expect(r).toMatchObject({ ok: true, queryUsed: "hvac" })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("falls back to the generic query when the industry finds nothing usable", async () => {
    fetchMock.mockResolvedValueOnce(page(3, [])).mockResolvedValueOnce(page(900, [photo("s", "a storefront at dusk")]))
    const r = await findFallbackStockPhoto({ industry: "Zorblax quuxification", context: "t" })
    expect(r).toMatchObject({ ok: true, queryUsed: GENERIC_FALLBACK_QUERY })
    expect(queryOf(fetchMock.mock.calls[1][0])).toBe(GENERIC_FALLBACK_QUERY)
  })

  it("takes the generic query's top result even when its description doesn't say \"storefront\"", async () => {
    // Measured on Preview: 10 of 10 "storefront" results failed the keyword check.
    fetchMock.mockResolvedValueOnce(page(3, [])).mockResolvedValueOnce(page(900, [photo("g", "a cafe window on a quiet street")]))
    const r = await findFallbackStockPhoto({ industry: "Zorblax", context: "t" })
    expect(r).toMatchObject({ ok: true, queryUsed: GENERIC_FALLBACK_QUERY })
  })

  it("still keyword-checks the industry query", async () => {
    fetchMock.mockResolvedValueOnce(page(500, [photo("x", "a cat on a sofa")])).mockResolvedValueOnce(page(900, [photo("g", "a shopfront")]))
    const r = await findFallbackStockPhoto({ industry: "HVAC", context: "t" })
    expect(r).toMatchObject({ ok: true, queryUsed: GENERIC_FALLBACK_QUERY })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it("stops at once on a failure a retry can't fix", async () => {
    fetchMock.mockResolvedValueOnce(new Response("", { status: 403 }))
    const r = await findFallbackStockPhoto({ industry: "Zorblax", context: "t" })
    expect(r).toMatchObject({ ok: false, reason: "rate_limited" })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
