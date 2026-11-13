import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

/**
 * Pixabay, the primary stock source: refuses people, lettering, logos and
 * brands by tag; copies the photo it picks into our Blob store and never
 * returns a pixabay.com URL; caches searches 24h; respects its rate limit;
 * is credited "Photo by <user> on Pixabay"; is recorded as provider=pixabay;
 * and is never reported to Unsplash's download trigger.
 */

const s = vi.hoisted(() => ({ kv: new Map<string, { v: unknown; ex?: number }>() }))
vi.mock("@upstash/redis", () => ({
  Redis: {
    fromEnv: () => ({
      get: async (k: string) => s.kv.get(k)?.v ?? null,
      set: async (k: string, v: unknown, o?: { ex?: number }) => void s.kv.set(k, { v, ex: o?.ex }),
    }),
  },
}))

import { findPixabayPhoto, profileUrl, refusalReason } from "@/lib/pixabay"
import { injectPhotoAttribution } from "@/lib/agent-pipeline/flyer-html"
import { photoSourceFor } from "@/lib/stock-photos"
import { applyPhotoObligations } from "@/lib/agent-pipeline/pipeline"
import { fillTemplate, TEMPLATES } from "@/lib/agent-pipeline/template-mode"
import type { UnsplashPhoto } from "@/lib/unsplash"

const OWN = "https://oneflyer.org/api/photos/onboarding-photos/rehosted/stock-photo/abc.jpg"
const hit = (id: number, tags: string, user = "roofpics") => ({
  id, tags, user, user_id: 4242,
  pageURL: `https://pixabay.com/photos/roof-${id}/`,
  largeImageURL: `https://pixabay.com/get/g${id}_1280.jpg`,
  webformatURL: "unused",
})
const body = (hits: ReturnType<typeof hit>[], totalHits = 500) => JSON.stringify({ total: totalHits, totalHits, hits })

let fetchMock: ReturnType<typeof vi.fn>
const respond = (text: string, status = 200, headers: Record<string, string> = {}) => fetchMock.mockResolvedValueOnce(new Response(text, { status, headers }))

