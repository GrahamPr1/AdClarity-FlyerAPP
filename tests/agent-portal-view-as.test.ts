import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { NextRequest } from "next/server"

/**
 * "View as agent": a signed, read-only cookie; never the agent's session.
 * Every agent write route refuses while the cookie is present, before it
 * reads or writes anything. Read routes accept an admin's own valid cookie.
 */

const r = vi.hoisted(() => ({ calls: [] as string[], admins: new Set<string>(["admin"]) }))
vi.mock("@/lib/enterprise/program-admins", async (orig) => ({
  ...(await orig<typeof import("@/lib/enterprise/program-admins")>()),
  audit: async () => {},
  logNopAdminAction: async () => {},
  programAdminFrom: async () => null,
}))
vi.mock("@upstash/redis", () => {
  const record = (name: string) => async (...args: unknown[]) => { r.calls.push(`${name} ${String(args[0])}`); return null }
  const fake = new Proxy({}, { get: (_t, name: string) => (name === "then" ? undefined : name === "pipeline" || name === "multi" ? () => fake : record(name)) })
  return { Redis: { fromEnv: () => fake } }
})
vi.mock("@/lib/admin", () => ({ isAdminSession: async (sub: string | null | undefined) => !!sub && r.admins.has(sub) }))

beforeEach(() => { r.calls.length = 0; vi.stubEnv("SESSION_SECRET", "test-secret-for-view-as") })
afterEach(() => vi.unstubAllEnvs())

async function sessionCookie(sub: string) {
  const { createSessionToken, SESSION_COOKIE } = await import("@/lib/auth")
  return `${SESSION_COOKIE}=${await createSessionToken(sub)}`
}
async function viewAsCookie(admin: string, agent: string) {
  const { createViewAsToken, VIEW_AS_COOKIE } = await import("@/lib/enterprise/portal/view-as")
  return `${VIEW_AS_COOKIE}=${await createViewAsToken(admin, agent)}`
}
const req = (url: string, init: { method?: string; cookie?: string; body?: unknown } = {}) =>
  new NextRequest(`http://x${url}`, {
    method: init.method ?? "GET",
    headers: { ...(init.cookie ? { cookie: init.cookie } : {}), "content-type": "application/json" },
    ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
  })

describe("the view-as token", () => {
  it("verifies when untouched, and refuses tampering, expiry, and a session token", async () => {
    const { createViewAsToken, verifyViewAsToken } = await import("@/lib/enterprise/portal/view-as")
    const { createSessionToken, verifySessionToken } = await import("@/lib/auth")
    const token = await createViewAsToken("admin", "agent@x.test", 1_000)
    expect(await verifyViewAsToken(token, 2_000)).toMatchObject({ admin: "admin", agent: "agent@x.test" })
    expect(await verifyViewAsToken(token, 1_000 + 60 * 60 * 1000 + 1)).toBeNull()
    const [body, sig] = token.split(".")
    const forged = Buffer.from(JSON.stringify({ kind: "view-as", admin: "admin", agent: "other@x.test", exp: 9e15 })).toString("base64url")
    expect(await verifyViewAsToken(`${forged}.${sig}`)).toBeNull()
    expect(await verifyViewAsToken(`${body}.${sig}x`)).toBeNull()
    // Neither token can stand in for the other.
    expect(await verifyViewAsToken(await createSessionToken("agent@x.test"))).toBeNull()
    expect(await verifySessionToken(token)).toBeNull()
  })
})

describe("who a portal request is for", () => {
  it("an agent: themselves; an admin with their own cookie: that agent, read-only", async () => {
    const { resolvePortalViewer } = await import("@/lib/enterprise/portal/view-as")
    expect(await resolvePortalViewer(req("/", { cookie: await sessionCookie("agent@x.test") }))).toEqual({ email: "agent@x.test", viewAs: null })
    const cookie = `${await sessionCookie("admin")}; ${await viewAsCookie("admin", "agent@x.test")}`
    expect(await resolvePortalViewer(req("/", { cookie }))).toEqual({ email: "agent@x.test", viewAs: { admin: "admin", from: "admin" } })
  })

  it("an admin without the cookie, or with another admin's cookie, is nobody", async () => {
    const { resolvePortalViewer } = await import("@/lib/enterprise/portal/view-as")
    r.admins.add("staff@oneflyer.test")
    expect(await resolvePortalViewer(req("/", { cookie: await sessionCookie("admin") }))).toBeNull()
    const cookie = `${await sessionCookie("staff@oneflyer.test")}; ${await viewAsCookie("admin", "agent@x.test")}`
    expect(await resolvePortalViewer(req("/", { cookie }))).toBeNull()
  })

  it("an agent holding a view-as cookie stays themselves (and can't write, below)", async () => {
    const { resolvePortalViewer } = await import("@/lib/enterprise/portal/view-as")
    const cookie = `${await sessionCookie("agent@x.test")}; ${await viewAsCookie("admin", "victim@x.test")}`
    expect(await resolvePortalViewer(req("/", { cookie }))).toEqual({ email: "agent@x.test", viewAs: null })
  })
})

describe("every agent write route refuses while the cookie is present", () => {
  const ROUTES: [string, () => Promise<Record<string, (req: NextRequest, ctx?: unknown) => Promise<Response | undefined>>>, string, string, unknown][] = [
    ["profile save", () => import("@/app/api/enterprise/nop/agent-profile/route"), "PATCH", "/api/enterprise/nop/agent-profile", { displayName: "Hacked" }],
    ["language save", () => import("@/app/api/enterprise/nop/language/route"), "POST", "/api/enterprise/nop/language", { lang: "es" }],
    ["registration start", () => import("@/app/api/enterprise/nop/access/start/route"), "POST", "/api/enterprise/nop/access/start", { agentId: "1", email: "a@x.test" }],
    ["registration verify", () => import("@/app/api/enterprise/nop/access/verify/route"), "POST", "/api/enterprise/nop/access/verify", { code: "123456" }],
    ["registration confirm", () => import("@/app/api/enterprise/nop/access/confirm/route"), "POST", "/api/enterprise/nop/access/confirm", {}],
    ["registration resend", () => import("@/app/api/enterprise/nop/access/resend/route"), "POST", "/api/enterprise/nop/access/resend", {}],
    ["code sign-in", () => import("@/app/api/enterprise/nop/access/signin/route"), "POST", "/api/enterprise/nop/access/signin", { email: "a@x.test" }],
  ]

  it.each(ROUTES)("%s: 403 read_only, nothing read or written", async (_name, load, method, url, body) => {
    const mod = await load()
    const cookie = `${await sessionCookie("admin")}; ${await viewAsCookie("admin", "agent@x.test")}`
    const res = (await mod[method](req(url, { method, cookie, body })))!
    expect(res.status).toBe(403)
    expect((await res.json()).error).toBe("read_only")
    expect(r.calls).toEqual([])
  })

  it.each(ROUTES)("%s: refused on the cookie's mere presence, even a junk one in an agent's own browser", async (_name, load, method, url, body) => {
    const mod = await load()
    const res = (await mod[method](req(url, { method, cookie: `${await sessionCookie("agent@x.test")}; oneflyer_view_as=junk`, body })))!
    expect(res.status).toBe(403)
    expect(r.calls).toEqual([])
  })
})
