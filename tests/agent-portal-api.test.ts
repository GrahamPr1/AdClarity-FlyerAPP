import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { NextRequest } from "next/server"
import { defaultOrgFeatures, type AgentTier } from "@/lib/enterprise/portal/features"

/**
 * Tier checks are on the server. A feature the agent can't use answers 403
 * with no data (a Basic agent gets nothing back from leads or team), an org
 * switch that's off does the same for every tier, and a non-agent is refused.
 * Plus the flyer render route under "view as agent": previews yes, downloads
 * and compliance-log writes no.
 */

const s = vi.hoisted(() => ({ tier: "basic" as string, features: {} as Record<string, boolean>, agents: new Set(["agent@x.test"]), admins: new Set(["admin"]), logged: [] as unknown[], rendered: [] as string[] }))
vi.mock("@/lib/admin", () => ({ isAdminSession: async (sub: string | null | undefined) => !!sub && s.admins.has(sub) }))
vi.mock("@/lib/enterprise/portal/store", () => ({
  getAgentTier: async () => s.tier,
  getOrgFeatures: async () => s.features,
  touchLastActive: async () => {},
}))
vi.mock("@/lib/enterprise/nop-render/agent-context", () => ({
  loadNopAgent: async (email: string) => (s.agents.has(email) ? { agentId: "858980", profile: { orgId: "nop", name: "Pat", displayName: "Pat", displayPhone: "1", displayEmail: email }, status: "active", active: true } : null),
  nopStatusMessageKey: () => "dash.status_missing",
}))
vi.mock("@/lib/enterprise/nop-render/log", () => ({ logNopRender: async (e: unknown) => void s.logged.push(e) }))
vi.mock("@/lib/enterprise/nop-render/thumb-cache", () => ({ getCachedThumb: async () => null, setCachedThumb: async () => {}, thumbCacheKey: () => "k" }))
vi.mock("@/lib/enterprise/nop-render/kit-v2-access", async (orig) => ({ ...(await orig<typeof import("@/lib/enterprise/nop-render/kit-v2-access")>()), getNopFlyerSettings: async () => ({ agentKit: "v1", spanishV2: false }) }))
vi.mock("@/lib/enterprise/nop-render/render", () => ({
  NOP_DOWNLOAD_FORMATS: ["print", "home", "social"],
  NopRenderError: class extends Error {},
  renderNopFlyer: async (_t: string, _v: unknown, format: string) => (s.rendered.push(format), { body: Buffer.from("x"), contentType: "image/png", filename: "f", ms: 1 }),
}))
vi.mock("@/lib/enterprise/nop-render/kit", () => ({ isNopTemplate: () => true, readKitContent: () => ({ program: { kit_version: "1.1.1" } }) }))
vi.mock("@/lib/enterprise/nop-i18n/server", () => ({ nopLangForRequest: async () => "en" }))
vi.mock("@/lib/enterprise/portal/agent-data", () => ({ listAgentLeads: async () => [] }))
vi.mock("@/lib/enterprise/portal/team", () => ({ listTeam: async () => [] }))

beforeEach(() => {
  vi.stubEnv("SESSION_SECRET", "test-secret")
  s.tier = "basic"; s.features = { ...defaultOrgFeatures(true), team: true }; s.logged.length = 0; s.rendered.length = 0
})
afterEach(() => vi.unstubAllEnvs())

