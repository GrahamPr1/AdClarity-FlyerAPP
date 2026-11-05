import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { NextRequest } from "next/server"
import { defaultOrgFeatures } from "@/lib/enterprise/portal/features"

/**
 * Admin agent routes: admin only, every one. Admin can list agents, open one
 * (logged), change a tier, flip an org switch, and start/stop "view as agent"
 * (logged; sets the signed read-only cookie, never a session).
 */

const s = vi.hoisted(() => ({ admins: new Set(["admin"]), tiers: [] as unknown[], switches: [] as unknown[], views: [] as { kind: string }[] }))
vi.mock("@upstash/redis", () => ({ Redis: { fromEnv: () => new Proxy({}, { get: () => async () => null }) } }))
vi.mock("@/lib/admin", () => ({ isAdminSession: async (sub: string | null | undefined) => !!sub && s.admins.has(sub) }))
const row = { email: "agent@x.test", agentId: "858980", name: "Pat", orgId: "nop", orgName: "Neighborhood Outreach Program", tier: "basic", status: "active", lastActive: null, flyersMade: 2, leads: 0 }
vi.mock("@/lib/enterprise/portal/admin", async (orig) => ({
  ...(await orig<typeof import("@/lib/enterprise/portal/admin")>()),
  listAgentRows: async () => [row],
  getAgentDetail: async (email: string) => (email === row.email ? { ...row, companyName: "", phone: "", recruiter: null, team: [], recentActivity: [], views: [] } : null),
}))
vi.mock("@/lib/enterprise/portal/store", () => ({
  setAgentTier: async (...a: unknown[]) => void s.tiers.push(a),
  setOrgFeature: async (...a: unknown[]) => (s.switches.push(a), defaultOrgFeatures(true)),
  getOrgFeatures: async () => defaultOrgFeatures(true),
  logAdminAgentView: async (v: { kind: string }) => void s.views.push(v),
  listAdminAgentViews: async () => s.views,
}))

beforeEach(() => { vi.stubEnv("SESSION_SECRET", "test-secret"); s.tiers.length = 0; s.switches.length = 0; s.views.length = 0 })
afterEach(() => vi.unstubAllEnvs())

async function cookie(sub: string) {
  const { createSessionToken, SESSION_COOKIE } = await import("@/lib/auth")
  return `${SESSION_COOKIE}=${await createSessionToken(sub)}`
}
type Handler = (r: NextRequest, c?: unknown) => Promise<Response | undefined>
async function call(load: () => Promise<Record<string, unknown>>, method: string, url: string, who: string | null, body?: unknown, params?: Record<string, string>) {
  const mod = (await load()) as Record<string, Handler>
  const res = (await mod[method](
    new NextRequest(`http://x${url}`, { method, headers: { ...(who ? { cookie: await cookie(who) } : {}), "content-type": "application/json" }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) }),
    params ? { params: Promise.resolve(params) } : undefined,
  ))!
  return { status: res.status, json: await res.json().catch(() => null), setCookie: res.headers.get("set-cookie") }
}
const agents = () => import("@/app/api/admin/enterprise/agents/route")
const detail = () => import("@/app/api/admin/enterprise/agents/[email]/route")
const tier = () => import("@/app/api/admin/enterprise/agents/[email]/tier/route")
const features = () => import("@/app/api/admin/enterprise/features/route")
const viewAs = () => import("@/app/api/admin/enterprise/view-as/route")
const views = () => import("@/app/api/admin/enterprise/agent-views/route")
const P = { email: "agent%40x.test" }

describe("non-admins are refused everywhere", () => {
  it.each([
    ["list", agents, "GET", "/api/admin/enterprise/agents", undefined, undefined],
    ["detail", detail, "GET", "/api/admin/enterprise/agents/agent%40x.test", undefined, P],
    ["tier", tier, "POST", "/api/admin/enterprise/agents/agent%40x.test/tier", { tier: "pro" }, P],
    ["features read", features, "GET", "/api/admin/enterprise/features", undefined, undefined],
    ["features write", features, "POST", "/api/admin/enterprise/features", { orgId: "nop", feature: "leads", enabled: false }, undefined],
    ["view-as", viewAs, "POST", "/api/admin/enterprise/view-as", { email: "agent@x.test" }, undefined],
    ["views log", views, "GET", "/api/admin/enterprise/agent-views", undefined, undefined],
  ] as const)("%s: 401 for an agent, an SMB customer and signed-out", async (_n, load, method, url, body, params) => {
    for (const who of ["agent@x.test", "shop@x.test", null]) {
      const r = await call(load, method, url, who, body, params)
      expect(r.status, String(who)).toBe(401)
      expect(r.setCookie).toBeNull()
    }
    expect(s.tiers).toEqual([])
    expect(s.switches).toEqual([])
    expect(s.views).toEqual([])
  })
})

describe("as admin", () => {
  it("lists agents", async () => {
    expect((await call(agents, "GET", "/api/admin/enterprise/agents", "admin")).json.agents).toHaveLength(1)
  })

  it("opening an agent is logged", async () => {
    expect((await call(detail, "GET", "/x", "admin", undefined, P)).status).toBe(200)
    expect(s.views).toEqual([expect.objectContaining({ admin: "admin", agentEmail: "agent@x.test", kind: "detail" })])
  })

  it("sets a valid tier, refuses anything else, and refuses non-agents", async () => {
    expect((await call(tier, "POST", "/x", "admin", { tier: "leader" }, P)).status).toBe(200)
    expect(s.tiers).toEqual([["agent@x.test", "leader"]])
    expect((await call(tier, "POST", "/x", "admin", { tier: "gold" }, P)).status).toBe(422)
    expect((await call(tier, "POST", "/x", "admin", { tier: "pro" }, { email: "shop%40x.test" })).status).toBe(404)
  })

  it("flips an org switch; unknown orgs and features are refused", async () => {
    expect((await call(features, "POST", "/x", "admin", { orgId: "nop", feature: "events", enabled: false })).status).toBe(200)
    expect(s.switches).toEqual([["nop", "events", false]])
    expect((await call(features, "POST", "/x", "admin", { orgId: "other", feature: "events", enabled: false })).status).toBe(404)
    expect((await call(features, "POST", "/x", "admin", { orgId: "nop", feature: "teleport", enabled: true })).status).toBe(422)
  })

  it("view-as: logged, sets the signed read-only cookie (never a session), and Exit clears it", async () => {
    const r = await call(viewAs, "POST", "/x", "admin", { email: "agent@x.test" })
    expect(r.status).toBe(200)
    expect(s.views).toEqual([expect.objectContaining({ kind: "view-as", agentEmail: "agent@x.test" })])
    expect(r.setCookie).toMatch(/^oneflyer_view_as=[^;]+;.*HttpOnly/i)
    expect(r.setCookie).not.toMatch(/dashboard_session/)
    const { verifyViewAsToken } = await import("@/lib/enterprise/portal/view-as")
    expect(await verifyViewAsToken(r.setCookie!.split(";")[0].split("=")[1])).toMatchObject({ admin: "admin", agent: "agent@x.test" })
    const out = await call(viewAs, "DELETE", "/x", "admin")
    expect(out.setCookie).toMatch(/oneflyer_view_as=;.*Max-Age=0/i)
  })

  it("view-as for someone who isn't an agent: 404, no cookie", async () => {
    const r = await call(viewAs, "POST", "/x", "admin", { email: "shop@x.test" })
    expect(r.status).toBe(404)
    expect(r.setCookie).toBeNull()
  })
})
