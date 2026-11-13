import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { NextRequest } from "next/server"

/**
 * Until admin switches agents to kit v2, agent routes refuse every kit-v2
 * flyer exactly like an unknown template, so a direct URL reveals nothing.
 * Once switched: English kit v2 (Spanish only with its switch), rendered only
 * through renderNopV2ForAgent, and kit v1.1.1 refused. The flyer settings and
 * kit-v2 previews are admin-only.
 */

const s = vi.hoisted(() => ({ settings: { agentKit: "v1", spanishV2: false } as Record<string, unknown>, rendered: [] as string[], values: [] as unknown[], logged: [] as unknown[], admins: new Set(["admin"]), saved: [] as unknown[], enrollOk: true as boolean | undefined, settingsLog: [] as unknown[], esFailures: [] as unknown[], releaseChecks: 0, enrollSaved: true, partnerOk: true, pagesOpened: [] as string[] }))
vi.mock("@/lib/enterprise/program-admins", async (orig) => ({
  ...(await orig<typeof import("@/lib/enterprise/program-admins")>()),
  audit: async () => {},
  logNopAdminAction: async () => {},
  programAdminFrom: async () => null,
}))
vi.mock("@/lib/enterprise/nop-enroll-domain", () => ({
  ENROLL_CHECK_AGENT_ID: "858980",
  getCheckAgentId: async () => "858980",
  getEnrollDomain: async () => "neighbor.basicbenefits.com",
  getEnrollTargets: async () => "neighbor.basicbenefits.com",
  getSavedEnrollSettings: async () => (s.enrollSaved ? { forwardTemplate: "https://neighbor.basicbenefits.com/member-enrollment?agent_code={id}", printed: "short", printedTemplate: "join.basicbenefits.com/{id}", programUrl: "https://neighbor.basicbenefits.com/", savedAt: "t", admin: "admin" } : null),
  checkEnrollTargets: async () => ({ ok: s.enrollOk ?? true, checks: [{ url: "https://neighbor.basicbenefits.com/member-enrollment?agent_code=858980", ok: s.enrollOk ?? true, status: null, error: s.enrollOk === false ? "the domain doesn't resolve (no DNS record)" : null }] }),
}))
vi.mock("@/lib/enterprise/nop-enroll-check", () => ({
  checkEnrollPage: async (url: string) => (s.pagesOpened.push(url), s.partnerOk
    ? { url, ok: true, problem: null, text: "Enroll with Jordan" }
    : { url, ok: false, problem: "not_found", text: "Partner Not Found We couldn't find the enrollment portal you're looking for. Return Home" }),
}))
vi.mock("@/lib/admin", () => ({ isAdminSession: async (sub: string | null | undefined) => !!sub && s.admins.has(sub) }))
vi.mock("@/lib/enterprise/nop-render/kit-v2-access", async (orig) => ({
  ...(await orig<typeof import("@/lib/enterprise/nop-render/kit-v2-access")>()),
  getNopFlyerSettings: async () => s.settings,
  setNopFlyerSetting: async (p: unknown) => (s.saved.push(p), s.settings),
  logNopFlyerSettingChange: async (e: unknown) => { s.settingsLog.unshift(e) },
  listNopFlyerSettingsLog: async () => s.settingsLog,
}))
vi.mock("@/lib/enterprise/nop-render/agent-context", () => ({
  loadNopAgent: async () => ({ agentId: "858980", profile: { orgId: "nop", name: "Pat", displayName: "Pat", displayPhone: "1", displayEmail: "a@x.test" }, status: "active", active: true }),
  nopStatusMessageKey: () => "dash.status_missing",
}))
vi.mock("@/lib/enterprise/nop-render/log", () => ({ logNopRender: async (e: unknown) => { s.logged.push(e) } }))
vi.mock("@/lib/enterprise/nop-render/thumb-cache", () => ({ getCachedThumb: async () => null, setCachedThumb: async () => {}, thumbCacheKey: () => "k" }))
vi.mock("@/lib/enterprise/nop-render/render", () => ({
  NOP_DOWNLOAD_FORMATS: ["print", "home", "social"],
  NopRenderError: class extends Error {},
  renderNopFlyer: async (t: string) => (s.rendered.push(t), { body: Buffer.from("x"), contentType: "application/pdf", filename: "f", ms: 1, qr: "q" }),
}))
vi.mock("@/lib/enterprise/nop-render/render-v2", () => ({
  renderNopV2: async (t: string) => (s.rendered.push(t), { body: Buffer.from("x"), contentType: "application/pdf", pagePoints: { w: 612, h: 792 }, usedFonts: [], ms: 1 }),
  renderNopV2ForAgent: async (t: string, size: string, values: Record<string, string>, output: string) => (
    s.rendered.push(`${t}:${size}:${output}`), s.values.push(values),
    { body: Buffer.from("x"), contentType: output === "pdf" ? "application/pdf" : output === "thumb" ? "image/jpeg" : "image/png", pagePoints: { w: 612, h: 792 }, usedFonts: [], ms: 1, qr: "https://oneflyer.org/a/AAAAAAA" }
  ),
}))
vi.mock("@/lib/enterprise/nop-render/kit-v2-release", () => ({
  v2ReleaseFailures: async (lang: string) => (s.releaseChecks++, lang === "ES" ? s.esFailures : []),
}))
vi.mock("@/lib/enterprise/agents-store", async (orig) => ({ ...(await orig<typeof import("@/lib/enterprise/agents-store")>()), getAgentIdOwner: async (id: string) => (id === "858980" ? "agent@x.test" : null) }))
vi.mock("@/lib/enterprise/nop-i18n/server", () => ({ nopLangForRequest: async () => "en" }))

