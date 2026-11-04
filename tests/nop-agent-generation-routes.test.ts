import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextRequest } from "next/server"

/**
 * NOP agents stay off AI generation on retry, regenerate and refine too, with
 * the same block as the other pipeline routes. Refused before anything is
 * read, reserved or spent. Everyone else passes straight through it.
 */

const s = vi.hoisted(() => ({ sub: "agent@example.test" as string, agents: new Set<string>(), storeCalls: [] as string[], pipelineCalls: [] as string[] }))

vi.mock("@vercel/functions", () => ({ waitUntil: () => {} }))
vi.mock("@/lib/auth", () => ({ ADMIN_SUB: "admin", getSessionIdentity: async () => ({ sub: s.sub }) }))
vi.mock("@/lib/enterprise/agents-store", () => ({ isNopAgentAccount: async (email: string) => s.agents.has(email) }))
vi.mock("@/lib/enterprise/nop-i18n/server", () => ({ nopLangForRequest: async () => "en" }))
vi.mock("@/lib/agent-pipeline/pipeline", () => ({
  retryFlyer: async () => void s.pipelineCalls.push("retryFlyer"),
  refineFlyer: async () => void s.pipelineCalls.push("refineFlyer"),
  fromDataUrl: () => "",
}))
vi.mock("@/lib/store", () => {
  const note = (name: string, value: unknown) => async () => (s.storeCalls.push(name), value)
  const request = { id: "flyer-1", purpose: "Promo", notes: null }
  return {
    getPipelineState: note("getPipelineState", { intake: { brandAssets: { logoUrl: null } }, flyerRequests: [request] }),
    getOrCreateClient: note("getOrCreateClient", { plan: "pro", pausedAt: null }),
    reserveFlyerQuota: note("reserveFlyerQuota", { allowed: true }),
    releaseFlyerQuota: note("releaseFlyerQuota", undefined),
    incrementAndCheckRegenerateAllowance: note("incrementAndCheckRegenerateAllowance", { isFree: true, countSoFar: 1 }),
    incrementAndCheckRefinementAllowance: note("incrementAndCheckRefinementAllowance", { isFree: true, countSoFar: 1 }),
    getDeliverablesForEmail: note("getDeliverablesForEmail", { flyers: [{ id: "flyer-1", title: "Promo", downloadUrl: "data:text/html;base64,eA==" }] }),
    getPendingBrandProfile: note("getPendingBrandProfile", { brandProfile: {}, contact: {} }),
    getSavedBrandProfile: note("getSavedBrandProfile", null),
    savePreEditSnapshot: note("savePreEditSnapshot", undefined),
    updateDeliverable: note("updateDeliverable", undefined),
    getLatestDesignVariant: note("getLatestDesignVariant", null),
  }
})

const post = async (load: () => Promise<{ POST: (r: NextRequest) => Promise<Response | undefined> }>, url: string, body: unknown) => {
  const { POST } = await load()
  const res = (await POST(new NextRequest(`http://x${url}`, { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } })))!
  return { status: res.status, json: await res.json() }
}
const retry = (body: unknown = { flyerId: "flyer-1" }) => post(() => import("@/app/api/deliverables/retry/route"), "/api/deliverables/retry", body)
const regenerate = () => post(() => import("@/app/api/quick-prompt/regenerate/route"), "/api/quick-prompt/regenerate", { flyerId: "flyer-1" })
const refine = () => post(() => import("@/app/api/quick-prompt/refine/route"), "/api/quick-prompt/refine", { flyerId: "flyer-1", instruction: "Make it bolder" })
const ROUTES = [["retry", retry], ["regenerate", regenerate], ["refine", refine]] as const

beforeEach(() => {
  s.sub = "agent@example.test"
  s.agents = new Set(["agent@example.test"])
  s.storeCalls.length = 0
  s.pipelineCalls.length = 0
})

describe("a NOP agent", () => {
  it.each(ROUTES)("%s: 403 nop_agent_blocked, with nothing read, reserved or generated", async (_name, call) => {
    const res = await call()
    expect(res.status).toBe(403)
    expect(res.json.error).toBe("nop_agent_blocked")
    expect(s.storeCalls).toEqual([])
    expect(s.pipelineCalls).toEqual([])
  })
})

describe("an ordinary client", () => {
  it.each([
    ["retry", retry, "retryFlyer"],
    ["regenerate", regenerate, "retryFlyer"],
    ["refine", refine, "refineFlyer"],
  ] as const)("%s: passes the block and reaches the pipeline", async (_name, call, pipeline) => {
    s.sub = "owner@example.test"
    const res = await call()
    expect(res.status).toBe(200)
    expect(s.pipelineCalls).toEqual([pipeline])
  })
})

describe("admin retrying on someone's behalf", () => {
  it("is blocked for an agent's flyer", async () => {
    s.sub = "admin"
    const res = await retry({ flyerId: "flyer-1", email: "agent@example.test" })
    expect(res.status).toBe(403)
    expect(res.json.error).toBe("nop_agent_blocked")
    expect(s.pipelineCalls).toEqual([])
  })

  it("still works for an ordinary client's flyer", async () => {
    s.sub = "admin"
    expect((await retry({ flyerId: "flyer-1", email: "owner@example.test" })).status).toBe(200)
    expect(s.pipelineCalls).toEqual(["retryFlyer"])
  })
})
