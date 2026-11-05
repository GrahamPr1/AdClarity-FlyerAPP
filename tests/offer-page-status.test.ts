import { describe, it, expect, vi, beforeEach } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import type { AgentProfile, ClientRecord, TrackingRecord } from "@/lib/types"

/**
 * The HTTP outcome of /r/<code>. Only a code with no record is a 404, shown as
 * the friendly "This link isn't valid" page and kept out of search. Every code
 * that exists renders normally (200) whatever the owner's plan state is. A
 * failed lookup isn't a 404 either: that would call a printed code invalid.
 *
 * Next turns notFound() into the status, so this pins what the page throws.
 */

const db = vi.hoisted(() => ({ record: null as unknown, recordThrows: false, owner: null as unknown, agent: null as unknown, scans: 0 }))
vi.mock("@/lib/store", () => ({
  getTrackingRecord: async () => {
    if (db.recordThrows) throw new Error("redis unavailable")
    return db.record
  },
  getClient: async () => db.owner,
  getAgentProfile: async () => db.agent,
  incrementTrackingScan: async () => ++db.scans,
}))

const NOT_FOUND = "NEXT_HTTP_ERROR_FALLBACK;404"
const record: TrackingRecord = {
  email: "owner@example.test", flyerId: "flyer-1", businessName: "Pearl Roofing",
  headline: "Spring roof check", offer: "$49 inspection", cta: "Call now", disclaimer: null,
  phone: "555-0142", website: null, createdAt: "2026-01-01T00:00:00.000Z",
}
const client = (over: Partial<ClientRecord>) => ({ email: "owner@example.test", plan: "basic", pausedAt: null, ...over }) as ClientRecord
const render = async () => {
  const { default: RedeemPage } = await import("@/app/r/[code]/page")
  return renderToStaticMarkup(await RedeemPage({ params: Promise.resolve({ code: "ABC2345" }) }))
}

beforeEach(() => {
  db.record = { ...record }; db.recordThrows = false; db.owner = client({}); db.agent = null; db.scans = 0
})

describe("an unknown code", () => {
  it("is a 404, and no scan is counted", async () => {
    db.record = null
    await expect(render()).rejects.toMatchObject({ digest: NOT_FOUND })
    expect(db.scans).toBe(0)
  })

  it("keeps the same friendly page, and noindex", async () => {
    const { default: UnknownOfferCode, metadata } = await import("@/app/r/[code]/not-found")
    expect(renderToStaticMarkup(UnknownOfferCode())).toContain("This link isn&#x27;t valid.")
    expect(metadata).toEqual({ title: { absolute: "Offer not found" }, robots: { index: false, follow: false } })
  })
})

describe("every code that exists renders (200)", () => {
  it.each([
    ["valid, on Basic", {}, client({}), null],
    ["valid, on Pro", {}, client({ plan: "pro" }), null],
    ["an ended offer", { expiresAt: "2020-01-31" }, client({}), null],
    ["paused", {}, client({ pausedAt: "2026-11-01T00:00:00.000Z" }), null],
    ["Trial", {}, client({ plan: "trial" }), null],
    ["cancelled (a cancelled subscription lands on Trial)", {}, client({ plan: "trial" }), null],
    ["enterprise on Pro", {}, client({ plan: "pro" }), { orgId: "northstar-mutual" } as AgentProfile],
    ["owner record gone", {}, null, null],
    ["a channel code", { channelLabel: "Email blast", parentCode: "ORIG234" }, client({}), null],
  ])("%s", async (_label, over, owner, agent) => {
    db.record = { ...record, ...over }
    db.owner = owner
    db.agent = agent
    const html = await render()
    expect(html).toContain("Pearl Roofing")
    expect(html).not.toContain("isn&#x27;t valid")
    expect(db.scans).toBe(1)
  })
})

describe("a failed lookup", () => {
  it("is an error to retry, never a 404 that calls a printed code invalid", async () => {
    db.recordThrows = true
    await expect(render()).rejects.toThrow("redis unavailable")
    await expect(render()).rejects.not.toMatchObject({ digest: NOT_FOUND })
  })
})
