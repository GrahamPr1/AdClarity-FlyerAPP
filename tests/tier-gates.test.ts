import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { NextRequest } from "next/server"

/**
 * Every tier-gated endpoint refuses on the SERVER, whatever the UI shows: a
 * trial or Basic account calling a Pro-only route directly gets a 403 before
 * anything is read, written or charged. Real session cookies (lib/auth); only
 * the client record and the side-effecting helpers are stubbed.
 */

const s = vi.hoisted(() => ({ plans: new Map<string, string | null>(), sideEffects: [] as string[] }))
vi.mock("@/lib/store", () => {
  const client = (email: string) => {
    const plan = s.plans.get(email)
    return plan === null || plan === undefined ? null : { email, plan, pausedAt: null }
  }
  const touched = (name: string) => async () => void s.sideEffects.push(name)
  return {
    getClient: async (email: string) => client(email),
    getOrCreateClient: async (email: string) => client(email) ?? { email, plan: "trial", pausedAt: null },
    getBusinessProfile: async () => null,
    saveBusinessProfile: touched("saveBusinessProfile"),
    deleteBusinessProfile: touched("deleteBusinessProfile"),
    seedFormFillRequest: touched("seedFormFillRequest"),
    getFormFillsForEmail: async () => [],
    savePendingGoalCampaign: touched("savePendingGoalCampaign"),
    getPendingGoalCampaign: async () => null,
    getDeliverablesForEmail: async (email: string) => ({ email, flyers: [{ id: "f1", trackingCode: `code-${email}` }] }),
    getDeliverables: async () => ({ email: "trial@x.test", flyers: [{ id: "f1", trackingCode: "code-trial@x.test" }] }),
    getTrackingRecord: async (code: string) => ({ code, email: code.replace(/^code-/, ""), flyerId: "f1" }),
    getTrackingStats: async () => ({ scans: 12, clicks: 5 }),
    getTrackingMonthStats: async () => ({ scans: 4, clicks: 2 }),
    countLeadsForFlyer: async () => ({ total: 3, since: 1 }),
    listFlyerChannelCodes: async () => [],
    seedPrintRequest: touched("seedPrintRequest"),
    reserveFlyerQuota: async () => ({ ok: true }),
    releaseFlyerQuota: touched("releaseFlyerQuota"),
    markFlyersInProgress: touched("markFlyersInProgress"),
    seedFlyerDeliverables: touched("seedFlyerDeliverables"),
  }
})
vi.mock("@vercel/blob", () => ({ put: async () => ({ url: "x" }), del: async () => {}, get: async () => null }))
vi.mock("@vercel/functions", () => ({ waitUntil: () => {} }))
vi.mock("@/lib/agent-pipeline/formFillPipeline", () => ({ processFormFill: async () => {} }))
vi.mock("@/lib/agent-pipeline/goal-parser", () => ({ parseMarketingGoal: async () => { s.sideEffects.push("parseMarketingGoal"); throw new Error("must not be reached") }, GoalTooVagueError: class extends Error {} }))
vi.mock("@/lib/agent-pipeline/goal-campaign", () => ({ buildGoalCampaignPlan: async () => ({}), OfferRequiredError: class extends Error {} }))
vi.mock("@/lib/agent-pipeline/goal-rate-limit", () => ({ checkGoalRateLimit: async () => ({ allowed: true, retryAfterSeconds: 0 }) }))
vi.mock("@/lib/agent-pipeline/pipeline", () => ({ continuePipelineFromIntake: async () => {} }))
vi.mock("@/lib/enterprise/generation-guard", () => ({ nopAgentGenerationBlock: async () => null }))

beforeEach(() => {
  vi.stubEnv("SESSION_SECRET", "test-secret")
  s.plans = new Map([["trial@x.test", "trial"], ["basic@x.test", "basic"], ["pro@x.test", "pro"], ["norecord@x.test", null]])
  s.sideEffects = []
})
afterEach(() => vi.unstubAllEnvs())

async function call(load: () => Promise<{ POST: (r: NextRequest) => Promise<Response> }>, path: string, email: string, body: BodyInit, type = "application/json") {
  const { createSessionToken, SESSION_COOKIE } = await import("@/lib/auth")
  const req = new NextRequest(`http://x${path}`, {
    method: "POST",
    headers: { cookie: `${SESSION_COOKIE}=${await createSessionToken(email)}`, "content-type": type },
    body,
  })
  const res = await (await load()).POST(req)
  return { status: res.status, body: (await res.json().catch(() => null)) as { error?: string } | null }
}

const emptyForm = () => {
  const fd = new FormData()
  return fd
}

