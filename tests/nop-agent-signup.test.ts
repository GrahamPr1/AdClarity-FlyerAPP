import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { NextRequest } from "next/server"

/**
 * Agent self sign-up (no imported roster needed):
 *  - Get started takes Agent ID, name, phone, email, language; the email is
 *    proven with the usual code; the agent is NOT signed in;
 *  - a free ID becomes a "pending" roster record (source self) that gets
 *    nothing until approved, and can't sign in;
 *  - an ID already held or on the roster gives exactly the same replies
 *    ("we'll review"), creates nothing, and is flagged for admin;
 *  - admin approves (active, emailed a sign-in link) or rejects (removed, the
 *    ID free again, emailed without a reason); both logged;
 *  - phone and email edit freely; a name change waits for approval.
 */

const r = vi.hoisted(() => ({
  kv: new Map<string, unknown>(),
  sets: new Map<string, Set<string>>(),
  lists: new Map<string, unknown[]>(),
  hashes: new Map<string, Record<string, unknown>>(),
  codes: [] as { to: string; code: string; purpose: string }[],
  decisions: [] as { to: string; approved: boolean; lang: string; signInUrl: string; name: string }[],
}))
vi.mock("@upstash/redis", () => {
  const set = (k: string) => r.sets.get(k) ?? (r.sets.set(k, new Set()), r.sets.get(k)!)
  const fake = {
    get: async (k: string) => r.kv.get(k) ?? null,
    set: async (k: string, v: unknown, o?: { nx?: boolean }) => {
      if (o?.nx && r.kv.has(k)) return null
      r.kv.set(k, v)
      return "OK"
    },
    del: async (...ks: string[]) => ks.reduce((n, k) => n + (r.kv.delete(k) ? 1 : 0), 0),
    mget: async (...ks: string[]) => ks.map((k) => r.kv.get(k) ?? null),
    exists: async (...ks: string[]) => ks.filter((k) => r.kv.has(k)).length,
    incr: async (k: string) => { const n = Number(r.kv.get(k) ?? 0) + 1; r.kv.set(k, n); return n },
    decr: async (k: string) => { const n = Number(r.kv.get(k) ?? 0) - 1; r.kv.set(k, n); return n },
    expire: async () => 1,
    sadd: async (k: string, ...m: string[]) => m.filter((x) => !set(k).has(x) && set(k).add(x)).length,
    srem: async (k: string, ...m: string[]) => m.filter((x) => set(k).delete(x)).length,
    smembers: async (k: string) => [...set(k)],
    lpush: async (k: string, v: unknown) => r.lists.set(k, [v, ...(r.lists.get(k) ?? [])]).get(k)!.length,
    lrange: async (k: string, a: number, b: number) => (r.lists.get(k) ?? []).slice(a, b === -1 ? undefined : b + 1),
    hget: async (k: string, f: string) => r.hashes.get(k)?.[f] ?? null,
    hgetall: async (k: string) => r.hashes.get(k) ?? null,
    hset: async (k: string, v: Record<string, unknown>) => void r.hashes.set(k, { ...(r.hashes.get(k) ?? {}), ...v }),
    // The two Lua scripts the agent store uses: compare-and-delete, and the admin unlock.
    eval: async (script: string, keys: string[], args: string[]) => {
      if (r.kv.get(keys[0]) !== args[0]) return script.includes("stale") ? "stale" : 0
      r.kv.delete(keys[0])
      if (keys[1]) r.kv.delete(keys[1])
      return script.includes("stale") ? "ok" : 1
    },
  }
  return { Redis: { fromEnv: () => fake } }
})
vi.mock("@/lib/email", () => ({
  sendAgentVerificationCode: async (to: string, code: string, _p: string, _l: string, purpose: string) => (r.codes.push({ to, code, purpose }), true),
  sendAgentSignupDecision: async (i: { to: string; approved: boolean; lang: string; signInUrl: string; name: string }) => (r.decisions.push(i), { sent: true }),
}))
vi.mock("@vercel/functions", () => ({ waitUntil: (p: Promise<unknown>) => p }))
vi.mock("@/lib/enterprise/access-http", async (orig) => ({ ...(await orig<typeof import("@/lib/enterprise/access-http")>()), accessRateLimit: async () => null }))
vi.mock("@/lib/admin", () => ({ isAdminSession: async (sub: string | null | undefined) => sub === "admin@x.test" }))
vi.mock("@/lib/enterprise/nop-enroll-domain", () => ({ getEnrollDomain: async () => "join.basicbenefits.com" }))