beforeEach(() => { vi.stubEnv("SESSION_SECRET", "test-secret"); s.settings = { agentKit: "v1", spanishV2: false }; s.rendered.length = 0; s.values.length = 0; s.logged.length = 0; s.saved.length = 0; s.enrollOk = true; s.settingsLog.length = 0; s.esFailures = []; s.releaseChecks = 0; s.enrollSaved = true; s.partnerOk = true; s.pagesOpened.length = 0 })
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

describe("agents and kit v2", () => {
  it.each(["NOP2_P1_EN_PRICE", "NOP2_P2_EN_NOPRICE", "NOP2_P1_ES_PRICE", "NOP2_P3_ES_NOPRICE"])("%s: while agents are on kit v1.1.1, render and thumbnail answer 404 unknown_template, nothing rendered", async (id) => {
    for (const fmt of ["preview", "print", "home", "thumb"]) {
      const r = await call(render, "GET", `/api/enterprise/nop/render/${id}?format=${fmt}`, "agent@x.test", { template: id })
      expect(r.status).toBe(404)
      expect(r.json.error).toBe("unknown_template")
    }
    expect((await call(thumb, "GET", `/api/enterprise/nop/thumbnail/${id}`, "agent@x.test", { template: id })).status).toBe(404)
    expect(s.rendered).toEqual([])
  })

  it("kit v1.1.1 still works for agents while it's selected (unchanged)", async () => {
    expect((await call(render, "GET", "/api/enterprise/nop/render/NOP_P1_EN?format=print", "agent@x.test", { template: "NOP_P1_EN" })).status).toBe(200)
  })

  it("switched to v2: English kit v2 through the agent pipeline; print = bleed, home = Letter; no social; logged", async () => {
    s.settings = { agentKit: "v2", spanishV2: false }
    for (const [fmt, want] of [["print", "bleed:pdf"], ["home", "letter:pdf"], ["preview", "letter:preview"], ["thumb", "letter:thumb"]]) {
      const r = await call(render, "GET", `/api/enterprise/nop/render/NOP2_P2_EN_PRICE?format=${fmt}`, "agent@x.test", { template: "NOP2_P2_EN_PRICE" })
      expect(r.status, fmt).toBe(200)
      expect(s.rendered.at(-1)).toBe(`NOP2_P2_EN_PRICE:${want}`)
    }
    // Only the roster-locked values reach the renderer; nothing from the request.
    expect(s.values[0]).toEqual({ agentId: "858980", displayName: "Pat", displayPhone: "1", displayEmail: "a@x.test" })
    expect(s.logged[0]).toMatchObject({ agentId: "858980", account: "agent@x.test", template: "NOP2_P2_EN_PRICE", format: "print", kitVersion: "v2 NOP-P2-EN · 10/2026" })
    expect((await call(render, "GET", "/api/enterprise/nop/render/NOP2_P2_EN_PRICE?format=social", "agent@x.test", { template: "NOP2_P2_EN_PRICE" })).status).toBe(422)
    expect((await call(thumb, "GET", "/api/enterprise/nop/thumbnail/NOP2_P2_EN_PRICE", "agent@x.test", { template: "NOP2_P2_EN_PRICE" })).status).toBe(200)
  })

  it("switched to v2: kit v1.1.1 and Spanish kit v2 (switch off) answer 404 like unknown templates", async () => {
    s.settings = { agentKit: "v2", spanishV2: false }
    for (const id of ["NOP_P1_EN", "NOP_ALL_ES", "NOP2_P1_ES_PRICE"]) {
      expect((await call(render, "GET", `/api/enterprise/nop/render/${id}?format=print`, "agent@x.test", { template: id })).status, id).toBe(404)
      expect((await call(thumb, "GET", `/api/enterprise/nop/thumbnail/${id}`, "agent@x.test", { template: id })).status, id).toBe(404)
    }
    expect(s.rendered).toEqual([])
    s.settings = { agentKit: "v2", spanishV2: true }
    expect((await call(render, "GET", "/api/enterprise/nop/render/NOP2_P1_ES_PRICE?format=print", "agent@x.test", { template: "NOP2_P1_ES_PRICE" })).status).toBe(200)
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

  it("Spanish starts off and can be switched by admin; admin can now move agents to kit v2", async () => {
    expect((await call(settings, "GET", "/x", "admin")).json).toMatchObject({ spanishV2: false, agentKit: "v1", agentAreaReady: true })
    expect((await call(settings, "POST", "/x", "admin", undefined, { spanishV2: true })).status).toBe(200)
    expect((await call(settings, "POST", "/x", "admin", undefined, { agentKit: "v2" })).status).toBe(200)
    expect(s.saved).toEqual([{ spanishV2: true, agentKit: undefined }, { spanishV2: undefined, agentKit: "v2" }])
  })

  it("every change is logged with who, before and after; GET returns the log", async () => {
    s.settings = { agentKit: "v2", spanishV2: false }
    expect((await call(settings, "POST", "/x", "admin", undefined, { agentKit: "v1" })).status).toBe(200)
    expect(s.saved).toEqual([{ spanishV2: undefined, agentKit: "v1" }])
    expect(s.settingsLog[0]).toMatchObject({ admin: "admin", change: { agentKit: "v1" }, before: { agentKit: "v2" } })
    expect((await call(settings, "GET", "/x", "admin")).json.log).toHaveLength(1)
  })

  it("refuses to switch Spanish on while a Spanish flyer fails the release checks, and says which", async () => {
    s.esFailures = [
      { template: "NOP2_P1_ES_PRICE", size: "letter", code: "master_invalid", message: "footer ends 21.796875px below the page bottom" },
      { template: "NOP2_P1_ES_PRICE", size: "bleed", code: "master_invalid", message: "footer ends 21.796875px below the page bottom" },
      { template: "NOP2_P3_ES_NOPRICE", size: "letter", code: "master_invalid", message: "footer ends 1.546875px below the page bottom" },
    ]
    const r = await call(settings, "POST", "/x", "admin", undefined, { spanishV2: true })
    expect(r.status).toBe(409)
    expect(r.json.error).toBe("spanish_v2_fails_release_checks")
    expect(r.json.message).toContain("2 Spanish kit-v2 flyers fail the release checks (NOP2_P1_ES_PRICE, NOP2_P3_ES_NOPRICE")
    expect(r.json.message).toContain("Spanish stays off")
    expect(r.json.failures).toHaveLength(3)
    expect(s.saved).toEqual([])
    expect(s.settingsLog).toEqual([])
  })

  it("refuses to move agents to kit v2 while Spanish is on and a Spanish flyer fails", async () => {
    s.settings = { agentKit: "v1", spanishV2: true }
    s.esFailures = [{ template: "NOP2_P3_ES_PRICE", size: "letter", code: "master_invalid", message: "footer ends 1.546875px below the page bottom" }]
    const r = await call(settings, "POST", "/x", "admin", undefined, { agentKit: "v2" })
    expect(r.status).toBe(409)
    expect(r.json.message).toContain("Turn Spanish off first")
    expect(s.saved).toEqual([])
  })

  it("runs the Spanish check only when Spanish would reach agents; turning it off, or kit v1, is never blocked", async () => {
    s.esFailures = [{ template: "NOP2_P1_ES_PRICE", size: "letter", code: "master_invalid", message: "x" }]
    expect((await call(settings, "POST", "/x", "admin", undefined, { agentKit: "v2" })).status).toBe(200) // Spanish off
    s.settings = { agentKit: "v2", spanishV2: true }
    expect((await call(settings, "POST", "/x", "admin", undefined, { spanishV2: false })).status).toBe(200)
    expect((await call(settings, "POST", "/x", "admin", undefined, { agentKit: "v1" })).status).toBe(200)
    expect((await call(settings, "POST", "/x", "admin", undefined, { spanishV2: true })).status).toBe(200) // already on
    expect(s.releaseChecks).toBe(0)
    s.settings = { agentKit: "v1", spanishV2: false }
    s.esFailures = []
    expect((await call(settings, "POST", "/x", "admin", undefined, { spanishV2: true })).status).toBe(200)
    expect(s.releaseChecks).toBe(1)
  })

  it("refuses to switch agents to kit v2 until the enrollment setting is saved in its three-part form", async () => {
    s.enrollSaved = false
    const r = await call(settings, "POST", "/x", "admin", undefined, { agentKit: "v2" })
    expect(r.status).toBe(409)
    expect(r.json.error).toBe("enroll_setting_not_saved")
    expect(s.pagesOpened).toEqual([])
    expect(s.saved).toEqual([])
  })

  it("refuses to switch agents to kit v2 while the enrollment URLs don't load", async () => {
    s.enrollOk = false
    const r = await call(settings, "POST", "/x", "admin", undefined, { agentKit: "v2" })
    expect(r.status).toBe(409)
    expect(r.json.error).toBe("enroll_url_not_loading")
    expect(r.json.message).toContain("https://neighbor.basicbenefits.com/member-enrollment?agent_code=858980")
    expect(s.saved).toEqual([])
    // Spanish and switching back to v1 aren't held up by it.
    expect((await call(settings, "POST", "/x", "admin", undefined, { agentKit: "v1" })).status).toBe(200)
  })

  it("refuses to switch agents to kit v2 while 858980's forward URL shows 'Partner Not Found', and says what it showed", async () => {
    s.partnerOk = false
    const r = await call(settings, "POST", "/x", "admin", undefined, { agentKit: "v2" })
    expect(r.status).toBe(409)
    expect(r.json.error).toBe("enroll_partner_not_found")
    expect(s.pagesOpened).toEqual(["https://neighbor.basicbenefits.com/member-enrollment?agent_code=858980"])
    expect(r.json.message).toContain("Partner Not Found")
    expect(s.saved).toEqual([])
    s.partnerOk = true
    expect((await call(settings, "POST", "/x", "admin", undefined, { agentKit: "v2" })).status).toBe(200)
    expect(s.saved).toEqual([{ spanishV2: undefined, agentKit: "v2" }])
  })

  it("render-check as a real agent: that agent's own file, every release check, logged under the admin", async () => {
    const r = await call(check, "GET", "/api/admin/enterprise/nop/render-check?template=NOP2_P1_EN_PRICE&format=bleed&agentId=858980", "admin")
    expect(r.status).toBe(200)
    expect(s.rendered).toEqual(["NOP2_P1_EN_PRICE:bleed:pdf"])
    expect(s.values[0]).toEqual({ agentId: "858980", displayName: "Pat", displayPhone: "1" })
    expect(s.logged[0]).toMatchObject({ agentId: "858980", account: "admin:admin", format: "print", kitVersion: "v2 NOP-P1-EN · 10/2026" })
    expect((await call(check, "GET", "/api/admin/enterprise/nop/render-check?template=NOP2_P1_EN_PRICE&format=letter&agentId=111111", "admin")).status).toBe(404)
    expect((await call(check, "GET", "/api/admin/enterprise/nop/render-check?template=NOP2_P1_EN_PRICE&format=letter&agentId=858980", "agent@x.test")).status).toBe(401)
  })
})
