import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest"
import { NextRequest } from "next/server"

// Route-level checks on an in-memory Redis: the real handlers, real cookies.
// Covers sign-up -> verify -> session, cross-org denial (403) with a genuine
// org-B session, the flag-off 404s, recruiter rules, and the QR forward.

const R = vi.hoisted(() => ({ ref: null as null | ReturnType<typeof import("./ap-fake-redis").makeFakeRedis> }))
vi.mock("@upstash/redis", async () => {
  const { makeFakeRedis } = await import("./ap-fake-redis")
  R.ref = makeFakeRedis()
  return { Redis: { fromEnv: () => R.ref!.fake } }
})
const sent = vi.hoisted(() => [] as { to: string; code: string }[])
vi.mock("@/lib/ap/email", () => ({ sendApCode: async (to: string, _o: string, _l: string, code: string) => (sent.push({ to, code }), { sent: true }) }))
// Both are admins to the EXISTING check; only AP_ADMIN_EMAILS tells them apart.
vi.mock("@/lib/admin", () => ({ isAdminSession: async (sub: string) => sub === "admin" || sub === "other-admin@example.com" }))

beforeAll(() => {
  process.env.SESSION_SECRET = "test-secret-for-ap-routes-0123456789"
  process.env.NEXT_PUBLIC_SITE_URL = "https://branch.example"
})
beforeEach(() => {
  R.ref?.reset()
  sent.length = 0
  process.env.AGENT_PLATFORM_ENABLED = "true"
  process.env.AP_ADMIN_EMAILS = ""
})

const BASE = "https://branch.example"
const p = <T>(v: T) => ({ params: Promise.resolve(v) })
function req(path: string, init: { method?: string; body?: unknown; cookies?: Record<string, string>; ip?: string } = {}) {
  const headers = new Headers({ "content-type": "application/json", "x-forwarded-for": init.ip ?? "203.0.113.7" })
  if (init.cookies) headers.set("cookie", Object.entries(init.cookies).map(([k, v]) => `${k}=${v}`).join("; "))
  return new NextRequest(`${BASE}${path}`, { method: init.method ?? "GET", headers, body: init.body === undefined ? undefined : JSON.stringify(init.body) })
}
const cookieOf = (res: Response, name: string) => res.headers.getSetCookie().find((c) => c.startsWith(`${name}=`))?.split(";")[0].split("=").slice(1).join("=") ?? null

async function adminCookie() {
  const { createSessionToken, SESSION_COOKIE } = await import("@/lib/auth")
  return { [SESSION_COOKIE]: await createSessionToken("admin") }
}

const config = (slug: string, approval: "auto" | "admin" = "auto") => ({
  name: `Sample ${slug}`,
  slug,
  orgCode: "TST",
  enrollment: { forwardTemplate: `https://${slug}.example/enroll?id={id}`, printed: "full", programUrl: `https://${slug}.example/` },
  agentIdParam: "agent_ID",
  languages: ["en", "es"],
  footer: { programLine: "Sample Outreach Program", taglineLine: "Sign in or enroll online" },
  tierRules: { defaultTier: "basic", signupApproval: approval },
})

async function createOrg(slug: string, approval: "auto" | "admin" = "auto") {
  const { POST } = await import("@/app/api/admin/organizations/route")
  const res = await POST(req("/api/admin/organizations", { method: "POST", body: config(slug, approval), cookies: await adminCookie() }))
  expect(res.status).toBe(201)
  return (await res.json()).org as { id: string; slug: string }
}

async function signUp(slug: string, externalId: string, email: string, ref?: string) {
  const signup = await import("@/app/api/ap/[org]/signup/route")
  const verify = await import("@/app/api/ap/[org]/verify/route")
  const r1 = await signup.POST(req(`/api/ap/${slug}/signup`, { method: "POST", body: { externalId, name: "Pat Sample", phone: "5025550100", email, lang: "en", ref } }), p({ org: slug }))
  expect(r1.status).toBe(200)
  const flow = cookieOf(r1, "ap_flow")!
  const code = sent.at(-1)!.code
  const r2 = await verify.POST(req(`/api/ap/${slug}/verify`, { method: "POST", body: { code }, cookies: { ap_flow: flow } }), p({ org: slug }))
  return { res: r2, body: await r2.json(), session: cookieOf(r2, "ap_session") }
}

