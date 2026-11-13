import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { NextRequest } from "next/server"

/**
 * Every tier-gated endpoint refuses on the SERVER, whatever the UI shows: a
 * trial or Basic account calling a Pro-only route directly gets a 403 before
 * anything is read, written or charged. Real session cookies (lib/auth); only
 * the client record and the side-effecting helpers are stubbed.
 */

const s = vi.hoisted(() => ({
  plans: new Map<string, string | null>(),
  sideEffects: [] as string[],
  campaignInputs: new Map<string, unknown>(),
  generated: [] as {
    intake: { businessName: string; photos: unknown[]; flyerRequests: { id: string; purpose: string; notes: string | null; formatId?: string }[] }
    requests: { id: string; formatId?: string; keepDesign?: Record<string, unknown> }[]
  }[],
  /** Extra fields on the caller's flyer f1 (e.g. its stored HTML). */
  sourceFlyer: {} as Record<string, unknown>,
}))
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
    getDeliverablesForEmail: async (email: string) => ({ email, flyers: [{ id: "f1", trackingCode: `code-${email}`, ...s.sourceFlyer }] }),
    getDeliverables: async () => ({ email: "trial@x.test", flyers: [{ id: "f1", trackingCode: "code-trial@x.test" }] }),
    getTrackingRecord: async (code: string) => ({ code, email: code.replace(/^code-/, ""), flyerId: "f1" }),
    getTrackingStats: async () => ({ scans: 12, clicks: 5 }),
    getTrackingMonthStats: async () => ({ scans: 4, clicks: 2 }),
    countLeadsForFlyer: async () => ({ total: 3, since: 1 }),
    listFlyerChannelCodes: async () => [],
    seedPrintRequest: touched("seedPrintRequest"),
    reserveFlyerQuota: async () => (s.sideEffects.push("reserveFlyerQuota"), { ok: true }),
    getAgentProfile: async (email: string) => (email === "org@x.test" ? { orgId: "org-1" } : null),
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
vi.mock("@/lib/agent-pipeline/pipeline", () => ({
  continuePipelineFromIntake: async (_email: string, intake: never, requests: never) => void s.generated.push({ intake, requests }),
}))
vi.mock("@/lib/enterprise/generation-guard", () => ({
  nopAgentGenerationBlock: async (email: string) =>
    email === "nop@x.test" ? new Response(JSON.stringify({ error: "nop_agent_blocked" }), { status: 403 }) : null,
}))
vi.mock("@/lib/campaign-inputs", () => ({ getCampaignInput: async (id: string) => s.campaignInputs.get(id) ?? null }))
vi.mock("@/lib/business-profile-resolve", () => ({
  resolveBusinessProfile: async () => ({
    businessName: "Pearl Roofing",
    industry: "Roofing",
    description: null,
    website: null,
    services: ["Roof repair"],
    contact: { phone: "270-555-0100", email: null, address: null, social: [] },
    brand: { logoUrl: null, colors: null, tone: null },
  }),
}))