beforeEach(() => {
  vi.stubEnv("SESSION_SECRET", "test-secret")
  r.kv.clear(); r.sets.clear(); r.lists.clear(); r.hashes.clear(); r.codes.length = 0; r.decisions.length = 0
})
afterEach(() => vi.unstubAllEnvs())

type Res = { status: number; json: Record<string, unknown>; cookies: Record<string, string> }
const ROUTES = {
  start: () => import("@/app/api/enterprise/nop/access/start/route"),
  verify: () => import("@/app/api/enterprise/nop/access/verify/route"),
  signin: () => import("@/app/api/enterprise/nop/access/signin/route"),
  signups: () => import("@/app/api/admin/enterprise/nop/signups/route"),
  profile: () => import("@/app/api/enterprise/nop/agent-profile/route"),
}
async function call(route: keyof typeof ROUTES, method: string, body: unknown, cookie = ""): Promise<Res> {
  const mod = (await ROUTES[route]()) as unknown as Record<string, (r: NextRequest) => Promise<Response>>
  const req = new NextRequest("http://x/api", { method, headers: { "content-type": "application/json", cookie }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) })
  const res = await mod[method](req)
  const cookies: Record<string, string> = {}
  for (const c of res.headers.getSetCookie()) { const [kv] = c.split(";"); const [k, v] = kv.split("="); cookies[k] = v }
  return { status: res.status, json: await res.json().catch(() => ({})), cookies }
}
async function asUser(sub: string) {
  const { createSessionToken, SESSION_COOKIE } = await import("@/lib/auth")
  return `${SESSION_COOKIE}=${await createSessionToken(sub)}`
}
const details = (over: Record<string, string> = {}) => ({ agentId: "990777", email: "new@x.test", name: "Rosa  Diaz", phone: "270-555-0177", lang: "es", ...over })

/** Get started -> code -> verify. Returns both replies and the session cookie, if any. */
async function signUp(over: Record<string, string> = {}) {
  const start = await call("start", "POST", details(over))
  const sent = r.codes.at(-1)
  const verify = await call("verify", "POST", { code: sent?.code ?? "000000" }, `nop_flow=${start.cookies.nop_flow}`)
  return { start, verify, sent }
}