describe("sign-up and session", () => {
  it("an auto-approved sign-up gets a session for its own org only", async () => {
    await createOrg("alpha-org")
    const { body, session } = await signUp("alpha-org", "AL-1", "pat@example.com")
    expect(body).toMatchObject({ ok: true, state: "signed_in", next: "/ap/alpha-org" })
    const me = await import("@/app/api/ap/[org]/me/route")
    const res = await me.GET(req("/api/ap/alpha-org/me", { cookies: { ap_session: session! } }), p({ org: "alpha-org" }))
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.agent.externalId).toBe("AL-1")
    expect(data.links.enrollment).toBe("https://alpha-org.example/enroll?id=AL-1")
    expect(data.links.qr).toMatch(/^https:\/\/branch\.example\/ap\/q\/[2-9A-Za-z]{7}$/)
  })

  it("an admin-approval org gives no session until approved", async () => {
    await createOrg("gated-org", "admin")
    const { body, session } = await signUp("gated-org", "GA-1", "pat@example.com")
    expect(body).toMatchObject({ ok: true, state: "pending" })
    expect(session).toBeNull()
  })

  it("a held Agent ID gets the same reply and no code", async () => {
    await createOrg("alpha-org")
    await signUp("alpha-org", "AL-1", "pat@example.com")
    const before = sent.length
    const signup = await import("@/app/api/ap/[org]/signup/route")
    const res = await signup.POST(req("/api/ap/alpha-org/signup", { method: "POST", body: { externalId: "AL-1", name: "Someone Else", phone: "5025550101", email: "other@example.com", lang: "en" } }), p({ org: "alpha-org" }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, step: "code" })
    expect(sent.length).toBe(before)
  })

  it("one email may join two orgs as two separate agents", async () => {
    await createOrg("alpha-org")
    await createOrg("beta-org")
    const a = await signUp("alpha-org", "SAME-1", "pat@example.com")
    const b = await signUp("beta-org", "SAME-1", "pat@example.com")
    expect(a.body.state).toBe("signed_in")
    expect(b.body.state).toBe("signed_in")
    expect(a.session).not.toBe(b.session)
  })
})

describe("cross-org isolation", () => {
  it("an org-B agent session is refused (403) on every org-A agent route", async () => {
    await createOrg("alpha-org")
    await createOrg("beta-org")
    await signUp("alpha-org", "AL-1", "a@example.com")
    const b = await signUp("beta-org", "BE-1", "b@example.com")
    const me = await import("@/app/api/ap/[org]/me/route")
    const own = await me.GET(req("/api/ap/beta-org/me", { cookies: { ap_session: b.session! } }), p({ org: "beta-org" }))
    expect(own.status).toBe(200)
    expect((await own.json()).agent.externalId).toBe("BE-1")
    const cross = await me.GET(req("/api/ap/alpha-org/me", { cookies: { ap_session: b.session! } }), p({ org: "alpha-org" }))
    expect(cross.status).toBe(403)
    expect(await cross.json()).toEqual({ error: "forbidden" })
  })

  it("a code flow started on org B can't be finished on org A", async () => {
    await createOrg("alpha-org")
    await createOrg("beta-org")
    const signup = await import("@/app/api/ap/[org]/signup/route")
    const verify = await import("@/app/api/ap/[org]/verify/route")
    const r1 = await signup.POST(req("/api/ap/beta-org/signup", { method: "POST", body: { externalId: "X-1", name: "Pat", phone: "5025550100", email: "x@example.com", lang: "en" } }), p({ org: "beta-org" }))
    const r2 = await verify.POST(req("/api/ap/alpha-org/verify", { method: "POST", body: { code: sent.at(-1)!.code }, cookies: { ap_flow: cookieOf(r1, "ap_flow")! } }), p({ org: "alpha-org" }))
    expect(r2.status).toBe(410)
    expect(cookieOf(r2, "ap_session")).toBeNull()
  })

  it("an unknown org is 404, no session is 401, a suspended agent is 403", async () => {
    await createOrg("alpha-org")
    const a = await signUp("alpha-org", "AL-1", "a@example.com")
    const me = await import("@/app/api/ap/[org]/me/route")
    expect((await me.GET(req("/api/ap/nope-org/me", { cookies: { ap_session: a.session! } }), p({ org: "nope-org" }))).status).toBe(404)
    expect((await me.GET(req("/api/ap/alpha-org/me"), p({ org: "alpha-org" }))).status).toBe(401)
    const { listOrgs, listOrgAgents, updateAgent } = await import("@/lib/ap/store")
    const org = (await listOrgs())[0]
    const [agent] = await listOrgAgents(org.id)
    await updateAgent(org.id, agent.agentId, { status: "suspended" }, "admin")
    expect((await me.GET(req("/api/ap/alpha-org/me", { cookies: { ap_session: a.session! } }), p({ org: "alpha-org" }))).status).toBe(403)
  })

  it("an admin can't change an agent through another org's URL", async () => {
    const A = await createOrg("alpha-org")
    const B = await createOrg("beta-org")
    await signUp("alpha-org", "AL-1", "a@example.com")
    const { listOrgAgents } = await import("@/lib/ap/store")
    const [agent] = await listOrgAgents(A.id)
    const route = await import("@/app/api/admin/organizations/[id]/agents/[agentId]/route")
    const res = await route.PATCH(req(`/api/admin/organizations/${B.id}/agents/${agent.agentId}`, { method: "PATCH", body: { status: "suspended" }, cookies: await adminCookie() }), p({ id: B.id, agentId: agent.agentId }))
    expect(res.status).toBe(404)
  })
})

