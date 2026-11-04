import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextRequest } from "next/server"
import type { ClientRecord } from "@/lib/types"

/**
 * POST /api/tracking/channel: new channel codes are Basic/Pro, not paused,
 * enforced on the server. Trial keeps exactly one QR per flyer, so a direct
 * POST from a Trial session gets a 403 and creates nothing.
 */

const s = vi.hoisted(() => ({ sub: "owner@example.test" as string | null, client: null as unknown, minted: [] as unknown[] }))
vi.mock("@/lib/auth", () => ({ ADMIN_SUB: "admin", getSessionIdentity: async () => (s.sub ? { sub: s.sub } : null) }))
vi.mock("@/lib/store", () => {
  const flyers = { flyers: [{ id: "flyer-1", trackingCode: "ABC2345" }] }
  return {
    getClient: async () => s.client,
    getDeliverables: async () => ({ ...flyers, email: "owner@example.test" }),
    getDeliverablesForEmail: async (email: string) => (email === "owner@example.test" ? { ...flyers, email } : { flyers: [], email }),
    listFlyerChannelCodes: async () => [],
  }
})
vi.mock("@/lib/agent-pipeline/qrTracking", () => ({
  createChannelTrackingCode: async (...args: unknown[]) => {
    s.minted.push(args)
    return { code: "CHN2345", qrDataUrl: "data:", redeemUrl: "https://oneflyer.org/r/CHN2345" }
  },
}))

const client = (over: Partial<ClientRecord>) => ({ plan: "basic", pausedAt: null, ...over }) as ClientRecord
const PAUSED = "2026-11-01T00:00:00.000Z"

async function post(body: unknown = { flyerId: "flyer-1", label: "Email blast" }) {
  const { POST } = await import("@/app/api/tracking/channel/route")
  const res = (await POST(new NextRequest("http://x/api/tracking/channel", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } })))!
  return { status: res.status, json: await res.json() }
}

beforeEach(() => { s.sub = "owner@example.test"; s.client = client({}); s.minted.length = 0 })

describe("creating a channel code", () => {
  it.each(["basic", "pro"] as const)("%s: allowed", async (plan) => {
    s.client = client({ plan })
    expect((await post()).status).toBe(200)
    expect(s.minted).toEqual([["ABC2345", "Email blast"]])
  })

  it.each([
    ["a Trial session", client({ plan: "trial" })],
    ["a paused Basic session", client({ plan: "basic", pausedAt: PAUSED })],
    ["a paused Pro session", client({ plan: "pro", pausedAt: PAUSED })],
    ["an account with no record", null],
  ])("a direct POST from %s gets a 403 and creates nothing", async (_label, c) => {
    s.client = c
    const res = await post()
    expect(res.status).toBe(403)
    expect(res.json.error).toBe("upgrade_required")
    expect(s.minted).toHaveLength(0)
  })

  it("the admin's mirrored view follows the flyer owner's plan", async () => {
    s.sub = "admin"
    s.client = client({ plan: "trial" })
    expect((await post()).status).toBe(403)
    s.client = client({ plan: "pro" })
    expect((await post()).status).toBe(200)
  })

  it("someone else's flyer is 404 before any plan answer; signed out is 401", async () => {
    s.sub = "other@example.test"
    expect((await post()).status).toBe(404)
    s.sub = null
    expect((await post()).status).toBe(401)
  })
})
