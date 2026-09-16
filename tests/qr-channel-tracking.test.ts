import { describe, it, expect } from "vitest"
import { UNLABELED_CHANNEL, type TrackingRecord, type ChannelStats } from "@/lib/types"

/**
 * Per-channel scan attribution.
 *
 * The design point these pin: a flyer's ORIGINAL code keeps channelLabel
 * null, so every flyer printed before channels existed keeps counting and
 * reports under "Direct / unlabeled" with no migration and no backfill.
 */

/** Mirrors the bucketing in buildFlyerBreakdown. */
function bucket(record: Pick<TrackingRecord, "channelLabel">): string {
  return record.channelLabel ?? UNLABELED_CHANNEL
}

/** Mirrors the roll-up in buildFlyerBreakdown. */
function rollUp(channels: ChannelStats[]) {
  return {
    totalScans: channels.reduce((s, c) => s + c.scans, 0),
    totalClicks: channels.reduce((s, c) => s + c.clicks, 0),
  }
}

const base: TrackingRecord = {
  email: "owner@example.test", flyerId: "f1", businessName: "Pearl Roofing",
  headline: null, offer: null, cta: null, disclaimer: null,
  phone: "555-0142", website: null, createdAt: "2026-01-01T00:00:00.000Z",
}

describe("channel attribution", () => {
  it("buckets a labelled code under its channel", () => {
    expect(bucket({ ...base, channelLabel: "Email blast" })).toBe("Email blast")
    expect(bucket({ ...base, channelLabel: "Instagram post" })).toBe("Instagram post")
  })

  it("keeps two labels on one flyer separate", () => {
    const a = bucket({ ...base, channelLabel: "Email blast" })
    const b = bucket({ ...base, channelLabel: "Printed" })
    expect(a).not.toBe(b)
  })
})

describe("the unlabeled bucket", () => {
  it("catches a flyer's original code, which has no label", () => {
    expect(bucket(base)).toBe(UNLABELED_CHANNEL)
  })

  it("catches a PRE-EXISTING record with no channelLabel field at all", () => {
    // Records written before this feature have neither key. They must land in
    // the unlabeled bucket rather than crash or vanish — this is what makes
    // the no-migration claim true.
    const legacy = { ...base } as unknown as Record<string, unknown>
    delete legacy.channelLabel
    delete legacy.parentCode
    expect(bucket(legacy as unknown as TrackingRecord)).toBe(UNLABELED_CHANNEL)
  })

  it("treats an explicitly null label the same as an absent one", () => {
    expect(bucket({ ...base, channelLabel: null })).toBe(UNLABELED_CHANNEL)
  })
})

describe("roll-up to the flyer total", () => {
  const channels: ChannelStats[] = [
    { code: "aaa", label: UNLABELED_CHANNEL, scans: 12, clicks: 3, isChannel: false },
    { code: "bbb", label: "Email blast", scans: 40, clicks: 11, isChannel: true },
    { code: "ccc", label: "Instagram post", scans: 7, clicks: 0, isChannel: true },
  ]

  it("sums every channel INCLUDING the unlabeled one", () => {
    expect(rollUp(channels)).toEqual({ totalScans: 59, totalClicks: 14 })
  })

  it("totals zero for a flyer nobody has scanned", () => {
    expect(rollUp([{ code: "aaa", label: UNLABELED_CHANNEL, scans: 0, clicks: 0, isChannel: false }]))
      .toEqual({ totalScans: 0, totalClicks: 0 })
  })

  it("puts the unlabeled baseline first, then the busiest channel", () => {
    const sorted = [...channels].sort((a, b) => Number(a.isChannel) - Number(b.isChannel) || b.scans - a.scans)
    expect(sorted.map((c) => c.label)).toEqual([UNLABELED_CHANNEL, "Email blast", "Instagram post"])
  })
})

describe("no personal data is stored", () => {
  const PERSONAL = ["ip", "ipAddress", "userAgent", "ua", "geo", "country", "city",
    "latitude", "longitude", "deviceId", "fingerprint", "sessionId", "visitorId", "referrer", "cookie"]

  it("a tracking record has no field identifying who scanned", () => {
    const record: TrackingRecord = { ...base, channelLabel: "Email blast", parentCode: "aaa" }
    for (const field of PERSONAL) expect(record).not.toHaveProperty(field)
  })

  it("the fields it DOES hold are all about the business, not the scanner", () => {
    // email/phone are the CLIENT's own contact details, printed on their own
    // flyer — not anything about a person who scanned it.
    const record: TrackingRecord = { ...base, channelLabel: "Printed", parentCode: "aaa" }
    expect(Object.keys(record).sort()).toEqual([
      "businessName", "channelLabel", "createdAt", "cta", "disclaimer", "email",
      "flyerId", "headline", "offer", "parentCode", "phone", "website",
    ])
  })

  it("a channel row carries only a label and two counters", () => {
    const row: ChannelStats = { code: "bbb", label: "Email blast", scans: 40, clicks: 11, isChannel: true }
    for (const field of PERSONAL) expect(row).not.toHaveProperty(field)
    expect(Object.keys(row).sort()).toEqual(["clicks", "code", "isChannel", "label", "scans"])
  })
})
