import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { NextRequest } from "next/server"
import { defaultOrgFeatures } from "@/lib/enterprise/portal/features"

/**
 * Phase 2 on the server:
 *  - the public lead form takes leads only for an active Pro/Leader agent with
 *    lead capture on, and only once the consent text is approved (until then:
 *    nothing accepted); consent must be ticked and is stored verbatim;
 *  - leads and results reach only an active Pro/Leader agent; Basic gets no data;
 *  - marking contacted is refused while an admin views as the agent;
 *  - the approved-text and data-move routes are OneFlyer admin only, and a
 *    move needs a preview's counts plus explicit confirmation.
 */

const s = vi.hoisted(() => ({
  tier: "pro", active: true, features: {} as Record<string, boolean>, owner: "agent@x.test" as string | null,
  roster: { status: "active" } as { status: string } | null, consent: { id: "approved-text:nop:leadConsent:en", text: "I agree to be contacted.", version: 3, pending: false },
  saved: [] as { agentId: string; lead: Record<string, unknown> }[], emails: [] as unknown[], leads: [] as unknown[], marked: [] as unknown[],
  admins: new Set(["admin"]), moves: [] as unknown[], moveResult: "ok" as "ok" | "stale",
}))
vi.mock("@/lib/admin", () => ({ isAdminSession: async (sub: string | null | undefined) => !!sub && s.admins.has(sub) }))
vi.mock("@/lib/enterprise/portal/store", () => ({ getAgentTier: async () => s.tier, getOrgFeatures: async () => s.features, touchLastActive: async () => {} }))
vi.mock("@/lib/enterprise/nop-render/agent-context", () => ({
  loadNopAgent: async (email: string) => (email === "agent@x.test" ? { agentId: "858980", profile: { orgId: "nop", name: "Pat Lee", displayName: "Pat Lee", preferredLanguage: "es" }, status: s.active ? "active" : "suspended", active: s.active } : null),
}))
vi.mock("@/lib/enterprise/agents-store", () => ({
  getRosterRecord: async (id: string) => (id === "858980" || id === "858981" ? s.roster : null),
  getAgentIdOwner: async (id: string) => (id === "858980" ? s.owner : null),
}))
vi.mock("@/lib/enterprise/portal/approved-text", async (orig) => ({
  ...(await orig<typeof import("@/lib/enterprise/portal/approved-text")>()),
  getApprovedText: async () => ({ ...s.consent, key: "leadConsent", lang: "en", updatedBy: "admin", updatedAt: "x" }),
  saveApprovedText: async (_o: string, key: string, lang: string, text: string) => ({ key, lang, text }),
}))
vi.mock("@/lib/enterprise/portal/agent-data", () => ({
  saveAgentLead: async (agentId: string, lead: Record<string, unknown>) => void s.saved.push({ agentId, lead }),
  listAgentLeads: async () => s.leads,
  setAgentLeadContacted: async (agentId: string, id: string, c: boolean) => (s.marked.push({ agentId, id, c }), id === "mine" ? { id, contactedAt: c ? "t" : null } : null),
  countAgentLeads: async () => 2,
  getAgentScans: async () => ({ total: 9, thisMonth: 4 }),
  summarizeAgentData: async (id: string) => (id === "111" ? { leads: 2, scans: 5 } : { leads: 0, scans: 0 }),
  moveAgentData: async (admin: string, from: string, to: string, expected: unknown) => (s.moves.push({ admin, from, to, expected }), s.moveResult === "ok" ? { ok: true, move: { admin, from, to, moved: expected, at: "t" } } : { ok: false, reason: "stale" }),
  listAgentDataMoves: async () => s.moves,
}))
vi.mock("@/lib/email", () => ({ sendNopAgentLeadNotification: async (e: unknown) => (s.emails.push(e), { sent: true }) }))
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: async () => ({ allowed: true }), clientIp: () => "1.2.3.4" }))

beforeEach(() => {
  vi.stubEnv("SESSION_SECRET", "test-secret")
  Object.assign(s, { tier: "pro", active: true, features: defaultOrgFeatures(true), owner: "agent@x.test", roster: { status: "active" }, moveResult: "ok" })
  s.consent = { id: "approved-text:nop:leadConsent:en", text: "I agree to be contacted.", version: 3, pending: false }
  for (const a of [s.saved, s.emails, s.marked, s.moves]) a.length = 0
  s.leads = []
})
afterEach(() => vi.unstubAllEnvs())

