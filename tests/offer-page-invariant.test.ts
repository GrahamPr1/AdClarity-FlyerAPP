import { describe, it, expect, vi, beforeEach } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import type { ClientRecord, TrackingRecord } from "@/lib/types"

/**
 * HARD INVARIANT: a printed QR code never stops working because of plan
 * state. Whatever happens to the owner's account (downgrade, pause, a
 * cancelled subscription, which lands on Trial, or a failed lookup), /r/<code>
 * renders the offer and counts the scan. Plan state decides only whether the
 * lead form appears.
 */

const db = vi.hoisted(() => ({
  tracking: new Map<string, unknown>(),
  owner: null as unknown,
  ownerThrows: false,
  scans: new Map<string, number>(),
}))

vi.mock("@/lib/store", () => ({
  getTrackingRecord: async (code: string) => db.tracking.get(code) ?? null,
  getClient: async () => {
    if (db.ownerThrows) throw new Error("redis unavailable")
    return db.owner
  },
  getAgentProfile: async () => null,
  incrementTrackingScan: async (code: string) => {
    const n = (db.scans.get(code) ?? 0) + 1
    db.scans.set(code, n)
    return n
  },
}))

const OWNER = "owner@example.test"
const record: TrackingRecord = {
  email: OWNER, flyerId: "flyer-1", businessName: "Pearl Roofing",
  headline: "Spring roof check", offer: "$49 inspection", cta: "Book my inspection", disclaimer: "Ends May 31.",
  phone: "555-0142", website: null, createdAt: "2026-01-01T00:00:00.000Z", redeemUrl: "https://oneflyer.org/r/ABC2345",
}
const client = (over: Partial<ClientRecord>) => ({ email: OWNER, plan: "basic", pausedAt: null, ...over }) as ClientRecord
const PAUSED = "2026-11-01T00:00:00.000Z"

async function render(code = "ABC2345") {
  const { default: RedeemPage } = await import("@/app/r/[code]/page")
  return renderToStaticMarkup(await RedeemPage({ params: Promise.resolve({ code }) }))
}

function expectOffer(html: string) {
  expect(html).toContain("Pearl Roofing")
  expect(html).toContain("Spring roof check")
  expect(html).toContain("$49 inspection")
  expect(html).toContain("Book my inspection")
  expect(html).toContain('href="tel:5550142"')
  expect(html).not.toContain("isn&#x27;t valid")
}
const hasForm = (html: string) => html.includes("By submitting, you agree Pearl Roofing may contact you about this offer.")

beforeEach(() => {
  db.tracking.clear(); db.scans.clear(); db.ownerThrows = false
  db.tracking.set("ABC2345", record)
})

describe("every plan state still resolves the QR to the offer", () => {
  it.each([
    ["Basic, active", client({ plan: "basic" }), true],
    ["Pro, active", client({ plan: "pro" }), true],
    ["downgraded to Trial (a cancelled subscription lands here)", client({ plan: "trial" }), false],
    ["Basic, paused", client({ plan: "basic", pausedAt: PAUSED }), false],
    ["Pro, paused", client({ plan: "pro", pausedAt: PAUSED }), false],
    ["Trial, paused", client({ plan: "trial", pausedAt: PAUSED }), false],
    ["owner record gone", null, false],
  ])("%s: offer shown, scan counted, form %s", async (_label, owner, form) => {
    db.owner = owner
    const html = await render()
    expectOffer(html)
    expect(hasForm(html)).toBe(form)
    expect(db.scans.get("ABC2345")).toBe(1)
  })

  it("the owner lookup throwing: offer shown without the form, no error", async () => {
    db.ownerThrows = true
    const errors = vi.spyOn(console, "error").mockImplementation(() => {})
    const html = await render()
    expectOffer(html)
    expect(hasForm(html)).toBe(false)
    errors.mockRestore()
  })

  it("upgrading switches the form on for an existing code, with no change to the code", async () => {
    db.owner = client({ plan: "trial" })
    expect(hasForm(await render())).toBe(false)
    db.owner = client({ plan: "basic" })
    expect(hasForm(await render())).toBe(true)
    expect(db.tracking.get("ABC2345")).toEqual(record)
  })
})

describe("a channel code that already exists", () => {
  it.each([
    ["downgraded to Trial", client({ plan: "trial" })],
    ["paused", client({ plan: "basic", pausedAt: PAUSED })],
    ["still on Pro", client({ plan: "pro" })],
  ])("%s: still shows the offer and counts the scan", async (_label, owner) => {
    db.tracking.set("CHN2345", { ...record, channelLabel: "Email blast", parentCode: "ABC2345", redeemUrl: "https://oneflyer.org/r/CHN2345" })
    db.owner = owner
    expectOffer(await render("CHN2345"))
    expect(db.scans.get("CHN2345")).toBe(1)
  })
})

describe("records written before this change", () => {
  it("render and count normally without redeemUrl, channelLabel or parentCode", async () => {
    const legacy = { ...record } as Partial<TrackingRecord>
    delete legacy.redeemUrl
    db.tracking.set("OLD2345", legacy)
    db.owner = client({ plan: "pro" })
    const html = await render("OLD2345")
    expectOffer(html)
    expect(hasForm(html)).toBe(true)
    expect(db.scans.get("OLD2345")).toBe(1)
  })
})
