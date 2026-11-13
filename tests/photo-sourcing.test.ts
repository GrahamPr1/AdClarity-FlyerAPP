import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

/**
 * The stock-photo chain (Unsplash -> Pexels), the account gate on Pexels,
 * the Redis search cache, the quota skip, and the per-flyer source record.
 * Redis is an in-memory map; provider HTTP is a fetch stub routed by host.
 */

const store = vi.hoisted(() => new Map<string, unknown>())
vi.mock("@upstash/redis", () => ({
  Redis: {
    fromEnv: () => ({
      get: async (k: string) => (store.has(k) ? store.get(k) : null),
      set: async (k: string, v: unknown) => void store.set(k, v),
    }),
  },
}))
const budget = vi.hoisted(() => ({ calls: 0 }))
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: async () => (budget.calls++, { allowed: true, retryAfterSeconds: 0 }),
}))
const nop = vi.hoisted(() => ({ agents: new Set<string>(), fail: false }))
vi.mock("@/lib/enterprise/agents-store", () => ({
  isNopAgentAccount: async (email: string) => {
    if (nop.fail) throw new Error("redis down")
    return nop.agents.has(email)
  },
}))

import { creditInstagramSquare, findStockForPromotion, findFallbackStock, pexelsAllowedFor, photoSourceFor, recordFlyerPhotoSource, getFlyerPhotoSource } from "@/lib/stock-photos"
import { fillTemplate, selectTemplate } from "@/lib/agent-pipeline/template-mode"
import { findPhoto } from "@/lib/unsplash"
import { describesPeople, findPexelsPhoto } from "@/lib/pexels"
import { injectPhotoAttribution } from "@/lib/agent-pipeline/flyer-html"
import { isAllowedPdfRequest } from "@/lib/pdf/request-policy"
import { searchCacheKey } from "@/lib/photo-search-cache"

const unsplashPage = (total: number, alts: string[], headers: Record<string, string> = {}) =>
  new Response(
    JSON.stringify({
      total,
      results: alts.map((alt, i) => ({
        id: `u${i}`,
        urls: { regular: `https://images.unsplash.com/photo-u${i}?w=1080` },
        links: { download_location: `https://api.unsplash.com/photos/u${i}/download` },
        user: { name: "Una", links: { html: "https://unsplash.com/@una" } },
        description: null,
        alt_description: alt,
      })),
    }),
    { status: 200, headers: { "content-type": "application/json", ...headers } },
  )

const pexelsPage = (total: number, alts: (string | null)[], headers: Record<string, string> = {}) =>
  new Response(
    JSON.stringify({
      total_results: total,
      photos: alts.map((alt, i) => ({
        id: 100 + i,
        url: `https://www.pexels.com/photo/thing-${100 + i}/`,
        photographer: "Pia Pex",
        photographer_url: "https://www.pexels.com/@pia",
        alt,
        src: { large2x: `https://images.pexels.com/photos/${100 + i}/pexels-photo-${100 + i}.jpeg?dpr=2&w=940` },
      })),
    }),
    { status: 200, headers: { "content-type": "application/json", ...headers } },
  )

type Route = (url: string) => Response
let unsplash: Route
let pexels: Route
let calls: string[]

