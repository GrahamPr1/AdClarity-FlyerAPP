import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextRequest } from "next/server"
import { defaultOrgFeatures, entitlements, portalTabs } from "@/lib/enterprise/portal/features"
import type { PrintRequest, RosterRecord } from "@/lib/types"

/**
 * Phase 8. Print requests on the existing flow (print-requests:{email},
 * Requested / Fulfilled / Cancelled): Pro agents, the kit's own flyers only,
 * not an order; admins list them, mark them, and download the print file.
 * The monthly results email: active Pro agents whose org has it on, last
 * month (Eastern), once per month, opt-out in the profile, nothing for an
 * empty month; admins can only dry-run it.
 */

const r = vi.hoisted(() => ({
  kv: new Map<string, unknown>(),
  lists: new Map<string, unknown[]>(),
  prints: new Map<string, PrintRequest[]>(),
  roster: new Map<string, RosterRecord & { lockedTo: string | null }>(),
  tiers: new Map<string, string>(),
  profiles: new Map<string, Record<string, unknown>>(),
  features: {} as Record<string, boolean>,
  as: "pro@x.test",
  viewingAs: false,
  scans: new Map<string, number>(),
  leads: new Map<string, { createdAt: string; eventId?: string }[]>(),
  mails: [] as Record<string, unknown>[],
  mailFails: false,
  admin: true,
  audits: [] as string[],
}))
vi.mock("@upstash/redis", () => {
  const fake = {
    get: async (k: string) => r.kv.get(k) ?? null,
    set: async (k: string, v: unknown, o?: { nx?: boolean }) => { if (o?.nx && r.kv.has(k)) return null; r.kv.set(k, v); return "OK" },
    del: async (...ks: string[]) => ks.reduce((n, k) => n + (r.kv.delete(k) ? 1 : 0), 0),
    lpush: async (k: string, v: unknown) => r.lists.set(k, [v, ...(r.lists.get(k) ?? [])]).get(k)!.length,
    ltrim: async () => "OK",
    lrange: async (k: string, a: number, b: number) => (r.lists.get(k) ?? []).slice(a, b === -1 ? undefined : b + 1),
  }
  return { Redis: { fromEnv: () => fake } }
})
vi.mock("@/lib/store", () => ({
  getPrintRequestsForEmail: async (e: string) => r.prints.get(e) ?? [],
  seedPrintRequest: async (e: string, p: PrintRequest) => void r.prints.set(e, [...(r.prints.get(e) ?? []), p]),
  updatePrintRequestStatus: async (e: string, id: string, status: PrintRequest["status"]) => {
    const p = (r.prints.get(e) ?? []).find((x) => x.id === id)
    if (!p) return false
    p.status = status
    return true
  },
  getAgentProfile: async (e: string) => r.profiles.get(e) ?? null,
}))
vi.mock("@/lib/enterprise/agents-store", () => ({ listRoster: async () => [...r.roster.values()] }))
vi.mock("@/lib/enterprise/nop-render/kit-v2-access", () => ({
  getNopFlyerSettings: async () => ({ agentKit: "v1", spanishV2: false }),
  agentMaySeeTemplate: (_t: string, s: { agentKit: string }, v1: boolean) => (v1 ? s.agentKit === "v1" : false),
}))
vi.mock("@/lib/enterprise/portal/context", () => ({
  loadPortalContext: async (email: string) => {
    const rec = [...r.roster.values()].find((x) => x.lockedTo === email)
    if (!rec) return null
    const base = { tier: r.tiers.get(email) ?? "basic", orgFeatures: r.features, active: rec.status === "active" }
    return { email, agent: { agentId: rec.agentId, profile: { displayName: rec.agentName, name: rec.agentName, preferredLanguage: "es" } }, orgId: "nop", orgName: "NOP", ...base, can: entitlements(base as never), tabs: portalTabs(base as never) }
  },
}))
vi.mock("@/lib/enterprise/portal/api", async () => {
  const { loadPortalContext } = await import("@/lib/enterprise/portal/context")
  const { canUse } = await import("@/lib/enterprise/portal/features")
  return {
    requireAgentFeature: async (_req: unknown, feature: string) => {
      const ctx = await loadPortalContext(r.as)
      if (!ctx || !canUse(ctx as never, feature as never)) return { response: Response.json({ error: "not_available" }, { status: 403 }) }
      return { viewer: {}, ctx }
    },
  }
})
vi.mock("@/lib/enterprise/portal/view-as", () => ({ rejectWhileViewingAs: () => (r.viewingAs ? Response.json({ error: "read_only" }, { status: 403 }) : null) }))
vi.mock("@/lib/enterprise/nop-i18n/server", () => ({ nopLangForRequest: async () => "en" }))
vi.mock("@/lib/enterprise/portal/agent-data", () => ({
  getAgentScans: async (id: string) => ({ total: 99, thisMonth: r.scans.get(id) ?? 0 }),
  listAgentLeads: async (id: string) => r.leads.get(id) ?? [],
}))
vi.mock("@/lib/enterprise/portal/recruiting", () => ({ listRecruits: async () => [{ signedUpAt: "2026-10-20T15:00:00Z" }, { signedUpAt: "2026-09-20T15:00:00Z" }] }))
vi.mock("@/lib/email", () => ({ sendMonthlyResults: async (i: Record<string, unknown>) => (r.mailFails ? { sent: false, reason: "down" } : (r.mails.push(i), { sent: true })) }))
vi.mock("@/lib/enterprise/program-admins", () => ({
  requireNopAdmin: async () => (r.admin ? { admin: "quinn@x.test", name: "Quinn", role: "program" } : { response: Response.json({ error: "Unauthorized" }, { status: 401 }) }),
  audit: async (_w: unknown, a: string, d: string) => void r.audits.push(`${a} ${d}`),
}))