beforeEach(() => {
  vi.stubEnv("SESSION_SECRET", "test-secret")
  s.plans = new Map([["trial@x.test", "trial"], ["basic@x.test", "basic"], ["pro@x.test", "pro"], ["norecord@x.test", null], ["org@x.test", "pro"], ["nop@x.test", "pro"]])
  s.sideEffects = []
  s.campaignInputs = new Map()
  s.generated = []
  s.sourceFlyer = {}
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

describe("new promotion from this campaign: Pro only, on the server", () => {
  const load = () => import("@/app/api/campaigns/new-promotion/route")
  const body = (o: Record<string, unknown> = {}) => JSON.stringify({ flyerId: "f1", offer: "Free gutter check with any roof repair", ...o })

  for (const email of ["trial@x.test", "basic@x.test", "norecord@x.test"]) {
    it(`${email.split("@")[0]} gets 403 pro_only; nothing reserved or generated`, async () => {
      const r = await call(load as never, "/api/campaigns/new-promotion", email, body())
      expect(r).toMatchObject({ status: 403, body: { error: "pro_only" } })
      expect(s.sideEffects).toEqual([])
      expect(s.generated).toEqual([])
    })
  }
  it("enterprise org accounts are refused even on Pro", async () => {
    const r = await call(load as never, "/api/campaigns/new-promotion", "org@x.test", body())
    expect(r.status).toBe(403)
    expect(s.generated).toEqual([])
  })
  it("NOP agents are refused", async () => {
    const r = await call(load as never, "/api/campaigns/new-promotion", "nop@x.test", body())
    expect(r).toMatchObject({ status: 403, body: { error: "nop_agent_blocked" } })
    expect(s.generated).toEqual([])
  })
  it("someone else's flyer is not found", async () => {
    const r = await call(load as never, "/api/campaigns/new-promotion", "pro@x.test", body({ flyerId: "not-mine" }))
    expect(r.status).toBe(404)
    expect(s.generated).toEqual([])
  })

  it("Pro, saved campaign: reuses business, photos and format; only the offer changes; old notes dropped", async () => {
    s.campaignInputs.set("f1", {
      intake: { businessName: "Pearl Roofing", photos: [{ url: "https://blob/x.jpg", caption: "roof" }], flyerRequests: [] },
      request: { id: "f1", purpose: "Spring roof sale", notes: "OFFER (use verbatim): 10% off", formatId: "door-hanger" },
      savedAt: "2026-11-01T00:00:00.000Z",
    })
    const r = await call(load as never, "/api/campaigns/new-promotion", "pro@x.test", body({ notes: "Ends 30 Nov" }))
    expect(r).toMatchObject({ status: 201, body: { source: "campaign" } })
    expect(s.sideEffects).toEqual(["reserveFlyerQuota"])
    const intake = s.generated[0].intake
    expect(intake.photos).toHaveLength(1)
    expect(intake.flyerRequests).toEqual([
      { id: (r.body as { flyerId: string }).flyerId, purpose: "Free gutter check with any roof repair", notes: "Ends 30 Nov", formatId: "door-hanger" },
    ])
  })

  it("Pro, older flyer with nothing saved: falls back to the Business Profile and says so", async () => {
    const { GET } = await load()
    const { createSessionToken, SESSION_COOKIE } = await import("@/lib/auth")
    const cookie = `${SESSION_COOKIE}=${await createSessionToken("pro@x.test")}`
    const g = await GET(new NextRequest("http://x/api/campaigns/new-promotion?flyerId=f1", { headers: { cookie } }))
    expect(await g.json()).toEqual({ available: true, source: "profile" })

    const r = await call(load as never, "/api/campaigns/new-promotion", "pro@x.test", body())
    expect(r).toMatchObject({ status: 201, body: { source: "profile" } })
    const intake = s.generated[0].intake
    expect(intake.businessName).toBe("Pearl Roofing")
    expect(intake.flyerRequests).toHaveLength(1)
    expect(intake.flyerRequests[0].purpose).toContain("Free gutter check with any roof repair")
    expect(intake.flyerRequests[0].formatId).toBeUndefined()
  })

  it("Pro: an empty offer is refused before anything is reserved", async () => {
    const r = await call(load as never, "/api/campaigns/new-promotion", "pro@x.test", body({ offer: "  " }))
    expect(r.status).toBe(400)
    expect(s.sideEffects).toEqual([])
  })
})

describe("new promotion keeps the source flyer's design", () => {
  const load = () => import("@/app/api/campaigns/new-promotion/route")
  const colors = { primary: "#7a1f2b", secondary: "#f4e9e1", accent: "#d9a441" }
  const fonts = { heading: "Georgia, serif", body: "Arial, sans-serif" }
  async function stored(templateId: string) {
    const { fillTemplate } = await import("@/lib/agent-pipeline/template-mode")
    const { templateById } = await import("@/lib/agent-pipeline/templates")
    const { encodeFlyerHtml } = await import("@/lib/flyer-data-url")
    const html = fillTemplate({ template: templateById(templateId)!, headline: "Roof inspection", supporting: "Free this month.", businessName: "Pearl Roofing", phone: "270-555-0100", address: null, hasLogo: false, hasQr: true, photoUrl: null, colors, fonts }).html
    return encodeFlyerHtml(html)
  }
  const body = JSON.stringify({ flyerId: "f1", offer: "Free gutter check with any roof repair" })

  it("saved inputs: same layout, colours and fonts as the source", async () => {
    s.sourceFlyer = { downloadUrl: await stored("split-vertical") }
    s.campaignInputs.set("f1", {
      intake: { businessName: "Pearl Roofing", photos: [], flyerRequests: [] },
      request: { id: "f1", purpose: "Roof inspection", notes: null },
      savedAt: "2026-11-12T20:04:52.000Z",
    })
    expect((await call(load as never, "/api/campaigns/new-promotion", "pro@x.test", body)).status).toBe(201)
    expect(s.generated[0].requests[0].keepDesign).toEqual({ templateId: "split-vertical", colors, fonts })
  })

  it("fallback (older flyer): keeps the design too, and a door hanger stays a door hanger", async () => {
    s.sourceFlyer = { downloadUrl: await stored("door-hanger-stack") }
    expect((await call(load as never, "/api/campaigns/new-promotion", "pro@x.test", body)).body).toMatchObject({ source: "profile" })
    const [request] = s.generated[0].requests
    expect(request).toMatchObject({ formatId: "door-hanger", keepDesign: { templateId: "door-hanger-stack", colors, fonts } })
  })

  it("an AI-drawn source has no design to keep: the request carries none and is drawn as normal", async () => {
    s.sourceFlyer = { downloadUrl: "data:text/html;charset=utf-8,<h1>Roof sale</h1>" }
    await call(load as never, "/api/campaigns/new-promotion", "pro@x.test", body)
    expect(s.generated[0].requests[0].keepDesign).toBeUndefined()
  })
})