describe("signing up", () => {
  it("a free ID: code to the typed email; then 'submitted', not signed in; a pending record that gets nothing", async () => {
    const { start, verify, sent } = await signUp()
    expect(start.status).toBe(200)
    expect(start.json).toMatchObject({ step: "code", sentTo: "n***@x.test" })
    expect(sent).toMatchObject({ to: "new@x.test", purpose: "register" })
    expect(verify).toMatchObject({ status: 200, json: { ok: true, step: "submitted" } })
    const { SESSION_COOKIE } = await import("@/lib/auth")
    expect(SESSION_COOKIE in verify.cookies).toBe(false)
    expect(verify.cookies.nop_flow).toBe("")
    const { getRosterRecord, getAgentIdOwner } = await import("@/lib/enterprise/agents-store")
    expect(await getRosterRecord("990777")).toMatchObject({ status: "pending", source: "self", agentName: "Rosa Diaz", rosterPhone: "(270) 555-0177", rosterEmail: "new@x.test", signupLang: "es" })
    expect(await getAgentIdOwner("990777")).toBe("new@x.test")
    const { isGenerationStatus } = await import("@/lib/enterprise/nop-roster")
    expect(isGenerationStatus(await getRosterRecord("990777"))).toBe(false)
    // No OneFlyer account date yet (a rejected email must be able to sign up again).
    expect(r.kv.has("client:new@x.test:createdAt")).toBe(false)
  })

  it("name and phone are required and checked", async () => {
    const res = await call("start", "POST", details({ name: " ", phone: "123" }))
    expect(res.status).toBe(422)
    expect(Object.keys(res.json.fields as object).sort()).toEqual(["name", "phone"])
    expect(r.codes).toEqual([])
  })

  it("an ID already held: identical replies, nothing created or changed, flagged for admin", async () => {
    await signUp()
    const before = JSON.stringify([...r.kv.entries()].filter(([k]) => /^(roster|agent-id|agent-account)/.test(k)))
    const second = await signUp({ email: "someone@x.test", name: "Someone Else" })
    expect(second.start.status).toBe(200)
    expect(second.start.json).toMatchObject({ step: "code" })
    expect(second.verify).toMatchObject({ status: 200, json: { ok: true, step: "submitted" } })
    expect(JSON.stringify([...r.kv.entries()].filter(([k]) => /^(roster|agent-id|agent-account)/.test(k)))).toBe(before)
    const flags = r.lists.get("agent-flags:nop") as { type: string; agentId: string; attemptedEmail: string; heldBy: string }[]
    expect(flags[0]).toMatchObject({ type: "signup_duplicate", agentId: "990777", attemptedEmail: "someone@x.test", heldBy: "new@x.test" })
  })

  it("an ID on an imported roster under another email: same neutral replies, flagged, roster untouched", async () => {
    const { importRoster, getRosterRecord } = await import("@/lib/enterprise/agents-store")
    await importRoster([{ agentId: "858980", companyName: "C", agentName: "Quinn Pearl", rosterEmail: "quinn@x.test", rosterPhone: "(270) 555-0100", referralCode: "", enrollmentUrl: "", enrollmentUrlMismatch: false, status: "active" }])
    const { start, verify } = await signUp({ agentId: "858980", email: "intruder@x.test" })
    expect(start.json).toMatchObject({ step: "code" })
    expect(verify.json).toMatchObject({ step: "submitted" })
    expect((await getRosterRecord("858980"))?.rosterEmail).toBe("quinn@x.test")
    expect((r.lists.get("agent-flags:nop") as { type: string }[])[0].type).toBe("signup_duplicate")
  })

  it("an imported roster agent with their roster email still gets the original confirm flow", async () => {
    const { importRoster } = await import("@/lib/enterprise/agents-store")
    await importRoster([{ agentId: "858980", companyName: "C", agentName: "Quinn Pearl", rosterEmail: "quinn@x.test", rosterPhone: "(270) 555-0100", referralCode: "", enrollmentUrl: "", enrollmentUrlMismatch: false, status: "active" }])
    const { verify } = await signUp({ agentId: "858980", email: "quinn@x.test" })
    expect(verify.json).toMatchObject({ step: "confirm", agentId: "858980", agentName: "Quinn Pearl" })
  })

  it("a pending sign-up can't sign in: the neutral reply, and no code sent", async () => {
    await signUp()
    r.codes.length = 0
    const res = await call("signin", "POST", { email: "new@x.test" })
    expect(res.json).toMatchObject({ ok: true, step: "code" })
    expect(r.codes).toEqual([])
  })
})