const agent = (agentId: string, email: string, name: string, tier: string, status: RosterRecord["status"] = "active") => {
  r.roster.set(agentId, { agentId, companyName: "", agentName: name, rosterEmail: email, rosterPhone: "", referralCode: "", enrollmentUrl: "", enrollmentUrlMismatch: false, status, importedAt: "", lockedTo: email })
  r.tiers.set(email, tier)
}

beforeEach(() => {
  for (const m of [r.kv, r.lists, r.prints, r.roster, r.tiers, r.profiles, r.scans, r.leads]) m.clear()
  r.mails.length = 0; r.audits.length = 0; r.mailFails = false; r.admin = true; r.viewingAs = false; r.as = "pro@x.test"
  r.features = { ...defaultOrgFeatures(true), printRequests: true, monthlyEmail: true, events: true, recruiting: true }
  agent("100001", "pro@x.test", "Pat Pro", "pro")
  agent("100002", "basic@x.test", "Bea Basic", "basic")
  agent("100003", "gone@x.test", "Gil Gone", "pro", "terminated")
  r.scans.set("100001", 12)
  r.leads.set("100001", [{ createdAt: "2026-10-03T12:00:00Z" }, { createdAt: "2026-10-31T23:00:00Z", eventId: "e1" }, { createdAt: "2026-11-01T05:30:00Z" }])
})