beforeEach(() => {
  s.kv.clear()
  vi.stubEnv("PIXABAY_API_KEY", "pb-test")
  fetchMock = vi.fn()
  vi.stubGlobal("fetch", fetchMock)
  vi.spyOn(console, "log").mockImplementation(() => {})
  vi.spyOn(console, "warn").mockImplementation(() => {})
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe("refusals by tag", () => {
  it.each([
    ["roof, man, worker", "people"],
    ["woman, kitchen, cooking", "people"],
    ["logo, company, roof", "lettering"],
    ["sign, shop, street", "lettering"],
    ["text, font, typography", "lettering"],
    ["neon sign, bar, night", "lettering"],
    ["brand, sneakers, shoes", "lettering"],
    ["", "no tags"],
  ])("%s -> refused (%s)", (tags) => {
    expect(refusalReason(tags, "someone")).not.toBeNull()
  })
  it("refuses brands and trademarks", () => {
    expect(refusalReason("trademark, bottle", "x")).toMatch(/branding|lettering/)
  })
  it.each(["roof, house, shingles, architecture", "pasta, dinner, plate, food", "house, real estate, home, garden"])("%s -> allowed", (tags) => {
    expect(refusalReason(tags, "someone")).toBeNull()
  })
})

describe("findPixabayPhoto", () => {
  const rehost = vi.fn(async () => OWN)
  beforeEach(() => rehost.mockClear())

  it("skips refused candidates, copies the pick into Blob, never returns a pixabay.com URL", async () => {
    respond(body([hit(1, "roof, man, worker"), hit(2, "roof, house, shingles")]))
    const r = await findPixabayPhoto({ query: "roof repair", context: "t" }, rehost)
    expect(r.ok && r.photo).toMatchObject({
      provider: "pixabay", id: "2", url: OWN, photographerName: "roofpics",
      photographerUrl: profileUrl("roofpics", 4242), pageUrl: "https://pixabay.com/photos/roof-2/",
    })
    expect(rehost).toHaveBeenCalledWith("https://pixabay.com/get/g2_1280.jpg")
    expect(JSON.stringify(r)).not.toMatch(/pixabay\.com\/get\//)
    const url = new URL(fetchMock.mock.calls[0][0] as string)
    expect(Object.fromEntries(url.searchParams)).toMatchObject({ key: "pb-test", q: "roof repair", image_type: "photo", safesearch: "true" })
  })

  it("if the Blob copy fails, the photo is not used (no hotlink fallback)", async () => {
    respond(body([hit(2, "roof, house")]))
    const r = await findPixabayPhoto({ query: "roof", context: "t" }, async () => null)
    expect(r).toMatchObject({ ok: false, reason: "error" })
  })

  it("caches the search for 24 hours; a second search spends no request", async () => {
    respond(body([hit(2, "roof, house")]))
    await findPixabayPhoto({ query: "roof", context: "t" }, rehost)
    const cached = [...s.kv.entries()].find(([k]) => k.startsWith("photo-search:v1:pixabay:"))
    expect(cached?.[1].ex).toBe(86400)
    await findPixabayPhoto({ query: "roof", context: "t" }, rehost)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("rate limit: 429 marks Pixabay exhausted, and the next search is skipped without a request", async () => {
    respond("", 429)
    expect(await findPixabayPhoto({ query: "roof", context: "t" }, rehost)).toMatchObject({ ok: false, reason: "rate_limited" })
    expect(await findPixabayPhoto({ query: "kitchen", context: "t" }, rehost)).toMatchObject({ ok: false, reason: "rate_limited" })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("low X-RateLimit-Remaining marks exhausted for X-RateLimit-Reset SECONDS (relative)", async () => {
    respond(body([hit(2, "roof, house")]), 200, { "x-ratelimit-remaining": "1", "x-ratelimit-reset": "42" })
    await findPixabayPhoto({ query: "roof", context: "t" }, rehost)
    expect(s.kv.get("photo-provider:v1:pixabay:exhausted")?.ex).toBe(42)
  })

  it("no key: not configured, no request", async () => {
    vi.stubEnv("PIXABAY_API_KEY", "")
    expect(await findPixabayPhoto({ query: "roof", context: "t" }, rehost)).toMatchObject({ ok: false, reason: "not_configured" })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("a thin library or no on-topic match is reported, so a broader query can be tried", async () => {
    respond(body([hit(2, "roof")], 5))
    expect(await findPixabayPhoto({ query: "roof", context: "t" }, rehost)).toMatchObject({ ok: false, reason: "thin_results" })
    respond(body([hit(3, "beach, sand, sea")]))
    expect(await findPixabayPhoto({ query: "gutter cleaning", context: "t" }, rehost)).toMatchObject({ ok: false, reason: "no_relevant_match" })
  })
})

const PIX = {
  provider: "pixabay" as const, id: "2", url: OWN, photographerName: "roofpics",
  photographerUrl: "https://pixabay.com/users/roofpics-4242/", pageUrl: "https://pixabay.com/photos/roof-2/", description: "roof, house",
}
const flyer = (photoUrl: string) =>
  fillTemplate({
    template: TEMPLATES[0], headline: "Roof inspection", supporting: "Free this month.", businessName: "Pearl Roofing",
    phone: "270-555-0100", address: null, hasLogo: false, hasQr: false, photoUrl,
    colors: { primary: "#12314f", secondary: "#e8edf2", accent: "#e39a2b" }, fonts: { heading: "Georgia, serif", body: "Georgia, serif" },
  }).html

describe("credit, source record and Unsplash's download trigger", () => {
  it("credits 'Photo by <user> on Pixabay': linked on screen, plain in print", () => {
    const screen = injectPhotoAttribution("<html><body></body></html>", [PIX], "screen")
    expect(screen).toContain('href="https://pixabay.com/photos/roof-2/"')
    expect(screen).toMatch(/Photo by <a [^>]*>roofpics<\/a> on <a [^>]*>Pixabay<\/a>/)
    expect(injectPhotoAttribution("<html><body></body></html>", [PIX], "print")).toContain("Photo by roofpics on Pixabay")
  })

  it("a finished flyer gets the credit, keeps only our own image URL, and Unsplash isn't pinged", async () => {
    const out = await applyPhotoObligations(flyer(OWN), [PIX], "flyer", "t")
    expect(out).toContain("Photo by roofpics on Pixabay")
    expect(out).not.toMatch(/pixabay\.com\/get\//)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("with an Unsplash photo used too, only the Unsplash one is reported to Unsplash", async () => {
    vi.stubEnv("UNSPLASH_ACCESS_KEY", "u-test")
    fetchMock.mockResolvedValue(new Response("{}", { status: 200 }))
    const u: UnsplashPhoto = {
      provider: "unsplash", id: "u1", url: "https://images.unsplash.com/photo-u1?w=1080", photographerName: "U",
      photographerUrl: "https://unsplash.com/@u", downloadLocation: "https://api.unsplash.com/photos/u1/download", description: null,
    }
    await applyPhotoObligations(`${flyer(OWN)}<img src="${u.url}">`, [PIX, u], "flyer", "t")
    expect(fetchMock.mock.calls.map((c) => c[0])).toEqual([u.downloadLocation])
  })

  it("records provider=pixabay with the photo's page", () => {
    expect(photoSourceFor(flyer(OWN), [{ url: OWN, provider: "pixabay", stock: PIX }])).toMatchObject({
      provider: "pixabay", photoId: "2", imageUrl: OWN, photographerName: "roofpics", pageUrl: PIX.pageUrl,
    })
  })
})
