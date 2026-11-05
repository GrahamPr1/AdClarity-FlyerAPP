import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { NextRequest } from "next/server"

/**
 * Agent routes refuse every kit-v2 flyer (Spanish included) exactly like an
 * unknown template, so a direct URL or API call reveals nothing. The flyer
 * settings and kit-v2 previews are admin-only, and agents can't be switched to
 * kit v2 before it has an agent area.
 */

const s = vi.hoisted(() => ({ settings: { agentKit: "v1", spanishV2: false } as Record<string, unknown>, rendered: [] as string[], admins: new Set(["admin"]), saved: [] as unknown[] }))
vi.mock("@/lib/admin", () => ({ isAdminSession: async (sub: string | null | undefined) => !!sub && s.admins.has(sub) }))
vi.mock("@/lib/enterprise/nop-render/kit-v2-access", async (orig) => ({
  ...(await orig<typeof import("@/lib/enterprise/nop-render/kit-v2-access")>()),
  getNopFlyerSettings: async () => s.settings,
  setNopFlyerSetting: async (p: unknown) => (s.saved.push(p), s.settings),
}))
vi.mock("@/lib/enterprise/nop-render/agent-context", () => ({
  loadNopAgent: async () => ({ agentId: "858980", profile: { orgId: "nop", name: "Pat", displayName: "Pat", displayPhone: "1", displayEmail: "a@x.test" }, status: "active", active: true }),
  nopStatusMessageKey: () => "dash.status_missing",
}))
vi.mock("@/lib/enterprise/nop-render/log", () => ({ logNopRender: async () => {} }))
vi.mock("@/lib/enterprise/nop-render/thumb-cache", () => ({ getCachedThumb: async () => null, setCachedThumb: async () => {}, thumbCacheKey: () => "k" }))
vi.mock("@/lib/enterprise/nop-render/render", () => ({
  NOP_DOWNLOAD_FORMATS: ["print", "home", "social"],
  NopRenderError: class extends Error {},
  renderNopFlyer: async (t: string) => (s.rendered.push(t), { body: Buffer.from("x"), contentType: "application/pdf", filename: "f", ms: 1, qr: "q" }),
}))
vi.mock("@/lib/enterprise/nop-render/render-v2", () => ({
  renderNopV2: async (t: string) => (s.rendered.push(t), { body: Buffer.from("x"), contentType: "application/pdf", pagePoints: { w: 612, h: 792 }, usedFonts: [], ms: 1 }),
}))
vi.mock("@/lib/enterprise/nop-i18n/server", () => ({ nopLangForRequest: async () => "en" }))

beforeEach(() => { vi.stubEnv("SESSION_SECRET", "test-secret"); s.settings = { agentKit: "v1", spanishV2: false }; s.rendered.length = 0; s.saved.length = 0 })
afterEach(() => vi.unstubAllEnvs())

async function cookie(sub: string) {
  const { createSessionToken, SESSION_COOKIE } = await import("@/lib/auth")
  return `${SESSION_COOKIE}=${await createSessionToken(sub)}`
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- route handlers take differently typed contexts
async function call(load: () => Promise<any>, method: string, url: string, who: string | null, params?: Record<string, string>, body?: unknown) {
  const mod = await load()
  const res = (await mod[method](new NextRequest(`http://x${url}`, { method, headers: { ...(who ? { cookie: await cookie(who) } : {}), "content-type": "application/json" }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) }), params ? { params: Promise.resolve(params) } : undefined))!
  return { status: res.status, json: res.headers.get("content-type")?.includes("json") ? await res.json() : null }
}
const render = () => import("@/app/api/enterprise/nop/render/[template]/route")
const thumb = () => import("@/app/api/enterprise/nop/thumbnail/[template]/route")
const check = () => import("@/app/api/admin/enterprise/nop/render-check/route")
const settings = () => import("@/app/api/admin/enterprise/nop/flyer-settings/route")

describe("agents can't reach kit v2", () => {
  it.each(["NOP2_P1_EN_PRICE", "NOP2_P2_EN_NOPRICE", "NOP2_P1_ES_PRICE", "NOP2_P3_ES_NOPRICE"])("%s: render and thumbnail answer 404 unknown_template, nothing rendered", async (id) => {
    for (const settingsNow of [{ agentKit: "v1", spanishV2: false }, { agentKit: "v2", spanishV2: true }]) {
      s.settings = settingsNow
      for (const fmt of ["preview", "print", "home", "thumb"]) {
        const r = await call(render, "GET", `/api/enterprise/nop/render/${id}?format=${fmt}`, "agent@x.test", { template: id })
        expect(r.status).toBe(404)
        expect(r.json.error).toBe("unknown_template")
      }
      expect((await call(thumb, "GET", `/api/enterprise/nop/thumbnail/${id}`, "agent@x.test", { template: id })).status).toBe(404)
    }
    expect(s.rendered).toEqual([])
  })

  it("kit v1.1.1 still works for agents (unchanged)", async () => {
    expect((await call(render, "GET", "/api/enterprise/nop/render/NOP_P1_EN?format=print", "agent@x.test", { template: "NOP_P1_EN" })).status).toBe(200)
  })
})

describe("admin-only kit-v2 tools", () => {
  it("render-check renders v2 Letter and bleed for admin, Spanish included", async () => {
    for (const [id, fmt] of [["NOP2_P1_EN_PRICE", "letter"], ["NOP2_P1_EN_PRICE", "bleed"], ["NOP2_P2_ES_NOPRICE", "letter"]]) {
      expect((await call(check, "GET", `/api/admin/enterprise/nop/render-check?template=${id}&format=${fmt}`, "admin")).status).toBe(200)
    }
    expect((await call(check, "GET", "/api/admin/enterprise/nop/render-check?template=NOP2_P1_EN_PRICE&format=social", "admin")).status).toBe(422)
  })

  it("render-check and the settings refuse non-admins", async () => {
    for (const who of ["agent@x.test", null]) {
      expect((await call(check, "GET", "/api/admin/enterprise/nop/render-check?template=NOP2_P1_EN_PRICE&format=letter", who)).status).toBe(401)
      expect((await call(settings, "GET", "/x", who)).status).toBe(401)
      expect((await call(settings, "POST", "/x", who, undefined, { spanishV2: true })).status).toBe(401)
    }
    expect(s.saved).toEqual([])
  })

  it("Spanish starts off and can be switched by admin; agents can't be moved to v2 without an agent area", async () => {
    expect((await call(settings, "GET", "/x", "admin")).json).toMatchObject({ spanishV2: false, agentKit: "v1", agentAreaReady: false })
    expect((await call(settings, "POST", "/x", "admin", undefined, { spanishV2: true })).status).toBe(200)
    expect(s.saved).toEqual([{ spanishV2: true, agentKit: undefined }])
    const r = await call(settings, "POST", "/x", "admin", undefined, { agentKit: "v2" })
    expect(r.status).toBe(409)
    expect(r.json.error).toBe("agent_area_missing")
  })
})