const req = (method: string, body?: unknown) => new NextRequest("http://x/api", { method, headers: { "content-type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) })
const good = { template: "NOP_P2_EN", quantity: 100, shippingName: "Pat Pro", shippingAddress: "1 Main St\nBowling Green, KY", notes: "" }

describe("print requests", () => {
  it("a Pro agent requests one of the kit's flyers; it's queued as Requested on the existing flow", async () => {
    const { POST, GET } = await import("@/app/api/enterprise/agent/print-requests/route")
    const res = await POST(req("POST", good))
    expect(res.status).toBe(201)
    expect(r.prints.get("pro@x.test")).toEqual([expect.objectContaining({ flyerId: "NOP_P2_EN", flyerTitle: "Package 2 · Complete Virtual Care", quantity: 100, status: "Requested", notes: null })])
    expect((await (await GET(req("GET"))).json()).requests).toHaveLength(1)
  })

  it("checks the flyer, quantity and address; Basic, switch off and admins viewing are refused", async () => {
    const { POST } = await import("@/app/api/enterprise/agent/print-requests/route")
    expect((await (await POST(req("POST", { ...good, template: "NOP2_P1_EN_PRICE" }))).json()).field).toBe("template")
    expect((await (await POST(req("POST", { ...good, quantity: 501 }))).json()).field).toBe("quantity")
    expect((await (await POST(req("POST", { ...good, shippingAddress: " " }))).json()).field).toBe("shippingAddress")
    r.viewingAs = true
    expect((await POST(req("POST", good))).status).toBe(403)
    r.viewingAs = false
    r.features.printRequests = false
    expect((await POST(req("POST", good))).status).toBe(403)
    r.features.printRequests = true
    r.as = "basic@x.test"
    expect((await POST(req("POST", good))).status).toBe(403)
    expect(r.prints.size).toBe(0)
  })

  it("admins see every agent's requests (not business ones) and mark them; logged", async () => {
    const { POST } = await import("@/app/api/enterprise/agent/print-requests/route")
    await POST(req("POST", good))
    r.prints.get("pro@x.test")!.push({ id: "smb-1", flyerId: "flyer-abc", flyerTitle: "Spring sale", quantity: 10, shippingName: "x", shippingAddress: "y", notes: null, status: "Requested", createdAt: "2026-01-01" })
    const admin = await import("@/app/api/admin/enterprise/nop/print-requests/route")
    const list = (await (await admin.GET(req("GET"))).json()).requests
    expect(list).toEqual([expect.objectContaining({ agentId: "100001", agentName: "Pat Pro", email: "pro@x.test", flyerId: "NOP_P2_EN" })])
    expect((await admin.POST(req("POST", { email: "pro@x.test", id: list[0].id, status: "Fulfilled" }))).status).toBe(200)
    expect(r.prints.get("pro@x.test")![0].status).toBe("Fulfilled")
    expect((await admin.POST(req("POST", { email: "pro@x.test", id: "smb-1", status: "Fulfilled" }))).status).toBe(404)
    expect(r.audits).toEqual([`print_request.status ${list[0].id} for pro@x.test: Fulfilled`])
    r.admin = false
    expect((await admin.GET(req("GET"))).status).toBe(401)
  })
})

describe("monthly results email", () => {
  const job = () => import("@/lib/enterprise/portal/monthly-email")
  const DEC1 = new Date("2026-12-01T15:00:00Z")

  it("last month in Eastern time", async () => {
    const { previousMonth } = await job()
    expect(previousMonth(DEC1)).toBe("2026-11")
    expect(previousMonth(new Date("2027-01-01T15:00:00Z"))).toBe("2026-12")
    expect(previousMonth(new Date("2026-11-01T03:00:00Z"))).toBe("2026-09") // still 31 Oct in Eastern
  })

  it("active Pro agents with the switch on, in their language, last month's numbers (leads and RSVPs split; Eastern month edges)", async () => {
    const { runMonthlyEmail } = await job()
    const run = await runMonthlyEmail({ live: true, by: "monthly job", now: new Date("2026-11-01T15:00:00Z") })
    expect(run).toMatchObject({ month: "2026-10", eligible: 1, sent: 1, failed: 0 })
    expect(r.mails).toEqual([expect.objectContaining({ to: "pro@x.test", lang: "es", month: "2026-10", results: { scans: 12, leads: 1, rsvps: 1, recruits: 1 } })])
  })

  it("never twice in a month; a failed send is retried next run", async () => {
    const { runMonthlyEmail } = await job()
    r.mailFails = true
    expect(await runMonthlyEmail({ live: true, by: "x", now: DEC1 })).toMatchObject({ failed: 1, sent: 0 })
    r.mailFails = false
    expect(await runMonthlyEmail({ live: true, by: "x", now: DEC1 })).toMatchObject({ sent: 1 })
    expect(await runMonthlyEmail({ live: true, by: "x", now: DEC1 })).toMatchObject({ sent: 0, already: 1 })
  })

  it("opted out, nothing to report, switch off: no email; a dry run sends nothing", async () => {
    const { runMonthlyEmail } = await job()
    expect(await runMonthlyEmail({ live: false, by: "admin", now: DEC1 })).toMatchObject({ mode: "dry_run", eligible: 1, sent: 0 })
    expect(r.mails).toEqual([])
    r.profiles.set("pro@x.test", { monthlyEmail: false })
    expect(await runMonthlyEmail({ live: true, by: "x", now: DEC1 })).toMatchObject({ optedOut: 1, sent: 0 })
    r.profiles.clear()
    r.scans.clear(); r.leads.clear()
    r.features.recruiting = false
    expect(await runMonthlyEmail({ live: true, by: "x", now: DEC1 })).toMatchObject({ nothingToReport: 1, sent: 0 })
    r.features.monthlyEmail = false
    expect(await runMonthlyEmail({ live: true, by: "x", now: DEC1 })).toMatchObject({ eligible: 0, nothingToReport: 0 })
  })

  it("admins can only dry-run it", async () => {
    const admin = await import("@/app/api/admin/enterprise/nop/monthly-email/route")
    const res = await (await admin.POST(req("POST"))).json()
    expect(res.run).toMatchObject({ mode: "dry_run", by: "quinn@x.test" })
    expect(r.mails).toEqual([])
  })

  it("the cron route needs the secret", async () => {
    vi.stubEnv("CRON_SECRET", "s")
    const { GET } = await import("@/app/api/cron/nop-monthly-email/route")
    expect((await GET(new NextRequest("http://x"))).status).toBe(401)
    vi.unstubAllEnvs()
  })
})

describe("wording", () => {
  it("print and monthly strings: no income or money claims, no 'Basic Benefits' (EN and ES)", async () => {
    const { en } = await import("@/lib/enterprise/nop-i18n/en")
    const { es } = await import("@/lib/enterprise/nop-i18n/es")
    const banned = /\b(earn\w*|income|money|commission\w*|bonus\w*|profit\w*|cash|ganar|gane|ganancia\w*|ingreso\w*|dinero|comisi[oó]n\w*|bono\w*)\b/i
    const keys = (Object.keys(en) as (keyof typeof en)[]).filter((k) => k.startsWith("print.") || k.startsWith("monthly."))
    for (const k of keys) {
      expect(banned.test(en[k]) || banned.test(es[k as keyof typeof es]), k).toBe(false)
      expect(/basic benefits/i.test(en[k] + es[k as keyof typeof es]), k).toBe(false)
    }
  })
})
