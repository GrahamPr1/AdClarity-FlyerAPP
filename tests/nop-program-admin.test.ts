import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { NextRequest } from "next/server"

/**
 * Program admins (Quinn): an emailed-code sign-in at /program, a session of
 * their own that can never pass as a dashboard or owner session, access to
 * the NOP agents routes only (enforced on the server), every action logged
 * with their name, and gone the moment the owner removes them or they sign out.
 */

const r = vi.hoisted(() => ({
  kv: new Map<string, unknown>(),
  hashes: new Map<string, Record<string, unknown>>(),
  lists: new Map<string, unknown[]>(),
  codes: [] as { to: string; code: string }[],
}))
vi.mock("@upstash/redis", () => {
  const fake = {
    get: async (k: string) => r.kv.get(k) ?? null,
    set: async (k: string, v: unknown, o?: { nx?: boolean }) => { if (o?.nx && r.kv.has(k)) return null; r.kv.set(k, v); return "OK" },
    del: async (...ks: string[]) => ks.reduce((n, k) => n + (r.kv.delete(k) ? 1 : 0), 0),
    incr: async (k: string) => { const n = Number(r.kv.get(k) ?? 0) + 1; r.kv.set(k, n); return n },
    decr: async (k: string) => { const n = Number(r.kv.get(k) ?? 0) - 1; r.kv.set(k, n); return n },
    expire: async () => 1,
    hget: async (k: string, f: string) => r.hashes.get(k)?.[f] ?? null,
    hgetall: async (k: string) => r.hashes.get(k) ?? null,
    hset: async (k: string, v: Record<string, unknown>) => void r.hashes.set(k, { ...(r.hashes.get(k) ?? {}), ...v }),
    hdel: async (k: string, f: string) => { const h = r.hashes.get(k); if (!h || !(f in h)) return 0; delete h[f]; return 1 },
    lpush: async (k: string, v: unknown) => r.lists.set(k, [v, ...(r.lists.get(k) ?? [])]).get(k)!.length,
    lrange: async (k: string, a: number, b: number) => (r.lists.get(k) ?? []).slice(a, b === -1 ? undefined : b + 1),
  }
  return { Redis: { fromEnv: () => fake } }
})
vi.mock("@/lib/email", () => ({ sendAgentVerificationCode: async (to: string, code: string) => (r.codes.push({ to, code }), true) }))
vi.mock("@vercel/functions", () => ({ waitUntil: (p: Promise<unknown>) => p }))
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: async () => ({ allowed: true, retryAfterSeconds: 0 }), clientIp: () => "1.2.3.4" }))
vi.mock("@/lib/admin", () => ({ isAdminSession: async (sub: string | null | undefined) => sub === "owner@x.test" }))

const QUINN = "quinn.pearl@basicbenefits.com"
beforeEach(() => {
  vi.stubEnv("SESSION_SECRET", "test-secret")
  r.kv.clear(); r.hashes.clear(); r.lists.clear(); r.codes.length = 0
})
afterEach(() => vi.unstubAllEnvs())

const pa = () => import("@/lib/enterprise/program-admins")
async function session(sub: string) {
  const { createSessionToken, SESSION_COOKIE } = await import("@/lib/auth")
  return `${SESSION_COOKIE}=${await createSessionToken(sub)}`
}
const req = (url: string, init: { method?: string; cookie?: string; body?: unknown } = {}) =>
  new NextRequest(`http://x${url}`, { method: init.method ?? "GET", headers: { "content-type": "application/json", ...(init.cookie ? { cookie: init.cookie } : {}) }, ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}) })
const cookieOf = (res: Response, name: string) => res.headers.getSetCookie().map((c) => c.split(";")[0]).find((c) => c.startsWith(`${name}=`)) ?? ""

/** Signs Quinn in through the real routes; returns his program-admin cookie. */
async function signInQuinn(): Promise<string> {
  const { PROGRAM_ADMIN_COOKIE, PROGRAM_ADMIN_FLOW_COOKIE } = await pa()
  const signin = await (await import("@/app/api/program-admin/signin/route")).POST(req("/api/program-admin/signin", { method: "POST", body: { email: QUINN } }))
  const flow = cookieOf(signin, PROGRAM_ADMIN_FLOW_COOKIE)
  const verify = await (await import("@/app/api/program-admin/verify/route")).POST(req("/api/program-admin/verify", { method: "POST", cookie: flow, body: { code: r.codes.at(-1)!.code } }))
  expect(verify.status).toBe(200)
  return cookieOf(verify, PROGRAM_ADMIN_COOKIE)
}

describe("sign-in", () => {
  it("a listed program admin gets a code and a session; anyone else gets the same reply and no code", async () => {
    const { addProgramAdmin, programAdminFrom } = await pa()
    await addProgramAdmin(QUINN, "Quinn Pearl", "owner@x.test")
    const other = await (await import("@/app/api/program-admin/signin/route")).POST(req("/x", { method: "POST", body: { email: "someone@x.test" } }))
    expect(await other.json()).toEqual({ ok: true, step: "code" })
    expect(r.codes).toEqual([])
    const cookie = await signInQuinn()
    expect(r.codes.map((c) => c.to)).toEqual([QUINN])
    expect((await programAdminFrom(req("/x", { cookie })))?.name).toBe("Quinn Pearl")
  })

  it("its session never passes as a dashboard session, nor a dashboard session as it", async () => {
    const { addProgramAdmin, PROGRAM_ADMIN_COOKIE, programAdminFrom } = await pa()
    await addProgramAdmin(QUINN, "Quinn Pearl", "owner@x.test")
    const cookie = await signInQuinn()
    const { SESSION_COOKIE, verifySessionToken } = await import("@/lib/auth")
    expect(await verifySessionToken(cookie.split("=")[1])).toBeNull()
    const forged = `${PROGRAM_ADMIN_COOKIE}=${(await session(QUINN)).split("=")[1]}`
    expect(await programAdminFrom(req("/x", { cookie: forged }))).toBeNull()
    expect(SESSION_COOKIE).not.toBe(PROGRAM_ADMIN_COOKIE)
  })

  it("removing the program admin, or signing out, ends the session at once", async () => {
    const { addProgramAdmin, removeProgramAdmin, programAdminFrom } = await pa()
    await addProgramAdmin(QUINN, "Quinn Pearl", "owner@x.test")
    let cookie = await signInQuinn()
    await (await import("@/app/api/program-admin/signout/route")).POST(req("/x", { method: "POST", cookie }))
    expect(await programAdminFrom(req("/x", { cookie }))).toBeNull()
    await new Promise((res) => setTimeout(res, 5))
    cookie = await signInQuinn()
    expect(await programAdminFrom(req("/x", { cookie }))).not.toBeNull()
    await removeProgramAdmin(QUINN, "owner@x.test")
    expect(await programAdminFrom(req("/x", { cookie }))).toBeNull()
  })
})

