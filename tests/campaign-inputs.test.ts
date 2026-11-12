import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * Per-flyer campaign inputs: one record per request, the batch stripped from
 * the stored intake, nothing written for enterprise org accounts, and a Redis
 * failure never fails the generation.
 */

const s = vi.hoisted(() => ({ kv: new Map<string, unknown>(), failSet: false }))
vi.mock("@upstash/redis", () => ({
  Redis: {
    fromEnv: () => ({
      get: async (k: string) => s.kv.get(k) ?? null,
      set: async (k: string, v: unknown) => {
        if (s.failSet) throw new Error("redis down")
        s.kv.set(k, v)
      },
    }),
  },
}))
vi.mock("@/lib/store", () => ({ getAgentProfile: async (email: string) => (email === "org@x.test" ? { orgId: "org-1" } : null) }))

import { getCampaignInput, saveCampaignInputs } from "@/lib/campaign-inputs"

const requests = [
  { id: "a", purpose: "Spring sale", notes: null, formatId: "door-hanger" },
  { id: "b", purpose: "Spring sale", notes: "angle 2" },
]
const intake = { businessName: "Pearl Roofing", photos: [], flyerRequests: requests } as never

beforeEach(() => {
  s.kv.clear()
  s.failSet = false
})

describe("saveCampaignInputs", () => {
  it("keeps one record per flyer, with that flyer's own request", async () => {
    await saveCampaignInputs("owner@x.test", intake, requests)
    expect(await getCampaignInput("a")).toMatchObject({ request: requests[0], intake: { businessName: "Pearl Roofing", flyerRequests: [] } })
    expect((await getCampaignInput("b"))?.request).toEqual(requests[1])
  })
  it("writes nothing for enterprise org accounts", async () => {
    await saveCampaignInputs("org@x.test", intake, requests)
    expect(s.kv.size).toBe(0)
  })
  it("never throws when Redis fails", async () => {
    s.failSet = true
    await expect(saveCampaignInputs("owner@x.test", intake, requests)).resolves.toBeUndefined()
  })
})