beforeEach(() => {
  store.clear()
  budget.calls = 0
  nop.agents.clear()
  nop.fail = false
  calls = []
  vi.stubEnv("UNSPLASH_ACCESS_KEY", "u-key")
  vi.stubEnv("PEXELS_API_KEY", "p-key")
  unsplash = () => unsplashPage(500, ["roof replacement on a house"])
  pexels = () => pexelsPage(500, ["roof replacement shingles"])
  vi.stubGlobal("fetch", async (input: string | URL) => {
    const url = String(input)
    calls.push(url)
    return new URL(url).host === "api.pexels.com" ? pexels(url) : unsplash(url)
  })
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

const promo = { industry: "Roofing", purpose: "Roof replacement", services: [], context: "t" }
const hosts = () => calls.map((c) => new URL(c).host)

describe("chain order", () => {
  it("uses Unsplash and never calls Pexels when Unsplash has a photo", async () => {
    const r = await findStockForPromotion(promo, true)
    expect(r).toMatchObject({ ok: true, photo: { provider: "unsplash" } })
    expect(hosts()).toEqual(["api.unsplash.com"])
  })

  it("falls through to Pexels when Unsplash fails", async () => {
    unsplash = () => new Response("", { status: 500 })
    const r = await findStockForPromotion(promo, true)
    expect(r).toMatchObject({
      ok: true,
      photo: { provider: "pexels", pageUrl: "https://www.pexels.com/photo/thing-100/", url: expect.stringMatching(/^https:\/\/images\.pexels\.com\//) },
    })
  })

  it("never calls Pexels when it isn't allowed for the account", async () => {
    unsplash = () => new Response("", { status: 500 })
    const r = await findStockForPromotion(promo, false)
    expect(r.ok).toBe(false)
    expect(hosts()).not.toContain("api.pexels.com")
  })

  it("reports a miss from both when both fail, so the caller continues down the chain", async () => {
    unsplash = () => new Response("", { status: 500 })
    pexels = () => new Response("", { status: 500 })
    expect((await findStockForPromotion(promo, true)).ok).toBe(false)
    expect((await findFallbackStock({ industry: "Roofing", context: "t" }, true)).ok).toBe(false)
  })
})

describe("Pexels dormant: no PEXELS_API_KEY", () => {
  beforeEach(() => vi.stubEnv("PEXELS_API_KEY", ""))

  it("reports not_configured without a request and without throwing", async () => {
    await expect(findPexelsPhoto({ query: "roof", context: "t" })).resolves.toMatchObject({ ok: false, reason: "not_configured" })
    expect(calls).toHaveLength(0)
  })

  it("lets the chain fall straight through when Unsplash fails, so the caller moves on to AI or the no-photo layout", async () => {
    unsplash = () => new Response("", { status: 500 })
    const promoMiss = await findStockForPromotion(promo, true)
    // Nothing a broader search could fix: the primary's (unconfigured
    // Pixabay's) reason is reported, with every provider in the detail.
    expect(promoMiss).toMatchObject({ ok: false, reason: "not_configured" })
    expect(promoMiss.ok === false && promoMiss.detail).toContain("unsplash: error")
    expect(promoMiss.ok === false && promoMiss.detail).toContain("pexels: not_configured")
    const fallbackMiss = await findFallbackStock({ industry: "Roofing", context: "t" }, true)
    expect(fallbackMiss.ok).toBe(false)
    expect(hosts()).not.toContain("api.pexels.com")
  })

  it("reports Unsplash's thin result (not an unconfigured provider's), so the post-AI broad stock search still runs", async () => {
    unsplash = () => unsplashPage(5, ["roof"])
    expect(await findStockForPromotion(promo, true)).toMatchObject({ ok: false, reason: "thin_results" })
  })

  it("changes nothing when Unsplash has a photo", async () => {
    expect(await findStockForPromotion(promo, true)).toMatchObject({ ok: true, photo: { provider: "unsplash" } })
  })
})

describe("pexelsAllowedFor — an explicit account-type check", () => {
  it("allows a public account", async () => {
    expect(await pexelsAllowedFor("smb@x.test", false)).toBe(true)
  })
  it("refuses an enterprise account without needing the NOP lookup", async () => {
    nop.fail = true
    expect(await pexelsAllowedFor("org@x.test", true)).toBe(false)
  })
  it("refuses a NOP agent", async () => {
    nop.agents.add("agent@x.test")
    expect(await pexelsAllowedFor("agent@x.test", false)).toBe(false)
  })
  it("fails closed when the NOP lookup errors", async () => {
    nop.fail = true
    expect(await pexelsAllowedFor("smb@x.test", false)).toBe(false)
  })
})

describe("search cache", () => {
  it("serves a repeated identical search from Redis: no second request, no budget spent", async () => {
    await findPhoto({ query: "roof replacement", context: "t" })
    const log = vi.spyOn(console, "log")
    const second = await findPhoto({ query: "  Roof   Replacement ", context: "t" })
    expect(second.ok).toBe(true)
    expect(calls).toHaveLength(1)
    expect(budget.calls).toBe(1)
    expect(log).toHaveBeenCalledWith('[photo-search] cache HIT unsplash "roof replacement"')
  })

  it("caches the provider's own CDN URLs, never anything of ours", async () => {
    await findPhoto({ query: "roof replacement", context: "t" })
    const cached = JSON.stringify(store.get(searchCacheKey("unsplash", "roof replacement")))
    expect(cached).toContain("https://images.unsplash.com/photo-u0")
    expect(cached).toContain("https://api.unsplash.com/photos/u0/download")
  })

  it("caches Pexels separately from Unsplash", async () => {
    await findPexelsPhoto({ query: "roof replacement", context: "t" })
    await findPexelsPhoto({ query: "roof replacement", context: "t" })
    expect(hosts()).toEqual(["api.pexels.com"])
    expect(store.has(searchCacheKey("pexels", "roof replacement"))).toBe(true)
  })
})

describe("rate-limit awareness", () => {
  it("skips Unsplash once its X-Ratelimit-Remaining hits the floor, without a request", async () => {
    unsplash = () => unsplashPage(500, ["roof replacement"], { "x-ratelimit-remaining": "2" })
    await findPhoto({ query: "roof replacement", context: "t" })
    const r = await findPhoto({ query: "gutter cleaning", context: "t" })
    expect(r).toMatchObject({ ok: false, reason: "rate_limited" })
    expect(calls).toHaveLength(1)
  })

  it("skips Unsplash after a 403, and the chain goes straight to Pexels", async () => {
    unsplash = () => new Response("Rate Limit Exceeded", { status: 403 })
    pexels = () => pexelsPage(500, ["Clean gutter on a roof edge"])
    await findPhoto({ query: "roof replacement", context: "t" })
    calls = []
    const r = await findStockForPromotion({ ...promo, purpose: "Gutter cleaning" }, true)
    expect(r).toMatchObject({ ok: true, photo: { provider: "pexels" } })
    expect(hosts()).toEqual(["api.pexels.com"])
  })

  it("skips Pexels once its X-Ratelimit-Remaining hits the floor", async () => {
    pexels = () => pexelsPage(500, ["roof replacement"], { "x-ratelimit-remaining": "1", "x-ratelimit-reset": String(Math.floor(Date.now() / 1000) + 900) })
    await findPexelsPhoto({ query: "roof replacement", context: "t" })
    expect(await findPexelsPhoto({ query: "gutter", context: "t" })).toMatchObject({ ok: false, reason: "rate_limited" })
    expect(calls).toHaveLength(1)
  })

  it("still serves a cached search while the provider is exhausted", async () => {
    unsplash = () => unsplashPage(500, ["roof replacement"], { "x-ratelimit-remaining": "0" })
    await findPhoto({ query: "roof replacement", context: "t" })
    expect((await findPhoto({ query: "roof replacement", context: "t" })).ok).toBe(true)
    expect(calls).toHaveLength(1)
  })
})

describe("Pexels: no identifiable people", () => {
  it("recognises people in a description", () => {
    expect(describesPeople("Man in Black Shirt Fixing a Sink")).toBe(true)
    expect(describesPeople("Plumber repairing pipes")).toBe(true)
    expect(describesPeople("Copper pipes under a kitchen sink")).toBe(false)
  })

  it("skips people and undescribed photos for the first people-free match", async () => {
    pexels = () => pexelsPage(500, ["Woman inspecting a roof", null, "", "New roof shingles in sunlight"])
    const r = await findPexelsPhoto({ query: "roof", context: "t" })
    expect(r).toMatchObject({ ok: true, photo: { id: "103" } })
  })

  it("uses no photo at all rather than one with a person in it", async () => {
    pexels = () => pexelsPage(500, ["Roofer on a roof", "Couple in front of their new roof"])
    expect(await findPexelsPhoto({ query: "roof", context: "t" })).toMatchObject({ ok: false, reason: "no_relevant_match" })
  })
})

describe("attribution", () => {
  const pex = { provider: "pexels" as const, url: "https://images.pexels.com/photos/1/a.jpeg?w=940&dpr=2", photographerName: "Pia <Pex>", photographerUrl: "https://www.pexels.com/@pia", pageUrl: "https://www.pexels.com/photo/thing-1/" }

  it("credits Pexels on screen formats, linking to the photo's Pexels page", () => {
    const out = injectPhotoAttribution(`<body><img src="${pex.url}"></body>`, [pex], "screen")
    expect(out).toContain('on <a href="https://www.pexels.com/photo/thing-1/" rel="noopener noreferrer nofollow" target="_blank">Pexels</a>')
    expect(out).toContain("Pia &lt;Pex&gt;")
  })

  it("credits Pexels in plain text on print formats", () => {
    expect(injectPhotoAttribution("<body></body>", [pex], "print")).toContain("Photo by Pia &lt;Pex&gt; on Pexels")
  })

  it("leaves the Unsplash credit exactly as it was", () => {
    const u = { url: "https://images.unsplash.com/x", photographerName: "Una", photographerUrl: "https://unsplash.com/@una" }
    const before = injectPhotoAttribution("<body></body>", [u], "screen")
    expect(injectPhotoAttribution("<body></body>", [{ ...u, provider: "unsplash" as const }], "screen")).toBe(before)
  })

  it("lets the PDF renderer fetch Pexels images (hotlinked, like Unsplash)", () => {
    expect(isAllowedPdfRequest("https://images.pexels.com/photos/1/a.jpeg", "GET", { siteHosts: [] })).toBe(true)
  })
})

describe("per-flyer photo source record", () => {
  const stock = {
    provider: "pexels" as const,
    id: "7",
    url: "https://images.pexels.com/photos/7/p.jpeg?w=940&dpr=2",
    photographerName: "Pia",
    photographerUrl: "https://www.pexels.com/@pia",
    pageUrl: "https://www.pexels.com/photo/seven-7/",
    description: "roof",
  }

  it("records the provider, credit fields and whether a credit was stamped", async () => {
    const html = injectPhotoAttribution(`<body><img src="${stock.url.replace(/&/g, "&amp;")}"></body>`, [stock], "print")
    await recordFlyerPhotoSource("f1", html, [{ url: stock.url, provider: "pexels", stock }])
    expect(await getFlyerPhotoSource("f1")).toMatchObject({ provider: "pexels", photoId: "7", pageUrl: stock.pageUrl, credited: true })
  })

  it("records 'none' when the flyer used no photo from the pool", () => {
    expect(photoSourceFor("<body></body>", [{ url: stock.url, provider: "pexels", stock }]).provider).toBe("none")
  })

  it("records a client upload or an AI photo by provider, with no credit fields", () => {
    expect(photoSourceFor('<img src="https://x/api/photos/a.jpg">', [{ url: "https://x/api/photos/a.jpg", provider: "higgsfield" }])).toMatchObject({ provider: "higgsfield", imageUrl: "https://x/api/photos/a.jpg" })
  })
})

describe("Instagram square credit (template mode)", () => {
  const photo = {
    provider: "unsplash" as const,
    id: "u1",
    url: "https://images.unsplash.com/photo-1?crop=entropy&cs=tinysrgb&w=1080",
    photographerName: "Una",
    photographerUrl: "https://unsplash.com/@una",
    downloadLocation: "https://api.unsplash.com/photos/u1/download",
    description: "roof",
  }
  const square = (photoUrl: string | null) =>
    fillTemplate({
      template: selectTemplate("flyer-1", "social-post")!,
      headline: "Spring Roof Check", supporting: "Free inspection.", businessName: "Pearl Roofing",
      phone: "555-0142", address: "Bowling Green, KY", hasLogo: false, hasQr: false, photoUrl,
      colors: { primary: "#12314f", secondary: "#e8edf2", accent: "#e39a2b" },
      fonts: { heading: "Georgia, serif", body: "Georgia, serif" },
    }).html

  it("uses a real square template", () => {
    expect(selectTemplate("flyer-1", "social-post")!.formatIds).toContain("social-post")
  })

  it("credits the stock photo the square shows, with screen links, and pings nobody", async () => {
    const out = creditInstagramSquare(square(photo.url), [photo])
    expect(out).toContain('class="oneflyer-photo-credit"')
    expect(out).toContain('href="https://unsplash.com/@una?utm_source=oneflyer&amp;utm_medium=referral"')
    expect(calls).toHaveLength(0)
  })

  it("adds nothing to a square without the photo", () => {
    const html = square(null)
    expect(creditInstagramSquare(html, [photo])).toBe(html)
  })
})

describe("branded photos (reads descriptions only — reduces the risk, can't eliminate it)", () => {
  it("refuses the production case: a company's own photo of its branded goods", async () => {
    const { brandingReason } = await import("@/lib/unsplash")
    expect(brandingReason(["A boxed package in our warehouse unit at ERoofing HQ.", "brown and white cardboard box"], "E Roofing")).toMatch(/business's own photo/)
    expect(brandingReason(["Truck with company logo parked outside"], "Jo Smith")).toMatch(/logo/)
    expect(brandingReason(["Hand-painted lettering on a shop window"], "Jo Smith")).toMatch(/lettering/)
    expect(brandingReason(["Fresh shingles at the ACME Roofing yard"], "ACME Roofing")).toMatch(/own photographer/)
    expect(brandingReason(["New asphalt shingles on a suburban roof"], "Raze Solar")).toBeNull()
  })

  it("Unsplash: a branded top result is skipped for the next relevant one", async () => {
    unsplash = () =>
      new Response(
        JSON.stringify({
          total: 500,
          results: [
            { id: "b", urls: { regular: "https://images.unsplash.com/b" }, links: { download_location: "x" }, user: { name: "E Roofing", links: { html: "h" } }, description: "Roofing supplies in our warehouse", alt_description: null },
            { id: "c", urls: { regular: "https://images.unsplash.com/c" }, links: { download_location: "x" }, user: { name: "Una", links: { html: "h" } }, description: null, alt_description: "roof replacement in progress" },
          ],
        }),
        { status: 200 },
      )
    expect(await findPhoto({ query: "roof replacement", context: "t" })).toMatchObject({ ok: true, photo: { id: "c" } })
  })

  it("Pexels: a branded photo is refused like a photo with people in it", async () => {
    pexels = () => pexelsPage(500, ["Roof with a contractor's sign on the lawn", "New roof shingles in sunlight"])
    expect(await findPexelsPhoto({ query: "roof", context: "t" })).toMatchObject({ ok: true, photo: { id: "101" } })
  })
})
