import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextRequest } from "next/server"
import { defaultOrgFeatures, entitlements, portalTabs } from "@/lib/enterprise/portal/features"
import type { RosterRecord } from "@/lib/types"

/**
 * Recruiting (Phase 6): an active Pro agent's personal link
 * (/agent/start?ref={code}) and QR; a self sign-up through it records the
 * recruiter; it still needs admin approval; the agent sees pending / approved;
 * a rejected sign-up drops off; a ref of someone who can't recruit is ignored.
 * No income or earnings language in anything recruiting shows.
 */

const r = vi.hoisted(() => ({
  kv: new Map<string, unknown>(),
  z: new Map<string, Map<string, number>>(),
  roster: new Map<string, RosterRecord>(),
  owners: new Map<string, string>(),
  /** account email -> tier; every account here is an active agent. */
  tiers: new Map<string, string>(),
  features: {} as Record<string, boolean>,
}))
vi.mock("@upstash/redis", () => {
  const zs = (k: string) => r.z.get(k) ?? (r.z.set(k, new Map()), r.z.get(k)!)
  const fake = {
    get: async (k: string) => r.kv.get(k) ?? null,
    set: async (k: string, v: unknown, o?: { nx?: boolean }) => { if (o?.nx && r.kv.has(k)) return null; r.kv.set(k, v); return "OK" },
    del: async (...ks: string[]) => ks.reduce((n, k) => n + (r.kv.delete(k) ? 1 : 0), 0),
    zadd: async (k: string, e: { score: number; member: string }) => (zs(k).set(e.member, e.score), 1),
    zrem: async (k: string, m: string) => (zs(k).delete(m) ? 1 : 0),
    zrange: async (k: string, _a: number, _b: number, o?: { rev?: boolean }) => {
      const ids = [...zs(k).entries()].sort((x, y) => x[1] - y[1]).map(([m]) => m)
      return o?.rev ? ids.reverse() : ids
    },
    lpush: async () => 1,
  }
  return { Redis: { fromEnv: () => fake } }
})
vi.mock("@/lib/enterprise/agents-store", () => ({
  getRosterRecord: async (id: string) => r.roster.get(id) ?? null,
  saveRosterRecord: async (rec: RosterRecord) => void r.roster.set(rec.agentId, rec),
  deleteRosterRecord: async (id: string) => void r.roster.delete(id),
  listRoster: async () => [...r.roster.values()],
  getAgentIdOwner: async (id: string) => r.owners.get(id) ?? null,
  lockAgentId: async (id: string, email: string) => (r.owners.has(id) ? { ok: false, reason: "id_taken", heldBy: r.owners.get(id) } : (r.owners.set(id, email), { ok: true })),
  adminUnlockAgentId: async (id: string) => void r.owners.delete(id),
  addAgentFlag: async () => undefined,
  buildAgentProfile: () => ({}),
  flagNameIfTooLongForFooter: async () => undefined,
}))
vi.mock("@/lib/store", () => ({ saveAgentProfile: async () => undefined, getAgentProfile: async () => null, recordClientCreatedAtIfUnset: async () => undefined }))
vi.mock("@/lib/enterprise/nop-enroll-domain", () => ({ getEnrollDomain: async () => "join.example.test", getEnrollTargets: async () => "join.example.test" }))
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
      const ctx = await loadPortalContext("pro@x.test")
      if (!ctx || !canUse(ctx as never, feature as never)) return { response: Response.json({ error: "not_available" }, { status: 403 }) }
      return { viewer: {}, ctx }
    },
  }
})

const agent = (agentId: string, email: string, name: string, tier: string, status: RosterRecord["status"] = "active") => {
  r.roster.set(agentId, { agentId, companyName: "", agentName: name, rosterEmail: email, rosterPhone: "", referralCode: "", enrollmentUrl: "", enrollmentUrlMismatch: false, status, importedAt: "2026-11-01T00:00:00Z", source: "self" })
  r.owners.set(agentId, email)
  r.tiers.set(email, tier)
}

beforeEach(() => {
  r.kv.clear(); r.z.clear(); r.roster.clear(); r.owners.clear(); r.tiers.clear()
  r.features = { ...defaultOrgFeatures(true), recruiting: true }
  agent("100001", "pro@x.test", "Pat Lee", "pro")
  agent("100002", "basic@x.test", "Bea Basic", "basic")
})

const rec = () => import("@/lib/enterprise/portal/recruiting")
const signup = () => import("@/lib/enterprise/agent-signup")
const join = async (agentId: string, ref: string | null, name = "Rita Recruit") =>
  (await signup()).submitSignup({ agentId, name, phone: "(270) 555-0100", email: `${agentId}@x.test`, lang: "es", ref })

