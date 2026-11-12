import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * The offer-refresh banner (Phase 4, hook 3): which flyers it lists, for whom.
 * Ended offers and offer pages unchanged for 60 days; Basic and up only, never
 * enterprise or NOP; Pro also gets the new-promotion action.
 */

const s = vi.hoisted(() => ({
  kv: new Map<string, unknown>(),
  plan: "basic" as string,
  pausedAt: null as string | null,
  orgId: null as string | null,
  nop: false,
  flyers: [] as { id: string; title: string; status: string; trackingCode?: string }[],
  records: new Map<string, Record<string, unknown>>(),
}))
vi.mock("@upstash/redis", () => ({
  Redis: { fromEnv: () => ({ get: async (k: string) => s.kv.get(k) ?? null, set: async (k: string, v: unknown) => void s.kv.set(k, v) }) },
}))
vi.mock("@/lib/store", () => ({
  getAgentProfile: async () => (s.orgId ? { orgId: s.orgId } : null),
  getOrCreateClient: async (email: string) => ({ email, plan: s.plan, pausedAt: s.pausedAt }),
  getDeliverablesForEmail: async (email: string) => ({ email, flyers: s.flyers }),
  getTrackingRecord: async (code: string) => s.records.get(code) ?? null,
}))
vi.mock("@/lib/enterprise/agents-store", () => ({ isNopAgentAccount: async () => s.nop }))

import { getOfferRefresh, markOfferPageTouched } from "@/lib/offer-refresh"

const NOW = new Date("2026-11-12T15:00:00Z")
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86400000).toISOString()
function flyer(id: string, record: Record<string, unknown>, status = "Ready") {
  s.flyers.push({ id, title: `Flyer ${id}`, status, trackingCode: `c-${id}` })
  s.records.set(`c-${id}`, { createdAt: daysAgo(1), expiresAt: null, ...record })
}

beforeEach(() => {
  s.kv.clear(); s.records.clear(); s.flyers = []
  s.plan = "basic"; s.pausedAt = null; s.orgId = null; s.nop = false
})

describe("which offers are listed", () => {
  it("an offer past its end date", async () => {
    flyer("a", { expiresAt: "2026-11-01" })
    expect((await getOfferRefresh("o@x.test", NOW)).items).toEqual([{ flyerId: "a", title: "Flyer a", reason: "expired", endedOn: "2026-11-01" }])
  })
  it("an offer page untouched for 60 days; not at 59", async () => {
    flyer("old", { createdAt: daysAgo(60) })
    flyer("young", { createdAt: daysAgo(59) })
    const r = await getOfferRefresh("o@x.test", NOW)
    expect(r.items).toEqual([{ flyerId: "old", title: "Flyer old", reason: "stale", since: daysAgo(60), days: 60 }])
  })
  it("a recent save, reset or undo on the offer page counts as a refresh", async () => {
    flyer("a", { createdAt: daysAgo(200) })
    await markOfferPageTouched("a", new Date(daysAgo(5)))
    expect((await getOfferRefresh("o@x.test", NOW)).items).toEqual([])
  })
  it("a page edited before edits were dated is never called stale", async () => {
    flyer("a", { createdAt: daysAgo(200), offerPageEdited: true })
    expect((await getOfferRefresh("o@x.test", NOW)).items).toEqual([])
  })
  it("flyers that aren't Ready, or have no offer page, are skipped", async () => {
    flyer("a", { expiresAt: "2026-11-01" }, "In Progress")
    s.flyers.push({ id: "b", title: "No QR", status: "Ready" })
    expect((await getOfferRefresh("o@x.test", NOW)).items).toEqual([])
  })
  it("at most three: ended offers first, then the longest unchanged", async () => {
    flyer("s1", { createdAt: daysAgo(70) })
    flyer("s2", { createdAt: daysAgo(90) })
    flyer("e1", { expiresAt: "2026-10-01" })
    flyer("e2", { expiresAt: "2026-11-01" })
    expect((await getOfferRefresh("o@x.test", NOW)).items.map((i) => i.flyerId)).toEqual(["e2", "e1", "s2"])
  })
})

describe("who sees it", () => {
  beforeEach(() => flyer("a", { expiresAt: "2026-11-01" }))
  it("Basic: listed, no new promotion", async () => {
    expect(await getOfferRefresh("o@x.test", NOW)).toMatchObject({ canNewPromotion: false, items: [{ flyerId: "a" }] })
  })
  it("Pro: listed, with new promotion", async () => {
    s.plan = "pro"
    expect(await getOfferRefresh("o@x.test", NOW)).toMatchObject({ canNewPromotion: true, items: [{ flyerId: "a" }] })
  })
  for (const [name, set] of [
    ["trial", () => void (s.plan = "trial")],
    ["paused", () => void (s.pausedAt = "2026-11-01T00:00:00Z")],
    ["enterprise org", () => void ((s.plan = "pro"), (s.orgId = "org-1"))],
    ["NOP agent", () => void ((s.plan = "pro"), (s.nop = true))],
  ] as const) {
    it(`${name}: nothing`, async () => {
      set()
      expect(await getOfferRefresh("o@x.test", NOW)).toEqual({ items: [], canNewPromotion: false })
    })
  }
})
