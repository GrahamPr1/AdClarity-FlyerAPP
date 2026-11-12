import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { NextRequest } from "next/server"
import { defaultOrgFeatures, entitlements, portalTabs, type AgentTier } from "@/lib/enterprise/portal/features"
import type { PortalContext } from "@/lib/enterprise/portal/context"
import type { LeadRecord } from "@/lib/types"

/**
 * Phase 4, follow-up messages:
 *  - only an active Pro/Leader agent whose org has follow-ups on gets any;
 *  - each is the org's approved text (first line subject, rest message), filled
 *    in with the agent's and lead's details, in the language the lead used;
 *  - a message still on its placeholder has no button;
 *  - links only open the agent's own apps (sms:/mailto:), nothing is sent;
 *  - the admin save refuses a message without a subject line and body, or with
 *    an unknown fill-in.
 */

const s = vi.hoisted(() => ({ texts: {} as Record<string, string>, tier: "pro", active: true, features: {} as Record<string, boolean>, leads: [] as unknown[] }))
vi.mock("@/lib/enterprise/program-admins", async (orig) => ({
  ...(await orig<typeof import("@/lib/enterprise/program-admins")>()),
  audit: async () => {},
  logNopAdminAction: async () => {},
  programAdminFrom: async () => null,
}))
vi.mock("@/lib/enterprise/nop-enroll-domain", () => ({ getEnrollDomain: async () => "neighbor.basicbenefits.com", getEnrollTargets: async () => "neighbor.basicbenefits.com" }))
vi.mock("@/lib/enterprise/portal/approved-text", async (orig) => {
  const real = await orig<typeof import("@/lib/enterprise/portal/approved-text")>()
  return {
    ...real,
    getApprovedText: async (_o: string, key: string, lang: string) => {
      const text = s.texts[`${key}:${lang}`] ?? real.APPROVED_TEXT_PLACEHOLDER[key as keyof typeof real.APPROVED_TEXT_PLACEHOLDER]
      return { id: `approved-text:nop:${key}:${lang}`, key, lang, text, version: 1, pending: real.isPendingText(text), updatedBy: "admin", updatedAt: "x" }
    },
    saveApprovedText: async (_o: string, key: string, lang: string, text: string) => ({ key, lang, text }),
  }
})
vi.mock("@/lib/admin", () => ({ isAdminSession: async (sub: string | null | undefined) => sub === "admin" }))
vi.mock("@/lib/enterprise/portal/store", () => ({ getAgentTier: async () => s.tier, getOrgFeatures: async () => s.features, touchLastActive: async () => {} }))
vi.mock("@/lib/enterprise/nop-render/agent-context", () => ({
  loadNopAgent: async (email: string) => (email === "agent@x.test" ? { agentId: "858980", profile: agentProfile, status: s.active ? "active" : "suspended", active: s.active } : null),
}))
vi.mock("@/lib/enterprise/portal/agent-data", () => ({ listAgentLeads: async () => s.leads }))

const agentProfile = { orgId: "nop", name: "Pat Lee", displayName: "Pat Lee", displayPhone: "(270) 555-0100", displayEmail: "pat@x.test", phone: "", email: "", licenseStates: [], preferredLanguage: "en" as const }
const EN1 = "Following up, {lead_first_name}\nHi {lead_first_name}, it's {agent_first_name}. Enroll here: {enroll_url}\nCall me at {agent_phone} & we'll talk."

beforeEach(() => {
  vi.stubEnv("SESSION_SECRET", "test-secret")
  Object.assign(s, { texts: {}, tier: "pro", active: true, features: defaultOrgFeatures(true), leads: [] })
})
afterEach(() => vi.unstubAllEnvs())

const lib = () => import("@/lib/enterprise/portal/follow-ups")
const lead = (over: Partial<LeadRecord> = {}): LeadRecord => ({ id: "l1", flyerId: "nop-agent:858980", code: "k7Q2mXp", name: "Ana María Ruiz", phone: "(270) 555-0199", email: "ana@x.test", message: null, createdAt: "2026-11-01T00:00:00Z", ...over })
function ctx(tier: AgentTier = "pro", active = true, features = defaultOrgFeatures(true)): PortalContext {
  const base = { tier, orgFeatures: features, active }
  return { email: "agent@x.test", agent: { agentId: "858980", profile: agentProfile } as unknown as PortalContext["agent"], orgId: "nop", orgName: "NOP", ...base, can: entitlements(base), tabs: portalTabs(base) }
}

describe("admin text check", () => {
  it("subject line + message + known fill-ins: ok; blank: ok (placeholder back)", async () => {
    const { checkFollowUpText } = await lib()
    expect(checkFollowUpText(EN1)).toEqual({ ok: true })
    expect(checkFollowUpText("  ")).toEqual({ ok: true })
  })
  it("refuses a single line (no message) and unknown fill-ins", async () => {
    const { checkFollowUpText } = await lib()
    expect(checkFollowUpText("Just one line {lead_name}").ok).toBe(false)
    const r = checkFollowUpText("Subject\nHi {first_name}, {lead_name}")
    expect(r.ok).toBe(false)
    expect(!r.ok && r.message).toContain("{first_name}")
  })
})