describe("Pro-only endpoints refuse trial and Basic on the server", () => {
  for (const [name, path, load] of [
    ["form-fill", "/api/form-fill", () => import("@/app/api/form-fill/route")],
    ["saved form-fill profile", "/api/business-profile", () => import("@/app/api/business-profile/route")],
  ] as const) {
    for (const email of ["trial@x.test", "basic@x.test", "norecord@x.test"]) {
      it(`${name}: ${email.split("@")[0]} gets 403 pro_only and nothing happens`, async () => {
        const r = await call(load as never, path, email, emptyForm() as never, undefined as never)
        expect(r.status).toBe(403)
        expect(r.body?.error).toBe("pro_only")
        expect(s.sideEffects).toEqual([])
      })
    }
    it(`${name}: Pro gets past the plan gate`, async () => {
      const r = await call(load as never, path, "pro@x.test", emptyForm() as never, undefined as never)
      expect(r.status).not.toBe(403)
    })
  }
})

describe("Basic-and-up endpoints refuse trial on the server, before reading the request", () => {
  it("goal-campaign/plan: trial gets 403, not 422, for an empty body", async () => {
    const r = await call(() => import("@/app/api/goal-campaign/plan/route") as never, "/api/goal-campaign/plan", "trial@x.test", "{}")
    expect(r).toMatchObject({ status: 403, body: { error: "paid_plan_required" } })
    expect(s.sideEffects).toEqual([])
  })

  it("goal-campaign/execute: trial gets 403, not 422, for an empty body", async () => {
    const r = await call(() => import("@/app/api/goal-campaign/execute/route") as never, "/api/goal-campaign/execute", "trial@x.test", "{}")
    expect(r).toMatchObject({ status: 403, body: { error: "paid_plan_required" } })
  })

  it("goal-campaign/plan: Basic gets past the gate (and is then asked for a goal)", async () => {
    const r = await call(() => import("@/app/api/goal-campaign/plan/route") as never, "/api/goal-campaign/plan", "basic@x.test", "{}")
    expect(r.status).toBe(422)
  })

  it("print-requests: an account with no client record is refused (fails closed)", async () => {
    for (const email of ["trial@x.test", "norecord@x.test"]) {
      const r = await call(() => import("@/app/api/print-requests/route") as never, "/api/print-requests", email, "{}")
      expect(r.status, email).toBe(403)
    }
    expect(s.sideEffects).toEqual([])
  })
})

describe("tracking stats: trial reads scans only, on the server", () => {
  async function get(path: string, sub: string, load: () => Promise<{ GET: (r: NextRequest, c: unknown) => Promise<Response> }>, params: Record<string, string>) {
    const { createSessionToken, SESSION_COOKIE } = await import("@/lib/auth")
    const req = new NextRequest(`http://x${path}`, { headers: { cookie: `${SESSION_COOKIE}=${await createSessionToken(sub)}` } })
    const res = await (await load()).GET(req, { params: Promise.resolve(params) })
    return (await res.json()) as Record<string, unknown>
  }
  const flyerRoute = () => import("@/app/api/tracking/flyer/[flyerId]/route") as never
  const codeRoute = () => import("@/app/api/tracking/[code]/route") as never

  it("per-flyer breakdown: trial gets scans, with clicks, channels and leads absent (not zeroed)", async () => {
    const b = await get("/api/tracking/flyer/f1", "trial@x.test", flyerRoute, { flyerId: "f1" })
    expect(b).toMatchObject({ totalScans: 12, scansThisMonth: 4, withheld: ["clicks", "channels", "leads"] })
    for (const k of ["totalClicks", "clicksThisMonth", "channels", "totalLeads", "leadsThisMonth"]) expect(b, k).not.toHaveProperty(k)
  })

  it("per-flyer breakdown: Basic gets everything", async () => {
    const b = await get("/api/tracking/flyer/f1", "basic@x.test", flyerRoute, { flyerId: "f1" })
    expect(b).toMatchObject({ totalScans: 12, totalClicks: 5, clicksThisMonth: 2, totalLeads: 3 })
  })

  it("per-code stats: trial gets scans only; Basic gets clicks too", async () => {
    expect(await get("/api/tracking/code-trial@x.test", "trial@x.test", codeRoute, { code: "code-trial@x.test" })).toEqual({ stats: { scans: 12 }, withheld: ["clicks"] })
    expect(await get("/api/tracking/code-basic@x.test", "basic@x.test", codeRoute, { code: "code-basic@x.test" })).toEqual({ stats: { scans: 12, clicks: 5 } })
  })

  it("admin still sees a trial account's full stats", async () => {
    const { ADMIN_SUB } = await import("@/lib/auth")
    const b = await get("/api/tracking/flyer/f1", ADMIN_SUB, flyerRoute, { flyerId: "f1" })
    expect(b).toMatchObject({ totalClicks: 5 })
  })
})
