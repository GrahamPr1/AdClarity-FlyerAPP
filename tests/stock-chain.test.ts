import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * The stock order: Pixabay -> Unsplash -> Pexels for public accounts;
 * Unsplash only for enterprise and NOP (Pixabay never called for them).
 * A disabled Unsplash (HTTP 401) falls through.
 */

const s = vi.hoisted(() => ({ calls: [] as string[], pixabay: { ok: false } as Record<string, unknown>, unsplash: { ok: false } as Record<string, unknown>, nop: false, nopThrows: false }))
const miss = (reason: string, detail = "") => ({ ok: false, reason, detail })
vi.mock("@upstash/redis", () => ({ Redis: { fromEnv: () => ({ get: async () => null, set: async () => {} }) } }))
vi.mock("@/lib/enterprise/agents-store", () => ({
  isNopAgentAccount: async () => {
    if (s.nopThrows) throw new Error("down")
    return s.nop
  },
}))
vi.mock("@/lib/pixabay", () => ({ findPixabayPhoto: async (o: { query: string }) => (s.calls.push(`pixabay:${o.query}`), s.pixabay) }))
vi.mock("@/lib/pexels", () => ({ findPexelsPhoto: async () => (s.calls.push("pexels"), miss("not_configured", "PEXELS_API_KEY is not set")) }))
vi.mock("@/lib/unsplash", async (orig) => ({
  ...(await orig<typeof import("@/lib/unsplash")>()),
  findPhotoForPromotion: async () => (s.calls.push("unsplash"), s.unsplash),
  findFallbackStockPhoto: async () => (s.calls.push("unsplash-fallback"), s.unsplash),
}))

import { extraStockAllowedFor, findFallbackStock, findStockForPromotion } from "@/lib/stock-photos"

const opts = { industry: "Roofing", purpose: "Roof inspection", services: ["Roof repair"], context: "t" }
const PIX = { ok: true, photo: { provider: "pixabay", id: "2", url: "https://oneflyer.org/api/photos/x.jpg" } }

beforeEach(() => {
  s.calls = []; s.nop = false; s.nopThrows = false
  s.pixabay = miss("no_relevant_match", "none"); s.unsplash = miss("error", "HTTP 401")
  vi.spyOn(console, "log").mockImplementation(() => {})
})

describe("public accounts", () => {
  it("Pixabay first; when it finds one, Unsplash and Pexels aren't asked", async () => {
    s.pixabay = PIX
    expect(await findStockForPromotion(opts, true)).toMatchObject({ ok: true, photo: { provider: "pixabay" } })
    expect(s.calls.every((c) => c.startsWith("pixabay"))).toBe(true)
  })
  it("Pixabay miss -> disabled Unsplash (401) -> Pexels; Pixabay's reason is reported so a broader search still runs", async () => {
    const r = await findStockForPromotion(opts, true)
    expect(s.calls.filter((c) => !c.startsWith("pixabay"))).toEqual(["unsplash", "pexels"])
    expect(r).toMatchObject({ ok: false, reason: "no_relevant_match" })
    expect((r as { detail: string }).detail).toContain("unsplash: error — HTTP 401")
  })
  it("the fallback search follows the same order", async () => {
    s.pixabay = PIX
    expect(await findFallbackStock({ industry: "Roofing", context: "t" }, true)).toMatchObject({ ok: true, photo: { provider: "pixabay" } })
    expect(s.calls.some((c) => c.startsWith("unsplash"))).toBe(false)
  })
})

describe("enterprise and NOP accounts", () => {
  it("never reach Pixabay (or Pexels): Unsplash only, as before", async () => {
    await findStockForPromotion(opts, false)
    await findFallbackStock({ industry: "Roofing", context: "t" }, false)
    expect(s.calls).toEqual(["unsplash", "unsplash-fallback"])
  })
  it("the explicit check: enterprise no, NOP no, lookup failure no, public yes", async () => {
    expect(await extraStockAllowedFor("a@x.test", true)).toBe(false)
    s.nop = true
    expect(await extraStockAllowedFor("a@x.test", false)).toBe(false)
    s.nop = false; s.nopThrows = true
    expect(await extraStockAllowedFor("a@x.test", false)).toBe(false)
    s.nopThrows = false
    expect(await extraStockAllowedFor("a@x.test", false)).toBe(true)
  })
})

describe("the reason reported when everything misses", () => {
  it("is the first provider a broader search could help, so the broad search isn't switched off", async () => {
    s.pixabay = miss("rate_limited", "window used up")
    s.unsplash = miss("thin_results", "only 5")
    expect(await findStockForPromotion(opts, true)).toMatchObject({ ok: false, reason: "thin_results" })
  })
})