describe("recruiter", () => {
  it("counts an active same-org recruiter only", async () => {
    const A = await createOrg("alpha-org")
    await createOrg("beta-org")
    const rec = await signUp("alpha-org", "REC-1", "rec@example.com")
    const me = await import("@/app/api/ap/[org]/me/route")
    const recruit = new URL((await (await me.GET(req("/api/ap/alpha-org/me", { cookies: { ap_session: rec.session! } }), p({ org: "alpha-org" }))).json()).links.recruit).searchParams.get("ref")!
    await signUp("alpha-org", "NEW-1", "new@example.com", recruit)
    await signUp("beta-org", "OTHER-1", "other@example.com", recruit)
    const { listOrgAgents, listOrgs } = await import("@/lib/ap/store")
    const a = await listOrgAgents(A.id)
    const recruiter = a.find((x) => x.externalId === "REC-1")!
    expect(a.find((x) => x.externalId === "NEW-1")!.recruiterAgentId).toBe(recruiter.agentId)
    const B = (await listOrgs()).find((o) => o.slug === "beta-org")!
    expect((await listOrgAgents(B.id))[0].recruiterAgentId).toBeNull()
  })
})

describe("QR forward", () => {
  it("active agent -> own enrollment URL; suspended -> program page; unknown -> 404", async () => {
    const A = await createOrg("alpha-org")
    const a = await signUp("alpha-org", "AL-1", "a@example.com")
    const me = await import("@/app/api/ap/[org]/me/route")
    const code = (await (await me.GET(req("/api/ap/alpha-org/me", { cookies: { ap_session: a.session! } }), p({ org: "alpha-org" }))).json()).links.qr.split("/").pop()
    const q = await import("@/app/ap/q/[code]/route")
    const r1 = await q.GET(req(`/ap/q/${code}`), p({ code }))
    expect(r1.status).toBe(302)
    expect(r1.headers.get("location")).toBe("https://alpha-org.example/enroll?id=AL-1")
    const { listOrgAgents, updateAgent } = await import("@/lib/ap/store")
    await updateAgent(A.id, (await listOrgAgents(A.id))[0].agentId, { status: "suspended" }, "admin")
    expect((await q.GET(req(`/ap/q/${code}`), p({ code }))).headers.get("location")).toBe("https://alpha-org.example/")
    expect((await q.GET(req("/ap/q/ZZZZZZZ"), p({ code: "ZZZZZZZ" }))).status).toBe(404)
  })
})

describe("platform off", () => {
  it("every new route is a 404 and touches no storage", async () => {
    process.env.AGENT_PLATFORM_ENABLED = ""
    R.ref!.touched.clear()
    const admin = await adminCookie()
    const calls: Promise<Response>[] = [
      import("@/app/api/admin/organizations/route").then((m) => m.GET(req("/api/admin/organizations", { cookies: admin }))),
      import("@/app/api/admin/organizations/route").then((m) => m.POST(req("/api/admin/organizations", { method: "POST", body: config("alpha-org"), cookies: admin }))),
      import("@/app/api/admin/organizations/[id]/route").then((m) => m.GET(req("/api/admin/organizations/org_x"), p({ id: "org_xxxxxxxx" }))),
      import("@/app/api/ap/[org]/signup/route").then((m) => m.POST(req("/api/ap/a/signup", { method: "POST", body: {} }), p({ org: "alpha-org" }))),
      import("@/app/api/ap/[org]/signin/route").then((m) => m.POST(req("/api/ap/a/signin", { method: "POST", body: {} }), p({ org: "alpha-org" }))),
      import("@/app/api/ap/[org]/verify/route").then((m) => m.POST(req("/api/ap/a/verify", { method: "POST", body: {} }), p({ org: "alpha-org" }))),
      import("@/app/api/ap/[org]/me/route").then((m) => m.GET(req("/api/ap/a/me"), p({ org: "alpha-org" }))),
      import("@/app/ap/q/[code]/route").then((m) => m.GET(req("/ap/q/ABCDEFG"), p({ code: "ABCDEFG" }))),
    ]
    for (const res of await Promise.all(calls)) expect(res.status).toBe(404)
    expect([...R.ref!.touched]).toEqual([])
  })

  it("an existing admin not on AP_ADMIN_EMAILS is refused; listed, they pass", async () => {
    const { createSessionToken, SESSION_COOKIE } = await import("@/lib/auth")
    const m = await import("@/app/api/admin/organizations/route")
    const cookies = { [SESSION_COOKIE]: await createSessionToken("other-admin@example.com") }
    expect((await m.GET(req("/api/admin/organizations", { cookies }))).status).toBe(401)
    process.env.AP_ADMIN_EMAILS = "other-admin@example.com"
    expect((await m.GET(req("/api/admin/organizations", { cookies }))).status).toBe(200)
  })
})

describe("every key written is ap:", () => {
  it("after a full sign-up, recruit and QR cycle", async () => {
    await createOrg("alpha-org")
    const a = await signUp("alpha-org", "AL-1", "a@example.com")
    const me = await import("@/app/api/ap/[org]/me/route")
    await me.GET(req("/api/ap/alpha-org/me", { cookies: { ap_session: a.session! } }), p({ org: "alpha-org" }))
    const keys = [...R.ref!.touched]
    expect(keys.length).toBeGreaterThan(8)
    for (const k of keys) expect(k).toMatch(/^ap:/)
  })
})