describe("filling in and links", () => {
  it("fills every field; sms and mailto carry the encoded text; nothing else is in the link", async () => {
    s.texts = { "followUp1:en": EN1 }
    const out = await (await lib()).followUpsForLeads(ctx(), [lead()])
    expect(out.l1).toHaveLength(1)
    const f = out.l1[0]
    expect(f.subject).toBe("Following up, Ana")
    expect(f.body).toBe("Hi Ana, it's Pat. Enroll here: https://neighbor.basicbenefits.com/858980\nCall me at (270) 555-0100 & we'll talk.")
    expect(f.sms).toBe(`sms:2705550199?&body=${encodeURIComponent(f.body)}`)
    expect(f.mailto).toBe(`mailto:ana%40x.test?subject=${encodeURIComponent(f.subject)}&body=${encodeURIComponent(f.body)}`)
    expect(decodeURIComponent(f.sms.split("body=")[1])).toBe(f.body)
  })

  it("a lead with no email: Messages only", async () => {
    s.texts = { "followUp1:en": EN1 }
    expect((await (await lib()).followUpsForLeads(ctx(), [lead({ email: null })])).l1[0].mailto).toBeNull()
  })

  it("placeholders have no button; numbering follows the message slot", async () => {
    s.texts = { "followUp3:en": "S3\nThird {lead_name}" }
    const out = await (await lib()).followUpsForLeads(ctx(), [lead()])
    expect(out.l1.map((f) => f.n)).toEqual([3])
    expect(JSON.stringify(out)).not.toContain("PENDING")
  })

  it("in the language the lead used on the form; the agent's language when unknown; nothing if that language is still placeholder", async () => {
    s.texts = { "followUp1:en": EN1, "followUp1:es": "Seguimiento\nHola {lead_first_name}" }
    const consentEs = { text: "x", textId: "x", version: 1, lang: "es" as const, at: "t" }
    const out = await (await lib()).followUpsForLeads(ctx(), [lead({ id: "es", consent: consentEs }), lead({ id: "none" })])
    expect(out.es[0]).toMatchObject({ lang: "es", body: "Hola Ana" })
    expect(out.none[0]).toMatchObject({ lang: "en", subject: "Following up, Ana" })
    s.texts = { "followUp1:en": EN1 }
    expect((await (await lib()).followUpsForLeads(ctx(), [lead({ id: "es", consent: consentEs })])).es).toEqual([])
  })

  it.each([
    ["Basic", ctx("basic")],
    ["suspended Pro", ctx("pro", false)],
    ["follow-ups switched off", ctx("pro", true, { ...defaultOrgFeatures(true), followUps: false })],
  ])("%s: none at all", async (_l, c) => {
    s.texts = { "followUp1:en": EN1 }
    expect(await (await lib()).followUpsForLeads(c, [lead()])).toEqual({})
  })

  it("Leader: same as Pro", async () => {
    s.texts = { "followUp1:en": EN1 }
    expect((await (await lib()).followUpsForLeads(ctx("leader"), [lead()])).l1).toHaveLength(1)
  })
})

async function cookieFor(sub: string) {
  const { createSessionToken, SESSION_COOKIE } = await import("@/lib/auth")
  return `${SESSION_COOKIE}=${await createSessionToken(sub)}`
}
async function call(path: string, method: string, who: string, body?: unknown) {
  const mod = path === "texts" ? await import("@/app/api/admin/enterprise/nop/approved-text/route") : await import("@/app/api/enterprise/agent/leads/route")
  const req = new NextRequest(`http://x/api`, { method, headers: { "content-type": "application/json", cookie: await cookieFor(who) }, ...(body ? { body: JSON.stringify(body) } : {}) })
  const res = await (mod as unknown as Record<string, (r: NextRequest) => Promise<Response>>)[method](req)
  return { status: res.status, json: await res.json().catch(() => null) }
}

describe("routes", () => {
  it("admin save: a follow-up with an unknown fill-in or no message is 422; a good one saves; agents can't save at all", async () => {
    expect((await call("texts", "POST", "admin", { key: "followUp1", lang: "en", text: "S\nHi {nme}" })).status).toBe(422)
    expect((await call("texts", "POST", "admin", { key: "followUp2", lang: "es", text: "Solo una línea" })).status).toBe(422)
    expect((await call("texts", "POST", "admin", { key: "followUp1", lang: "en", text: EN1 })).status).toBe(200)
    expect([401, 403]).toContain((await call("texts", "POST", "agent@x.test", { key: "followUp1", lang: "en", text: EN1 })).status)
  })

  it("admin list: the three follow-up slots in both languages, with fill-in help", async () => {
    const r = await call("texts", "GET", "admin")
    const rows = r.json.texts.filter((t: { key: string }) => t.key.startsWith("followUp"))
    expect(rows).toHaveLength(6)
    expect(rows[0].help).toContain("{lead_first_name}")
  })

  it("leads API: follow-ups for an active Pro agent; none once the org switches them off", async () => {
    s.texts = { "followUp1:en": EN1 }
    s.leads = [lead()]
    expect((await call("leads", "GET", "agent@x.test")).json.followUps.l1).toHaveLength(1)
    s.features = { ...defaultOrgFeatures(true), followUps: false }
    expect((await call("leads", "GET", "agent@x.test")).json.followUps).toEqual({})
  })
})
