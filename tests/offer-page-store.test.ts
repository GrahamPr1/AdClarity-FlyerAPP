import { describe, it, expect, vi, beforeEach } from "vitest"
import QRCode from "qrcode"
import type { TrackingRecord } from "@/lib/types"

/**
 * The real store functions against an in-memory Redis: an owner edit reaches
 * every code of the flyer (original and channel codes), the QR target stays
 * byte-identical, flyer edits stop overwriting the page, and undo/reset work
 * across all codes.
 */

const kv = vi.hoisted(() => ({ data: new Map<string, unknown>(), sets: new Map<string, Set<string>>() }))
vi.mock("@upstash/redis", () => {
  const clone = <T,>(v: T): T => (v === undefined ? v : JSON.parse(JSON.stringify(v)))
  const fake = {
    get: async (k: string) => clone(kv.data.get(k)) ?? null,
    set: async (k: string, v: unknown) => void kv.data.set(k, clone(v)),
    exists: async (k: string) => (kv.data.has(k) ? 1 : 0),
    del: async (...ks: string[]) => ks.forEach((k) => kv.data.delete(k)),
    smembers: async (k: string) => [...(kv.sets.get(k) ?? [])],
    sadd: async (k: string, m: string) => void (kv.sets.get(k) ?? kv.sets.set(k, new Set()).get(k)!).add(m),
  }
  return { Redis: { fromEnv: () => fake } }
})

const ORIGINAL = "ABC2345"
const CHANNEL = "CHN6789"
const record: TrackingRecord = {
  email: "owner@example.test", flyerId: "flyer-1", businessName: "Pearl Roofing",
  headline: "Spring roof check", offer: "Free gutter clean", cta: "Call now", disclaimer: null,
  phone: "555-0142", website: null, createdAt: "2026-01-01T00:00:00.000Z", redeemUrl: `https://oneflyer.org/r/${ORIGINAL}`,
}
const edit = { headline: "Fall roof check", offer: "Gutters free", price: "$49", expiresAt: "2026-11-30", cta: "Book now", phone: "555-0199" }
const rec = (code: string) => kv.data.get(`tracking:${code}:record`) as TrackingRecord

beforeEach(() => {
  kv.data.clear(); kv.sets.clear()
  kv.data.set(`tracking:${ORIGINAL}:record`, { ...record })
  kv.data.set(`tracking:${CHANNEL}:record`, { ...record, redeemUrl: `https://oneflyer.org/r/${CHANNEL}`, channelLabel: "Email blast", parentCode: ORIGINAL })
  kv.sets.set("flyer:flyer-1:channel-codes", new Set([CHANNEL]))
})

describe("saving an offer-page edit", () => {
  it("updates every code of the flyer", async () => {
    const { saveOfferPageEdit } = await import("@/lib/store")
    expect(await saveOfferPageEdit("flyer-1", ORIGINAL, edit)).toBe(true)
    for (const code of [ORIGINAL, CHANNEL]) expect(rec(code)).toMatchObject({ ...edit, offerPageEdited: true })
  })

  it("leaves each QR target byte-identical: same redeemUrl, same QR image", async () => {
    const { saveOfferPageEdit } = await import("@/lib/store")
    const { qrDataUrlForCode } = await import("@/lib/agent-pipeline/qrTracking")
    const before = { o: await qrDataUrlForCode(ORIGINAL), c: await qrDataUrlForCode(CHANNEL) }
    await saveOfferPageEdit("flyer-1", ORIGINAL, edit)
    expect(rec(ORIGINAL).redeemUrl).toBe(`https://oneflyer.org/r/${ORIGINAL}`)
    expect(rec(CHANNEL).redeemUrl).toBe(`https://oneflyer.org/r/${CHANNEL}`)
    expect(await qrDataUrlForCode(ORIGINAL)).toBe(before.o)
    expect(await qrDataUrlForCode(CHANNEL)).toBe(before.c)
    expect(before.o).toBe(await QRCode.toDataURL(`https://oneflyer.org/r/${ORIGINAL}`, { margin: 1, width: 512 }))
  })

  it("stops flyer edits overwriting the page, on every code", async () => {
    const { saveOfferPageEdit, updateTrackingContentForFlyer } = await import("@/lib/store")
    await saveOfferPageEdit("flyer-1", ORIGINAL, edit)
    await updateTrackingContentForFlyer("flyer-1", ORIGINAL, { headline: "Flyer says winter" })
    for (const code of [ORIGINAL, CHANNEL]) {
      expect(rec(code).headline).toBe("Fall roof check")
      expect(rec(code).flyerCopy?.headline).toBe("Flyer says winter")
    }
  })

  it("refuses a flyer id that doesn't own the code", async () => {
    const { saveOfferPageEdit } = await import("@/lib/store")
    expect(await saveOfferPageEdit("someone-elses-flyer", ORIGINAL, edit)).toBe(false)
    expect(rec(ORIGINAL).headline).toBe("Spring roof check")
  })
})

describe("undo and reset across codes", () => {
  it("undo after the first edit puts every code back, and is then used up", async () => {
    const { saveOfferPageEdit, undoOfferPageEdit, hasOfferPageUndo } = await import("@/lib/store")
    await saveOfferPageEdit("flyer-1", ORIGINAL, edit)
    expect(await hasOfferPageUndo("flyer-1")).toBe(true)
    expect(await undoOfferPageEdit("flyer-1", ORIGINAL)).toBe(true)
    for (const code of [ORIGINAL, CHANNEL]) {
      expect(rec(code).headline).toBe("Spring roof check")
      expect(rec(code).offerPageEdited).toBeUndefined()
    }
    expect(await hasOfferPageUndo("flyer-1")).toBe(false)
    expect(await undoOfferPageEdit("flyer-1", ORIGINAL)).toBe(false)
  })

  it("reset matches the flyer on every code, and can itself be undone", async () => {
    const { saveOfferPageEdit, resetOfferPageToFlyer, undoOfferPageEdit, updateTrackingContentForFlyer } = await import("@/lib/store")
    await saveOfferPageEdit("flyer-1", ORIGINAL, edit)
    await updateTrackingContentForFlyer("flyer-1", ORIGINAL, { headline: "Flyer says winter" })
    await resetOfferPageToFlyer("flyer-1", ORIGINAL)
    for (const code of [ORIGINAL, CHANNEL]) {
      expect(rec(code).headline).toBe("Flyer says winter")
      expect(rec(code).price).toBeUndefined()
      expect(rec(code).offerPageEdited).toBeUndefined()
    }
    await undoOfferPageEdit("flyer-1", ORIGINAL)
    expect(rec(ORIGINAL)).toMatchObject({ ...edit, offerPageEdited: true })
  })
})
