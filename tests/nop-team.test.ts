import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextRequest } from "next/server"
import { defaultOrgFeatures, entitlements, portalTabs } from "@/lib/enterprise/portal/features"
import type { RosterRecord } from "@/lib/types"

/**
 * The Leader team dashboard (Phase 7): the Leader's recruits, with activity
 * COUNTS for approved members only (never lead details); "Send to team" puts
 * one of the program's flyers on each approved member's Home, in their
 * language, while the Leader is an active Leader with the team switch on.
 */

const r = vi.hoisted(() => ({
  kv: new Map<string, unknown>(),
  lists: new Map<string, unknown[]>(),
  z: new Map<string, Map<string, number>>(),
  roster: new Map<string, RosterRecord>(),
  owners: new Map<string, string>(),
  tiers: new Map<string, string>(),
  features: {} as Record<string, boolean>,
  renders: new Map<string, { format: string }[]>(),
  leads: new Map<string, number>(),
  lastActive: new Map<string, string>(),
  viewingAs: false,
  as: "leader@x.test",
}))
vi.mock("@upstash/redis", () => {
  const zs = (k: string) => r.z.get(k) ?? (r.z.set(k, new Map()), r.z.get(k)!)
  const fake = {
    get: async (k: string) => r.kv.get(k) ?? null,
    set: async (k: string, v: unknown) => (r.kv.set(k, v), "OK"),
    del: async (...ks: string[]) => ks.reduce((n, k) => n + ((r.kv.delete(k) || r.lists.delete(k)) ? 1 : 0), 0),
    rpush: async (k: string, ...v: unknown[]) => r.lists.set(k, [...(r.lists.get(k) ?? []), ...v]).get(k)!.length,
    lrange: async (k: string, a: number, b: number) => (r.lists.get(k) ?? []).slice(a, b === -1 ? undefined : b + 1),
    zadd: async (k: string, e: { score: number; member: string }) => (zs(k).set(e.member, e.score), 1),
    zrange: async (k: string, _a: number, _b: number, o?: { rev?: boolean }) => {
      const ids = [...zs(k).entries()].sort((x, y) => x[1] - y[1]).map(([m]) => m)
      return o?.rev ? ids.reverse() : ids
    },
  }
  return { Redis: { fromEnv: () => fake } }
})
vi.mock("@/lib/enterprise/agents-store", () => ({
  getRosterRecord: async (id: string) => r.roster.get(id) ?? null,
  getAgentIdOwner: async (id: string) => r.owners.get(id) ?? null,
}))
vi.mock("@/lib/enterprise/nop-render/log", () => ({ listNopRenders: async ({ agentId }: { agentId: string }) => r.renders.get(agentId) ?? [] }))
vi.mock("@/lib/enterprise/portal/agent-data", () => ({ countAgentLeads: async (id: string) => r.leads.get(id) ?? 0 }))
vi.mock("@/lib/enterprise/portal/store", () => ({ getLastActive: async (emails: string[]) => emails.map((e) => r.lastActive.get(e) ?? null) }))
vi.mock("@/lib/enterprise/nop-render/kit-v2-access", () => ({ getNopFlyerSettings: async () => ({}), agentFlyerKit: () => ({ kit: "v1", spanish: true }) }))
vi.mock("@/lib/enterprise/portal/context", () => ({
  loadPortalContext: async (email: string) => {
    const agentId = [...r.owners.entries()].find(([, e]) => e === email)?.[0]
    const rec = agentId ? r.roster.get(agentId) : null
    if (!agentId || !rec) return null
    const base = { tier: r.tiers.get(email) ?? "basic", orgFeatures: r.features, active: rec.status === "active" }
    return { email, agent: { agentId, profile: { displayName: rec.agentName, name: rec.agentName } }, orgId: "nop", orgName: "NOP", ...base, can: entitlements(base as never), tabs: portalTabs(base as never) }
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

const agent = (agentId: string, email: string, name: string, tier: string, status: RosterRecord["status"] = "active", recruitedBy?: string) => {
  r.roster.set(agentId, { agentId, companyName: "", agentName: name, rosterEmail: email, rosterPhone: "", referralCode: "", enrollmentUrl: "", enrollmentUrlMismatch: false, status, importedAt: "2026-11-01T00:00:00Z", source: "self", ...(recruitedBy ? { recruitedBy, recruitedAt: "2026-11-02T00:00:00Z" } : {}) })
  r.owners.set(agentId, email)
  r.tiers.set(email, tier)
  if (recruitedBy) {
    const k = `nop-agent:${recruitedBy}:recruits`
    if (!r.z.has(k)) r.z.set(k, new Map())
    r.z.get(k)!.set(agentId, r.z.get(k)!.size + 1)
  }
}

beforeEach(() => {
  for (const m of [r.kv, r.lists, r.z, r.roster, r.owners, r.tiers, r.renders, r.leads, r.lastActive]) m.clear()
  r.features = { ...defaultOrgFeatures(true), recruiting: true, team: true }
  r.viewingAs = false; r.as = "leader@x.test"
  agent("100001", "leader@x.test", "Lee Leader", "leader")
  agent("200001", "ana@x.test", "Ana Active", "basic", "active", "100001")
  agent("200002", "pia@x.test", "Pia Pending", "basic", "pending", "100001")
  agent("200003", "ida@x.test", "Ida Inactive", "pro", "terminated", "100001")
  r.renders.set("200001", [{ format: "print" }, { format: "social" }, { format: "preview" }])
  r.leads.set("200001", 4)
  r.lastActive.set("ana@x.test", "2026-11-09T15:00:00Z")
})

const team = () => import("@/lib/enterprise/portal/team")

describe("the team list", () => {
  it("recruits with status; counts (downloads, leads, last active) for approved members only", async () => {
    const members = await (await team()).listTeam("100001")
    const by = Object.fromEntries(members.map((m) => [m.agentId, m]))
    expect(by["200001"]).toMatchObject({ name: "Ana Active", status: "approved", activity: { flyersMade: 2, leads: 4, lastActive: "2026-11-09T15:00:00Z" } })
    expect(by["200002"]).toMatchObject({ status: "pending", activity: null })
    expect(by["200003"]).toMatchObject({ status: "inactive", activity: null })
    // Counts only: nothing that could carry a lead's details.
    expect(JSON.stringify(members)).not.toMatch(/phone|email|consent|message/i)
  })

  it("the API: Leaders get it; Pro agents and the team switch off get 403", async () => {
    const { GET } = await import("@/app/api/enterprise/agent/team/route")
    expect((await (await GET(new NextRequest("http://x"))).json()).members).toHaveLength(3)
    r.features.team = false
    expect((await GET(new NextRequest("http://x"))).status).toBe(403)
    r.features.team = true
    r.tiers.set("leader@x.test", "pro")
    expect((await GET(new NextRequest("http://x"))).status).toBe(403)
  })
})

describe("send to team", () => {
  it("only the kit's own flyers; the member gets it in their language", async () => {
    const { checkPick, pickTemplate } = await team()
    const v1 = { kit: "v1", spanish: true } as const, v2 = { kit: "v2", spanish: false } as const
    expect(checkPick({ pkg: "ALL" }, v1)).toEqual({ kit: "v1", pkg: "ALL", pricing: null })
    expect(checkPick({ pkg: "P9" }, v1)).toBeNull()
    expect(checkPick({ pkg: "P2", pricing: "PRICE" }, v2)).toEqual({ kit: "v2", pkg: "P2", pricing: "PRICE" })
    expect(checkPick({ pkg: "ALL", pricing: "PRICE" }, v2)).toBeNull()
    expect(checkPick({ pkg: "P2", pricing: "CHEAP" }, v2)).toBeNull()
    expect(pickTemplate({ kit: "v1", pkg: "P2", pricing: null }, v1, "es")).toBe("NOP_P2_ES")
    expect(pickTemplate({ kit: "v2", pkg: "P2", pricing: "NOPRICE" }, v2, "es")).toBe("NOP2_P2_EN_NOPRICE")
    expect(pickTemplate({ kit: "v2", pkg: "P2", pricing: "NOPRICE" }, { kit: "v2", spanish: true }, "es")).toBe("NOP2_P2_ES_NOPRICE")
    expect(pickTemplate({ kit: "v1", pkg: "P2", pricing: null }, v2, "en")).toBeNull()
  })

  it("newest first, the same flyer moves to the top, at most 5; remove takes one back", async () => {
    const { addPick, listPicks, removePick } = await team()
    for (const pkg of ["P1", "P2", "P3", "ALL"]) await addPick("100001", { kit: "v1", pkg, pricing: null })
    await addPick("100001", { kit: "v1", pkg: "P1", pricing: null })
    expect((await listPicks("100001")).map((p) => p.pkg)).toEqual(["P1", "ALL", "P3", "P2"])
    const v2 = (pkg: string) => ({ kit: "v2" as const, pkg, pricing: "PRICE" as const })
    await addPick("100001", v2("P1")); await addPick("100001", v2("P2"))
    expect(await listPicks("100001")).toHaveLength(5)
    const top = (await listPicks("100001"))[0]
    expect((await removePick("100001", top.id)).map((p) => p.id)).not.toContain(top.id)
  })

  it("members see the picks while their recruiter is an active Leader with the team on; never otherwise", async () => {
    const { addPick, picksForMember } = await team()
    await addPick("100001", { kit: "v1", pkg: "P2", pricing: null })
    expect(await picksForMember("100001")).toMatchObject({ leaderName: "Lee Leader", picks: [{ pkg: "P2" }] })
    expect(await picksForMember(null)).toBeNull()
    r.features.team = false
    expect(await picksForMember("100001")).toBeNull()
    r.features.team = true
    r.tiers.set("leader@x.test", "pro")
    expect(await picksForMember("100001")).toBeNull()
    r.tiers.set("leader@x.test", "leader")
    r.roster.set("100001", { ...r.roster.get("100001")!, status: "suspended" })
    expect(await picksForMember("100001")).toBeNull()
  })

  it("the picks API: Leaders only, never while an admin views the portal, kit flyers only", async () => {
    const route = await import("@/app/api/enterprise/agent/team/picks/route")
    const req = (method: string, body?: unknown) => new NextRequest("http://x", { method, headers: { "content-type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) })
    expect((await route.POST(req("POST", { pkg: "P3" }))).status).toBe(200)
    expect((await route.POST(req("POST", { pkg: "nope" }))).status).toBe(422)
    const { picks } = await (await route.GET(req("GET"))).json()
    expect(picks.map((p: { pkg: string }) => p.pkg)).toEqual(["P3"])
    r.viewingAs = true
    expect((await route.DELETE(req("DELETE", { id: picks[0].id }))).status).toBe(403)
    r.viewingAs = false
    r.as = "ana@x.test"
    expect((await route.POST(req("POST", { pkg: "P1" }))).status).toBe(403)
  })
})

describe("wording", () => {
  it("nothing on the team screens mentions income, earnings or money (EN and ES)", async () => {
    const { en } = await import("@/lib/enterprise/nop-i18n/en")
    const { es } = await import("@/lib/enterprise/nop-i18n/es")
    const banned = /\b(earn\w*|income|money|commission\w*|bonus\w*|paid|pay|profit\w*|cash|downline|upline|\$|ganar|gane|ganancia\w*|ingreso\w*|dinero|comisi[oó]n\w*|pago|bono\w*)\b/i
    const keys = (Object.keys(en) as (keyof typeof en)[]).filter((k) => k.startsWith("team.") || k === "portal.team_title" || k === "portal.team_empty")
    expect(keys.length).toBeGreaterThan(15)
    for (const k of keys) {
      expect(banned.test(en[k]), `${k} (en)`).toBe(false)
      expect(banned.test(es[k as keyof typeof es]), `${k} (es)`).toBe(false)
      expect(/basic benefits/i.test(en[k] + es[k as keyof typeof es])).toBe(false)
    }
  })
})