async function cookieFor(sub: string, viewAsAgent?: string) {
  const { createSessionToken, SESSION_COOKIE } = await import("@/lib/auth")
  let c = `${SESSION_COOKIE}=${await createSessionToken(sub)}`
  if (viewAsAgent) {
    const { createViewAsToken, VIEW_AS_COOKIE } = await import("@/lib/enterprise/portal/view-as")
    c += `; ${VIEW_AS_COOKIE}=${await createViewAsToken(sub, viewAsAgent)}`
  }
  return c
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- route handlers take differently typed contexts
async function get(path: string, load: () => Promise<{ GET: (...a: any[]) => Promise<Response | undefined> }>, cookie?: string, ctx?: unknown) {
  const res = (await (await load()).GET(new NextRequest(`http://x${path}`, { headers: cookie ? { cookie } : {} }), ctx))!
  return { status: res.status, body: res.headers.get("content-type")?.includes("json") ? await res.json() : null }
}
const leads = () => import("@/app/api/enterprise/agent/leads/route")
const team = () => import("@/app/api/enterprise/agent/team/route")
const portal = () => import("@/app/api/enterprise/agent/portal/route")

describe("leads and team routes", () => {
  it.each([
    ["basic", 403, 403],
    ["pro", 200, 403],
    ["leader", 200, 200],
  ] as [AgentTier, number, number][])("%s: leads %i, team %i", async (tier, leadsStatus, teamStatus) => {
    s.tier = tier
    const c = await cookieFor("agent@x.test")
    expect((await get("/api/enterprise/agent/leads", leads, c)).status).toBe(leadsStatus)
    expect((await get("/api/enterprise/agent/team", team, c)).status).toBe(teamStatus)
  })

  it("a Basic agent gets no data at all, only the refusal", async () => {
    const r = await get("/api/enterprise/agent/leads", leads, await cookieFor("agent@x.test"))
    expect(r.body).toEqual({ error: "not_available", feature: "leads" })
  })

  it("an org switch that's off refuses even a Leader", async () => {
    s.tier = "leader"
    s.features = { ...defaultOrgFeatures(true), leads: false, team: false }
    const c = await cookieFor("agent@x.test")
    expect((await get("/api/enterprise/agent/leads", leads, c)).status).toBe(403)
    expect((await get("/api/enterprise/agent/team", team, c)).status).toBe(403)
  })

  it("signed out: 401; an SMB customer (no Agent ID): 404", async () => {
    expect((await get("/api/enterprise/agent/leads", leads)).status).toBe(401)
    expect((await get("/api/enterprise/agent/leads", leads, await cookieFor("shop@x.test"))).status).toBe(404)
  })

  it("the portal answer reports tier, abilities and tabs", async () => {
    s.tier = "pro"
    const r = await get("/api/enterprise/agent/portal", portal, await cookieFor("agent@x.test"))
    expect(r.body).toMatchObject({ tier: "pro", tabs: ["home", "create", "leads"], readOnly: false, can: { leads: true, team: false, results: true } })
  })

  it("view-as reads the agent's tier, marked read-only", async () => {
    s.tier = "leader"
    const r = await get("/api/enterprise/agent/portal", portal, await cookieFor("admin", "agent@x.test"))
    expect(r.body).toMatchObject({ tier: "leader", readOnly: true })
  })
})

describe("the flyer render route", () => {
  const render = () => import("@/app/api/enterprise/nop/render/[template]/route")
  const ctx = { params: Promise.resolve({ template: "NOP_P1_EN" }) }

  it("an agent's download works and is written to the compliance log", async () => {
    expect((await get("/api/enterprise/nop/render/NOP_P1_EN?format=print", render, await cookieFor("agent@x.test"), ctx)).status).toBe(200)
    expect(s.logged).toHaveLength(1)
  })

  it("viewing as the agent: a preview renders and isn't logged as theirs", async () => {
    expect((await get("/api/enterprise/nop/render/NOP_P1_EN?format=preview", render, await cookieFor("admin", "agent@x.test"), ctx)).status).toBe(200)
    expect(s.logged).toEqual([])
  })

  it.each(["print", "home", "social"])("viewing as the agent: a %s download is refused, nothing rendered or logged", async (format) => {
    const r = await get(`/api/enterprise/nop/render/NOP_P1_EN?format=${format}`, render, await cookieFor("admin", "agent@x.test"), ctx)
    expect(r.status).toBe(403)
    expect(r.body.error).toBe("read_only")
    expect(s.rendered).toEqual([])
    expect(s.logged).toEqual([])
  })
})
