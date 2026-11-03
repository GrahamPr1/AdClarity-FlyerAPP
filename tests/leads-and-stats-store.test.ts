import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import type { LeadRecord, TrackingRecord } from "@/lib/types"

/**
 * The real store code against an in-memory Redis:
 * - monthly scan/click counters run beside the lifetime ones (UTC months),
 *   and scans from before they existed count toward all time only;
 * - a flyer's results report scans, clicks and leads this month and all time;
 * - a lead is listed newest first and deleting it removes the record and both
 *   indexes from Redis;
 * - account deletion takes the monthly counters and offer-page undo key too.
 */

const r = vi.hoisted(() => ({ kv: new Map<string, unknown>(), z: new Map<string, Map<string, number>>(), sets: new Map<string, Set<string>>(), ttl: new Map<string, number>() }))
vi.mock("@upstash/redis", () => {
  const clone = <T,>(v: T): T => (v === undefined ? v : JSON.parse(JSON.stringify(v)))
  const zset = (k: string) => r.z.get(k) ?? r.z.set(k, new Map()).get(k)!
  const glob = (p: string) => new RegExp("^" + p.replace(/\\(.)/g, "$1").replace(/[.+?^${}()|[\]]/g, "\\$&").replace(/\*/g, ".*") + "$")
  const ops = {
    get: async (k: string) => clone(r.kv.get(k)) ?? null,
    set: async (k: string, v: unknown) => void r.kv.set(k, clone(v)),
    mget: async (...ks: string[]) => ks.map((k) => clone(r.kv.get(k)) ?? null),
    del: async (...ks: string[]) => ks.forEach((k) => { r.kv.delete(k); r.z.delete(k) }),
    exists: async (k: string) => (r.kv.has(k) ? 1 : 0),
    incr: async (k: string) => { const n = ((r.kv.get(k) as number) ?? 0) + 1; r.kv.set(k, n); return n },
    expire: async (k: string, s: number) => { r.ttl.set(k, s); return 1 },
    smembers: async (k: string) => [...(r.sets.get(k) ?? [])],
    zadd: async (k: string, { score, member }: { score: number; member: string }) => void zset(k).set(member, score),
    zrem: async (k: string, m: string) => void zset(k).delete(m),
    zcard: async (k: string) => zset(k).size,
    zcount: async (k: string, min: number) => [...zset(k).values()].filter((s) => s >= min).length,
    zrange: async (k: string, _a: number, _b: number, o?: { rev?: boolean }) => {
      const ids = [...zset(k).entries()].sort((a, b) => a[1] - b[1]).map(([m]) => m)
      return o?.rev ? ids.reverse() : ids
    },
    scan: async (_c: string, { match }: { match: string }) => ["0", [...r.kv.keys(), ...r.z.keys()].filter((k) => glob(match).test(k))],
  }
  const batch = () => {
    const queued: (() => Promise<unknown>)[] = []
    const b = new Proxy({} as Record<string, unknown>, {
      get: (_t, name: string) => name === "exec" ? async () => { const out = []; for (const q of queued) out.push(await q()); return out }
        : (...args: unknown[]) => { queued.push(() => (ops as Record<string, (...a: unknown[]) => Promise<unknown>>)[name](...args)); return b },
    })
    return b
  }
  return { Redis: { fromEnv: () => ({ ...ops, pipeline: batch, multi: batch }) } }
})

const OWNER = "owner@example.test"
const record: TrackingRecord = {
  email: OWNER, flyerId: "flyer-1", businessName: "Pearl Roofing", headline: "Spring", offer: null, cta: "Call", disclaimer: null,
  phone: "555-0142", website: null, createdAt: "2026-01-01T00:00:00.000Z", redeemUrl: "https://oneflyer.org/r/ABC2345",
}
const lead = (id: string, createdAt: string, over: Partial<LeadRecord> = {}): LeadRecord =>
  ({ id, flyerId: "flyer-1", code: "ABC2345", name: `Lead ${id}`, phone: "555-0100", email: null, message: null, createdAt, afterOfferEnded: false, ...over })

beforeEach(() => {
  r.kv.clear(); r.z.clear(); r.sets.clear(); r.ttl.clear()
  r.kv.set("tracking:ABC2345:record", { ...record })
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(new Date("2026-11-15T12:00:00Z"))
})
afterEach(() => vi.useRealTimers())