async function cookieFor(sub: string, viewAs?: string) {
  const { createSessionToken, SESSION_COOKIE } = await import("@/lib/auth")
  const { createViewAsToken, VIEW_AS_COOKIE } = await import("@/lib/enterprise/portal/view-as")
  return `${SESSION_COOKIE}=${await createSessionToken(sub)}${viewAs ? `; ${VIEW_AS_COOKIE}=${await createViewAsToken(sub, viewAs)}` : ""}`
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- route handlers take differently typed contexts
async function call(load: () => Promise<any>, method: string, url: string, opts: { who?: string; viewAs?: string; params?: Record<string, string>; body?: unknown } = {}) {
  const mod = await load()
  const headers: Record<string, string> = { "content-type": "application/json" }
  if (opts.who) headers.cookie = await cookieFor(opts.who, opts.viewAs)
  const res = await mod[method](new NextRequest(`http://x${url}`, { method, headers, ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}) }), opts.params ? { params: Promise.resolve(opts.params) } : undefined)
  return { status: res.status as number, json: await res.json().catch(() => null) }
}

const publicLead = () => import("@/app/api/enterprise/nop/leads/[agentId]/route")
const leadsList = () => import("@/app/api/enterprise/agent/leads/route")
const leadMark = () => import("@/app/api/enterprise/agent/leads/[id]/route")
const results = () => import("@/app/api/enterprise/agent/results/route")
const texts = () => import("@/app/api/admin/enterprise/nop/approved-text/route")
const move = () => import("@/app/api/admin/enterprise/nop/agent-data-move/route")
const good = { name: "Ana Ruiz", phone: "(270) 555-0199", email: "ana@x.test", message: "Call after 5", consent: true, consentVersion: 3, lang: "en" }
const submit = (body: unknown, id = "858980") => call(publicLead, "POST", `/api/enterprise/nop/leads/${id}`, { params: { agentId: id }, body })

describe("public lead form", () => {
  it("an active Pro agent with approved consent: the lead is saved under the Agent ID with the consent shown, and the agent is emailed in their language", async () => {
    expect((await submit(good)).status).toBe(200)
    expect(s.saved).toHaveLength(1)
    expect(s.saved[0].agentId).toBe("858980")
    expect(s.saved[0].lead).toMatchObject({ name: "Ana Ruiz", phone: "(270) 555-0199", email: "ana@x.test", contactedAt: null, consent: { text: "I agree to be contacted.", textId: "approved-text:nop:leadConsent:en", version: 3, lang: "en" } })
    expect(s.emails).toEqual([expect.objectContaining({ to: "agent@x.test", lang: "es", portalUrl: "https://oneflyer.org/agent/leads" })])
  })

  it.each([
    ["a Basic agent", () => { s.tier = "basic" }],
    ["a suspended Pro agent", () => { s.roster = { status: "suspended" }; s.active = false }],
    ["an org with lead capture off", () => { s.features = { ...defaultOrgFeatures(true), leads: false } }],
    ["an Agent ID no account holds", () => { s.owner = null }],
  ])("%s: 404, nothing saved or sent", async (_l, setup) => {
    setup()
    expect((await submit(good)).status).toBe(404)
    expect(s.saved).toEqual([]); expect(s.emails).toEqual([])
  })

  it("an unknown Agent ID: 404", async () => {
    expect((await submit(good, "999999")).status).toBe(404)
  })

  it("while the consent text is the placeholder, nothing is accepted (the page shows Coming soon)", async () => {
    s.consent = { id: "x", text: "[PENDING ORG APPROVAL — consent text]", version: 0, pending: true }
    const r = await submit(good)
    expect(r.status).toBe(409); expect(r.json.error).toBe("coming_soon")
    expect(s.saved).toEqual([])
  })

  it("refuses an unticked box, and consent to an older version of the text", async () => {
    expect((await submit({ ...good, consent: false })).json.error).toBe("consent_required")
    expect((await submit({ ...good, consent: "yes" })).json.error).toBe("consent_required")
    expect((await submit({ ...good, consentVersion: 2 })).json.error).toBe("consent_changed")
    expect(s.saved).toEqual([])
  })

  it("validates fields and answers in the form's language", async () => {
    const r = await submit({ ...good, phone: "12", lang: "es" })
    expect(r.status).toBe(422); expect(r.json.field).toBe("phone"); expect(r.json.message).toBe("Escriba un número de teléfono al que podamos llamar.")
  })

  it("a honeypot hit looks like success and stores nothing", async () => {
    expect((await submit({ ...good, website: "spam.example" })).status).toBe(200)
    expect(s.saved).toEqual([])
  })
})