describe("what a program admin can reach (server-side)", () => {
  it("the NOP routes accept him; the owner too; an agent or nobody gets 401", async () => {
    const { addProgramAdmin, requireNopAdmin } = await pa()
    await addProgramAdmin(QUINN, "Quinn Pearl", "owner@x.test")
    const quinn = await signInQuinn()
    expect(await requireNopAdmin(req("/x", { cookie: quinn }))).toEqual({ admin: QUINN, name: "Quinn Pearl", role: "program" })
    expect(await requireNopAdmin(req("/x", { cookie: await session("owner@x.test") }))).toEqual({ admin: "owner@x.test", name: null, role: "owner" })
    expect("response" in (await requireNopAdmin(req("/x", { cookie: await session("agent@x.test") })))).toBe(true)
    expect("response" in (await requireNopAdmin(req("/x")))).toBe(true)
  })

  it("owner-only and SMB admin routes refuse him (he has no dashboard session)", async () => {
    const { addProgramAdmin } = await pa()
    await addProgramAdmin(QUINN, "Quinn Pearl", "owner@x.test")
    const cookie = await signInQuinn()
    const { requireAdmin } = await import("@/lib/enterprise/portal/admin")
    expect("response" in (await requireAdmin(req("/x", { cookie })))).toBe(true)
    const { GET } = await import("@/app/api/admin/program-admins/route")
    expect((await GET(req("/api/admin/program-admins", { cookie }))).status).toBe(401)
    const { getSessionIdentity } = await import("@/lib/auth")
    expect(await getSessionIdentity(req("/x", { cookie }))).toBeNull()
  })

  it("he can switch only the NOP org's features, and it's logged with his name", async () => {
    const { addProgramAdmin, listNopAdminActions } = await pa()
    await addProgramAdmin(QUINN, "Quinn Pearl", "owner@x.test")
    const cookie = await signInQuinn()
    const { POST } = await import("@/app/api/admin/enterprise/features/route")
    expect((await POST(req("/x", { method: "POST", cookie, body: { orgId: "other-org", feature: "leads", enabled: true } }))).status).toBe(404)
    expect((await POST(req("/x", { method: "POST", cookie, body: { orgId: "nop", feature: "leads", enabled: false } }))).status).toBe(200)
    expect((await listNopAdminActions())[0]).toMatchObject({ actor: QUINN, actorName: "Quinn Pearl", role: "program", action: "org_feature", detail: "leads off" })
  })
})

describe("view as agent", () => {
  it("works with the program admin's own session and the exit goes back to /program; someone else's view-as cookie doesn't", async () => {
    const { addProgramAdmin, PROGRAM_ADMIN_COOKIE } = await pa()
    await addProgramAdmin(QUINN, "Quinn Pearl", "owner@x.test")
    const quinn = await signInQuinn()
    const { createViewAsToken, VIEW_AS_COOKIE, resolvePortalViewer } = await import("@/lib/enterprise/portal/view-as")
    const mine = `${quinn}; ${VIEW_AS_COOKIE}=${await createViewAsToken(QUINN, "agent@x.test")}`
    expect(await resolvePortalViewer(req("/x", { cookie: mine }))).toEqual({ email: "agent@x.test", viewAs: { admin: QUINN, from: "program" } })
    const owners = `${quinn}; ${VIEW_AS_COOKIE}=${await createViewAsToken("owner@x.test", "agent@x.test")}`
    expect(await resolvePortalViewer(req("/x", { cookie: owners }))).toBeNull()
    expect(PROGRAM_ADMIN_COOKIE).toBe("nop_program_admin")
  })
})

describe("managing program admins", () => {
  it("owner only; adds and removes are logged", async () => {
    const route = await import("@/app/api/admin/program-admins/route")
    const owner = await session("owner@x.test")
    expect((await route.POST(req("/x", { method: "POST", cookie: owner, body: { email: QUINN, name: "Quinn Pearl" } }))).status).toBe(200)
    expect((await route.POST(req("/x", { method: "POST", cookie: await session("agent@x.test"), body: { email: "x@x.test", name: "X" } }))).status).toBe(401)
    expect((await (await route.GET(req("/x", { cookie: owner }))).json()).admins).toEqual([expect.objectContaining({ email: QUINN, name: "Quinn Pearl", addedBy: "owner@x.test" })])
    await route.DELETE(req("/x", { method: "DELETE", cookie: owner, body: { email: QUINN } }))
    const { listNopAdminActions } = await pa()
    expect((await listNopAdminActions()).map((a) => a.action)).toEqual(["program_admin.remove", "program_admin.add"])
  })
})
