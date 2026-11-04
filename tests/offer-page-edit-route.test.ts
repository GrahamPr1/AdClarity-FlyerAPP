import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextRequest } from "next/server"
import type { ClientRecord, TrackingRecord } from "@/lib/types"

/**
 * /api/offer-page/<flyerId>: saving and undo need an active paid plan, checked
 * on the server against the live client record — a direct request from a
 * Trial or paused account fails. Reset is allowed on any plan. Another
 * account's flyer is not found.
 */

const s = vi.hoisted(() => ({
  sub: "owner@example.test" as string | null,
  client: null as unknown,
  saved: [] as unknown[],
  undone: 0,
  reset: 0,
}))
vi.mock("@/lib/auth", () => ({ ADMIN_SUB: "__admin__", getSessionIdentity: async () => (s.sub ? { sub: s.sub } : null) }))
vi.mock("@/lib/store", () => {
  const record = { email: "owner@example.test", flyerId: "flyer-1", businessName: "Pearl Roofing", headline: "Spring", offer: null, cta: "Call now", disclaimer: null, phone: "555-0142", website: null, createdAt: "2026-01-01T00:00:00.000Z", redeemUrl: "https://oneflyer.org/r/ABC2345" } satisfies TrackingRecord
  return {
    getDeliverablesForEmail: async (email: string) => ({ flyers: email === "owner@example.test" ? [{ id: "flyer-1", trackingCode: "ABC2345" }] : [] }),
    getTrackingRecord: async (code: string) => (code === "ABC2345" ? record : null),
    getClient: async () => s.client,
    getAgentProfile: async () => null,
    hasOfferPageUndo: async () => true,
    saveOfferPageEdit: async (...args: unknown[]) => (s.saved.push(args), true),
    undoOfferPageEdit: async () => (s.undone++, true),
    resetOfferPageToFlyer: async () => (s.reset++, true),
  }
})

const client = (over: Partial<ClientRecord>) => ({ email: "owner@example.test", plan: "basic", pausedAt: null, ...over }) as ClientRecord
const body = { headline: "Fall roof check", offer: "", price: "$49", expiresAt: "2026-11-30", cta: "Book now", phone: "555-0199" }

async function call(method: "GET" | "PUT" | "POST", { flyerId = "flyer-1", action, json = body }: { flyerId?: string; action?: string; json?: unknown } = {}) {
  const mod = await import("@/app/api/offer-page/[flyerId]/route")
  const url = `http://x/api/offer-page/${flyerId}${action ? `?action=${action}` : ""}`
  const req = new NextRequest(url, { method, ...(method === "PUT" ? { body: JSON.stringify(json), headers: { "content-type": "application/json" } } : {}) })
  const res = (await mod[method](req, { params: Promise.resolve({ flyerId }) }))!
  return { status: res.status, json: await res.json() }
}

beforeEach(() => {
  s.sub = "owner@example.test"; s.client = client({}); s.saved.length = 0; s.undone = 0; s.reset = 0
})

describe("saving needs an active paid plan, enforced on the server", () => {
  it.each(["basic", "pro"] as const)("%s: a save goes through", async (plan) => {
    s.client = client({ plan })
    expect((await call("PUT")).status).toBe(200)
    expect(s.saved).toHaveLength(1)
    expect(s.saved[0]).toEqual(["flyer-1", "ABC2345", { ...body, offer: null }])
  })

  it.each([
    ["trial", client({ plan: "trial" })],
    ["paused basic", client({ plan: "basic", pausedAt: "2026-11-01T00:00:00.000Z" })],
    ["paused pro", client({ plan: "pro", pausedAt: "2026-11-01T00:00:00.000Z" })],
    ["no client record", null],
  ])("%s: a direct PUT is refused with 403 and nothing saved", async (_label, c) => {
    s.client = c
    const res = await call("PUT")
    expect(res.status).toBe(403)
    expect(res.json.error).toBe("upgrade_required")
    expect(s.saved).toHaveLength(0)
  })

  it("trial: a direct undo is refused too", async () => {
    s.client = client({ plan: "trial" })
    expect((await call("POST", { action: "undo" })).status).toBe(403)
    expect(s.undone).toBe(0)
  })

  it("trial: reset is allowed, since it only puts back what the flyer says", async () => {
    s.client = client({ plan: "trial" })
    expect((await call("POST", { action: "reset" })).status).toBe(200)
    expect(s.reset).toBe(1)
  })

  it("GET tells the editor whether it may save", async () => {
    s.client = client({ plan: "trial" })
    expect((await call("GET")).json).toMatchObject({ canEdit: false, qrUrl: "https://oneflyer.org/r/ABC2345", code: "ABC2345" })
    s.client = client({ plan: "pro" })
    expect((await call("GET")).json.canEdit).toBe(true)
  })
})

describe("access", () => {
  it("signed out: 401", async () => {
    s.sub = null
    expect((await call("PUT")).status).toBe(401)
  })

  it("the admin login: 403", async () => {
    s.sub = "__admin__"
    expect((await call("PUT")).status).toBe(403)
  })

  it("someone else's flyer: 404, even on a paid plan", async () => {
    s.sub = "other@example.test"
    expect((await call("PUT")).status).toBe(404)
    expect(s.saved).toHaveLength(0)
  })

  it("an invalid edit: 422 naming the problem", async () => {
    const res = await call("PUT", { json: { ...body, headline: "" } })
    expect(res.status).toBe(422)
    expect(res.json.message).toMatch(/headline/i)
  })
})