describe("the agent's leads and results", () => {
  it("Pro: leads and this month's results", async () => {
    s.leads = [{ id: "a" }]
    expect((await call(leadsList, "GET", "/x", { who: "agent@x.test" })).json).toEqual({ leads: [{ id: "a" }] })
    expect((await call(results, "GET", "/x", { who: "agent@x.test" })).json).toMatchObject({ scans: 4, leads: 2 })
  })

  it.each([["Basic", () => { s.tier = "basic" }], ["inactive Pro", () => { s.active = false }]])("%s: 403 and no numbers or leads", async (_l, setup) => {
    setup()
    s.leads = [{ id: "a" }]
    for (const load of [leadsList, results]) {
      const r = await call(load, "GET", "/x", { who: "agent@x.test" })
      expect(r.status).toBe(403); expect(r.json).toEqual({ error: "not_available", feature: expect.any(String) })
    }
  })

  it("marks only their own lead, and never while an admin views as them", async () => {
    expect((await call(leadMark, "PATCH", "/x", { who: "agent@x.test", params: { id: "mine" }, body: { contacted: true } })).status).toBe(200)
    expect((await call(leadMark, "PATCH", "/x", { who: "agent@x.test", params: { id: "other" }, body: { contacted: true } })).status).toBe(404)
    expect(s.marked).toEqual([{ agentId: "858980", id: "mine", c: true }, { agentId: "858980", id: "other", c: true }])
    s.marked.length = 0
    const r = await call(leadMark, "PATCH", "/x", { who: "admin", viewAs: "agent@x.test", params: { id: "mine" }, body: { contacted: true } })
    expect(r.status).toBe(403); expect(r.json.error).toBe("read_only"); expect(s.marked).toEqual([])
  })

  it("an admin viewing as the agent can read their leads", async () => {
    expect((await call(leadsList, "GET", "/x", { who: "admin", viewAs: "agent@x.test" })).status).toBe(200)
  })
})

describe("admin only", () => {
  it("approved text and data moves refuse agents and signed-out visitors", async () => {
    for (const who of ["agent@x.test", undefined]) {
      expect((await call(texts, "GET", "/x", { who })).status).toBe(401)
      expect((await call(texts, "POST", "/x", { who, body: { key: "leadConsent", lang: "en", text: "x" } })).status).toBe(401)
      expect((await call(move, "GET", "/x", { who })).status).toBe(401)
      expect((await call(move, "POST", "/x", { who, body: { from: "111", to: "858980", action: "move", confirm: true, expected: { leads: 2, scans: 5 } } })).status).toBe(401)
    }
    expect(s.moves).toEqual([])
  })

  it("a move: preview shows what will move; it needs confirmation and the previewed counts", async () => {
    const p = await call(move, "POST", "/x", { who: "admin", body: { from: "111", to: "858980", action: "preview" } })
    expect(p.json.from).toMatchObject({ agentId: "111", leads: 2, scans: 5, onRoster: false })
    expect(p.json.to).toMatchObject({ agentId: "858980", onRoster: true, account: "agent@x.test" })
    expect((await call(move, "POST", "/x", { who: "admin", body: { from: "111", to: "858980", action: "move", expected: { leads: 2, scans: 5 } } })).json.error).toBe("confirm_required")
    expect(s.moves).toEqual([])
    const m = await call(move, "POST", "/x", { who: "admin", body: { from: "111", to: "858980", action: "move", confirm: true, expected: { leads: 2, scans: 5 } } })
    expect(m.status).toBe(200)
    expect(s.moves).toEqual([{ admin: "admin", from: "111", to: "858980", expected: { leads: 2, scans: 5 } }])
  })

  it("refuses a target that isn't on the roster, the same ID twice, and a source that changed since the preview", async () => {
    expect((await call(move, "POST", "/x", { who: "admin", body: { from: "111", to: "999999", action: "preview" } })).json.error).toBe("target_not_on_roster")
    expect((await call(move, "POST", "/x", { who: "admin", body: { from: "858980", to: "858980", action: "preview" } })).json.error).toBe("same_id")
    s.moveResult = "stale"
    expect((await call(move, "POST", "/x", { who: "admin", body: { from: "111", to: "858980", action: "move", confirm: true, expected: { leads: 2, scans: 5 } } })).status).toBe(409)
  })
})