describe("admin approval", () => {
  it("lists pending sign-ups; approve: active, emailed a sign-in link in their language, logged; then they can sign in", async () => {
    await signUp()
    const admin = await asUser("admin@x.test")
    const list = await call("signups", "GET", undefined, admin)
    expect(list.json.signups).toEqual([expect.objectContaining({ agentId: "990777", name: "Rosa Diaz", email: "new@x.test", lang: "es", nameFits: true })])
    const res = await call("signups", "POST", { agentId: "990777", action: "approve" }, admin)
    expect(res.status).toBe(200)
    const { getRosterRecord } = await import("@/lib/enterprise/agents-store")
    expect(await getRosterRecord("990777")).toMatchObject({ status: "active", approvedBy: "admin@x.test" })
    expect(r.decisions).toEqual([expect.objectContaining({ to: "new@x.test", approved: true, lang: "es", signInUrl: expect.stringMatching(/\/agent\/sign-in$/) })])
    expect((r.lists.get("nop-signups:log") as { admin: string; action: string }[])[0]).toMatchObject({ admin: "admin@x.test", action: "approve" })
    r.codes.length = 0
    await call("signin", "POST", { email: "new@x.test" })
    expect(r.codes).toEqual([expect.objectContaining({ to: "new@x.test", purpose: "signin" })])
    expect((await call("signups", "POST", { agentId: "990777", action: "approve" }, admin)).status).toBe(409)
  })

  it("reject: removed, the ID and email free again, emailed without a reason, logged", async () => {
    await signUp()
    const admin = await asUser("admin@x.test")
    expect((await call("signups", "POST", { agentId: "990777", action: "reject" }, admin)).status).toBe(200)
    const { getRosterRecord, getAgentIdOwner, getAccountAgentId } = await import("@/lib/enterprise/agents-store")
    expect(await getRosterRecord("990777")).toBeNull()
    expect(await getAgentIdOwner("990777")).toBeNull()
    expect(await getAccountAgentId("new@x.test")).toBeNull()
    expect(r.decisions[0]).toMatchObject({ approved: false, lang: "es" })
    expect((r.lists.get("nop-signups:log") as { action: string; name: string }[])[0]).toMatchObject({ action: "reject", name: "Rosa Diaz" })
    const again = await signUp()
    expect(again.verify.json).toMatchObject({ step: "submitted" })
    expect((await getRosterRecord("990777"))?.status).toBe("pending")
  })

  it("non-admins can't list or decide", async () => {
    await signUp()
    const agent = await asUser("new@x.test")
    expect((await call("signups", "GET", undefined, agent)).status).toBe(401)
    expect((await call("signups", "POST", { agentId: "990777", action: "approve" }, agent)).status).toBe(401)
  })
})

describe("profile changes after approval", () => {
  it("phone and email save at once; a name change waits for approval, then applies (or is dropped)", async () => {
    await signUp()
    const admin = await asUser("admin@x.test")
    await call("signups", "POST", { agentId: "990777", action: "approve" }, admin)
    const agent = await asUser("new@x.test")
    const res = await call("profile", "PATCH", { displayName: "Rosa M. Diaz", displayPhone: "(270) 555-0199", displayEmail: "rosa@x.test" }, agent)
    expect(res.status).toBe(200)
    expect(res.json.profile).toMatchObject({ displayName: "Rosa Diaz", displayPhone: "(270) 555-0199", displayEmail: "rosa@x.test", pendingName: { name: "Rosa M. Diaz" } })
    const list = await call("signups", "GET", undefined, admin)
    expect(list.json.nameChanges).toEqual([expect.objectContaining({ agentId: "990777", currentName: "Rosa Diaz", requestedName: "Rosa M. Diaz" })])
    await call("signups", "POST", { agentId: "990777", action: "approve_name" }, admin)
    const { getAgentProfile } = await import("@/lib/store")
    expect(await getAgentProfile("new@x.test")).toMatchObject({ displayName: "Rosa M. Diaz", name: "Rosa M. Diaz", pendingName: null })
    // A second request, rejected: the approved name stays.
    await call("profile", "PATCH", { displayName: "Someone Else", displayPhone: "(270) 555-0199", displayEmail: "rosa@x.test" }, agent)
    await call("signups", "POST", { agentId: "990777", action: "reject_name" }, admin)
    expect(await getAgentProfile("new@x.test")).toMatchObject({ displayName: "Rosa M. Diaz", pendingName: null })
    expect((r.lists.get("nop-signups:log") as { action: string }[]).map((l) => l.action)).toEqual(["reject_name", "approve_name", "approve"])
  })

  it("a requested name that may not fit the kit-v2 footer is flagged for admin", async () => {
    await signUp()
    await call("signups", "POST", { agentId: "990777", action: "approve" }, await asUser("admin@x.test"))
    await call("profile", "PATCH", { displayName: "Maria Guadalupe Hernandez-Villanueva de la Cruz Rodriguez", displayPhone: "(270) 555-0177", displayEmail: "new@x.test" }, await asUser("new@x.test"))
    expect((r.lists.get("agent-flags:nop") as { type: string }[])[0].type).toBe("name_too_long_for_footer")
  })
})