describe("monthly counters", () => {
  it("a scan and a click count toward all time and the current UTC month, which expires after ~13 months", async () => {
    const { incrementTrackingScan, incrementTrackingClick, getTrackingStats, getTrackingMonthStats } = await import("@/lib/store")
    await incrementTrackingScan("ABC2345"); await incrementTrackingScan("ABC2345"); await incrementTrackingClick("ABC2345")
    expect(await getTrackingStats("ABC2345")).toEqual({ scans: 2, clicks: 1 })
    expect(await getTrackingMonthStats("ABC2345", "2026-11")).toEqual({ scans: 2, clicks: 1 })
    expect(r.ttl.get("tracking:ABC2345:scans:2026-11")).toBe(400 * 24 * 60 * 60)
    expect(r.ttl.has("tracking:ABC2345:scans")).toBe(false)
  })

  it("scans from before monthly counters existed count toward all time only", async () => {
    r.kv.set("tracking:ABC2345:scans", 40) // pre-launch history: a lifetime total, no months
    const { incrementTrackingScan } = await import("@/lib/store")
    const { buildFlyerBreakdown } = await import("@/lib/tracking-breakdown")
    await incrementTrackingScan("ABC2345")
    const b = await buildFlyerBreakdown("flyer-1", "ABC2345", OWNER)
    expect(b).toMatchObject({ month: "2026-11", totalScans: 41, scansThisMonth: 1 })
  })

  it("the month rolls over in UTC", async () => {
    const { incrementTrackingScan, getTrackingMonthStats } = await import("@/lib/store")
    vi.setSystemTime(new Date("2026-11-30T23:59:00Z")); await incrementTrackingScan("ABC2345")
    vi.setSystemTime(new Date("2026-12-01T00:01:00Z")); await incrementTrackingScan("ABC2345")
    expect((await getTrackingMonthStats("ABC2345", "2026-11")).scans).toBe(1)
    expect((await getTrackingMonthStats("ABC2345", "2026-12")).scans).toBe(1)
  })
})

describe("a flyer's results", () => {
  it("reports leads this month and all time", async () => {
    const { saveLead } = await import("@/lib/store")
    const { buildFlyerBreakdown } = await import("@/lib/tracking-breakdown")
    await saveLead(OWNER, lead("old", "2026-10-20T10:00:00Z"))
    await saveLead(OWNER, lead("new1", "2026-11-02T10:00:00Z"))
    await saveLead(OWNER, lead("new2", "2026-11-10T10:00:00Z"))
    expect(await buildFlyerBreakdown("flyer-1", "ABC2345", OWNER)).toMatchObject({ totalLeads: 3, leadsThisMonth: 2 })
  })
})

describe("leads list and delete", () => {
  it("lists a flyer's leads newest first, only the owner's", async () => {
    const { saveLead, listLeadsForFlyer } = await import("@/lib/store")
    await saveLead(OWNER, lead("a", "2026-11-01T10:00:00Z"))
    await saveLead(OWNER, lead("b", "2026-11-03T10:00:00Z", { afterOfferEnded: true }))
    expect((await listLeadsForFlyer(OWNER, "flyer-1")).map((l) => l.id)).toEqual(["b", "a"])
    expect((await listLeadsForFlyer(OWNER, "flyer-1"))[0].afterOfferEnded).toBe(true)
    expect(await listLeadsForFlyer("someone-else@example.test", "flyer-1")).toEqual([])
  })

  it("deleting removes the record and both index entries from Redis", async () => {
    const { saveLead, deleteLead, listLeadsForFlyer, listLeadsForClient } = await import("@/lib/store")
    await saveLead(OWNER, lead("a", "2026-11-01T10:00:00Z"))
    await saveLead(OWNER, lead("b", "2026-11-03T10:00:00Z"))
    expect(await deleteLead(OWNER, "a")).toBe(true)
    expect(r.kv.has(`client:${OWNER}:lead:a`)).toBe(false)
    expect(r.z.get("flyer:flyer-1:leads")?.has("a")).toBe(false)
    expect(r.z.get(`client:${OWNER}:leads`)?.has("a")).toBe(false)
    expect((await listLeadsForFlyer(OWNER, "flyer-1")).map((l) => l.id)).toEqual(["b"])
    expect((await listLeadsForClient(OWNER)).map((l) => l.id)).toEqual(["b"])
  })

  it("another account can't delete it", async () => {
    const { saveLead, deleteLead } = await import("@/lib/store")
    await saveLead(OWNER, lead("a", "2026-11-01T10:00:00Z"))
    expect(await deleteLead("someone-else@example.test", "a")).toBe(false)
    expect(r.kv.has(`client:${OWNER}:lead:a`)).toBe(true)
  })
})

describe("account deletion", () => {
  it("covers the monthly counters and the offer-page undo key", async () => {
    r.kv.set("tracking:ABC2345:scans:2026-10", 3)
    r.kv.set("tracking:ABC2345:clicks:2026-11", 1)
    r.kv.set("flyer:flyer-1:offer-page-previous", {})
    const { collectAccountKeys } = await import("@/lib/store")
    const { keys } = await collectAccountKeys(OWNER)
    for (const k of ["tracking:ABC2345:scans:2026-10", "tracking:ABC2345:clicks:2026-11", "flyer:flyer-1:offer-page-previous"]) expect(keys).toContain(k)
  })
})