describe("the recruit link", () => {
  it("one stable random code per agent; the link is /agent/start?ref={code}", async () => {
    const { getOrCreateRecruitCode, recruitLink, parseRecruitRef } = await rec()
    const code = await getOrCreateRecruitCode("100001")
    expect(code).toMatch(/^[23456789A-HJ-NP-Za-km-z]{7}$/)
    expect(await getOrCreateRecruitCode("100001")).toBe(code)
    expect(code).not.toContain("100001")
    expect(recruitLink(code)).toBe(`https://oneflyer.org/agent/start?ref=${code}`)
    expect(parseRecruitRef(code)).toBe(code)
    expect(parseRecruitRef("../x")).toBeNull()
    expect(parseRecruitRef(["a"])).toBeNull()
  })

  it("resolves only to an active agent who can recruit now (Pro, switch on)", async () => {
    const { getOrCreateRecruitCode, resolveRecruiter } = await rec()
    const pro = await getOrCreateRecruitCode("100001")
    const basic = await getOrCreateRecruitCode("100002")
    expect(await resolveRecruiter(pro)).toEqual({ agentId: "100001", name: "Pat Lee" })
    expect(await resolveRecruiter(basic)).toBeNull()
    expect(await resolveRecruiter("ZZZZZZZ")).toBeNull()
    expect(await resolveRecruiter(null)).toBeNull()
    r.features.recruiting = false
    expect(await resolveRecruiter(pro)).toBeNull()
    r.features.recruiting = true
    r.roster.set("100001", { ...r.roster.get("100001")!, status: "suspended" })
    expect(await resolveRecruiter(pro)).toBeNull()
  })
})

describe("signing up through it", () => {
  it("records the recruiter; still pending until an admin approves; the recruiter sees pending, then approved", async () => {
    const { getOrCreateRecruitCode, listRecruits } = await rec()
    const ref = await getOrCreateRecruitCode("100001")
    expect(await join("200001", ref)).toBe("created")
    expect(r.roster.get("200001")).toMatchObject({ status: "pending", recruitedBy: "100001" })
    expect(await listRecruits("100001")).toEqual([expect.objectContaining({ agentId: "200001", name: "Rita Recruit", status: "pending" })])
    const { listPendingSignups, approveSignup } = await signup()
    expect((await listPendingSignups())[0]).toMatchObject({ agentId: "200001", recruitedBy: "100001" })
    await approveSignup("200001", "admin@x.test")
    expect((await listRecruits("100001"))[0].status).toBe("approved")
    r.roster.set("200001", { ...r.roster.get("200001")!, status: "terminated" })
    expect((await listRecruits("100001"))[0].status).toBe("inactive")
  })

  it("a rejected sign-up drops off the recruiter's list", async () => {
    const { getOrCreateRecruitCode, listRecruits } = await rec()
    await join("200002", await getOrCreateRecruitCode("100001"))
    await (await signup()).rejectSignup("200002", "admin@x.test")
    expect(await listRecruits("100001")).toEqual([])
    expect(r.z.get("nop-agent:100001:recruits")?.size ?? 0).toBe(0)
  })

  it("no recruiter recorded: no ref, a Basic agent's ref, an unknown ref, or a duplicate sign-up", async () => {
    const { getOrCreateRecruitCode, listRecruits } = await rec()
    await join("200003", null)
    await join("200004", await getOrCreateRecruitCode("100002"))
    await join("200005", "ZZZZZZZ")
    expect(await join("100002", await getOrCreateRecruitCode("100001"))).toBe("duplicate")
    for (const id of ["200003", "200004", "200005"]) expect(r.roster.get(id)).not.toHaveProperty("recruitedBy")
    expect(r.roster.get("100002")).not.toHaveProperty("recruitedBy")
    expect(await listRecruits("100001")).toEqual([])
    expect(await listRecruits("100002")).toEqual([])
  })
})

describe("the QR", () => {
  it("a Pro agent downloads the QR of their link; without recruiting, refused", async () => {
    const { GET } = await import("@/app/api/enterprise/agent/recruit/qr/route")
    const png = await GET(new NextRequest("http://x/api/enterprise/agent/recruit/qr?format=png"))
    expect(png.status).toBe(200)
    expect(png.headers.get("content-type")).toBe("image/png")
    const svg = await (await GET(new NextRequest("http://x/api/enterprise/agent/recruit/qr?format=svg"))).text()
    expect(svg).toContain("<svg")
    r.features.recruiting = false
    expect((await GET(new NextRequest("http://x/api/enterprise/agent/recruit/qr"))).status).toBe(403)
  })
})

describe("wording", () => {
  it("nothing recruiting shows mentions income, earnings or money (EN and ES)", async () => {
    const { en } = await import("@/lib/enterprise/nop-i18n/en")
    const { es } = await import("@/lib/enterprise/nop-i18n/es")
    const banned = /\b(earn\w*|income|money|commission\w*|bonus\w*|paid|pay|profit\w*|cash|\$|ganar|gane|ganancia\w*|ingreso\w*|dinero|comisi[oó]n\w*|pago|bono\w*)\b/i
    const keys = (Object.keys(en) as (keyof typeof en)[]).filter((k) => k.startsWith("recruit.") || k === "portal.team_empty" || k === "portal.pro_word_recruiting")
    expect(keys.length).toBeGreaterThan(10)
    for (const k of keys) {
      expect(banned.test(en[k]), `${k} (en): ${en[k]}`).toBe(false)
      expect(banned.test(es[k as keyof typeof es]), `${k} (es): ${es[k as keyof typeof es]}`).toBe(false)
    }
    expect(/basic benefits/i.test(keys.map((k) => en[k] + es[k as keyof typeof es]).join(" "))).toBe(false)
  })
})
