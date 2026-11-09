import { describe, it, expect, vi, beforeEach } from "vitest"
import type { LeadRecord } from "@/lib/types"

/**
 * Scans, leads and approved wording on an in-memory Redis. Scans and leads
 * live under the Agent ID; a lead is an agent's only while it's in their set;
 * approved text starts as a placeholder that counts as pending; the retention
 * clock starts once at termination; admin deletions are logged without details.
 * (The atomic move script runs against a real Redis in the local check.)
 */

const r = vi.hoisted(() => ({ kv: new Map<string, unknown>(), h: new Map<string, Record<string, number>>(), z: new Map<string, Map<string, number>>(), l: new Map<string, unknown[]>() }))
vi.mock("@upstash/redis", () => {
  const zset = (k: string) => r.z.get(k) ?? (r.z.set(k, new Map()), r.z.get(k)!)
  const fake = {
    get: async (k: string) => r.kv.get(k) ?? null,
    set: async (k: string, v: unknown, o?: { nx?: boolean }) => (o?.nx && r.kv.has(k) ? null : (r.kv.set(k, structuredClone(v)), "OK")),
    del: async (...ks: string[]) => ks.forEach((k) => r.kv.delete(k)),
    zadd: async (k: string, e: { score: number; member: string }) => void zset(k).set(e.member, e.score),
    zrem: async (k: string, ...ms: string[]) => ms.forEach((m) => zset(k).delete(m)),
    mget: async (...ks: string[]) => ks.map((k) => r.kv.get(k) ?? null),
    hgetall: async (k: string) => r.h.get(k) ?? null,
    zrange: async (k: string, _a: number, _b: number, o?: { rev?: boolean }) => { const e = [...zset(k)].sort((x, y) => x[1] - y[1]).map(([m]) => m); return o?.rev ? e.reverse() : e },
    zcard: async (k: string) => zset(k).size,
    zcount: async (k: string, min: number) => [...zset(k).values()].filter((v) => v >= min).length,
    zscore: async (k: string, m: string) => zset(k).get(m) ?? null,
    lpush: async (k: string, v: unknown) => void r.l.set(k, [v, ...(r.l.get(k) ?? [])]),
    lrange: async (k: string, a: number, b: number) => (r.l.get(k) ?? []).slice(a, b + 1),
    multi: () => {
      const ops: (() => void)[] = []
      const tx = {
        hincrby: (k: string, f: string, n: number) => (ops.push(() => { const h = r.h.get(k) ?? {}; h[f] = (h[f] ?? 0) + n; r.h.set(k, h) }), tx),
        set: (k: string, v: unknown) => (ops.push(() => r.kv.set(k, structuredClone(v))), tx),
        zadd: (k: string, e: { score: number; member: string }) => (ops.push(() => zset(k).set(e.member, e.score)), tx),
        zrem: (k: string, ...ms: string[]) => (ops.push(() => ms.forEach((m) => zset(k).delete(m))), tx),
        del: (...ks: string[]) => (ops.push(() => ks.forEach((x) => r.kv.delete(x))), tx),
        exec: async () => ops.forEach((o) => o()),
      }
      return tx
    },
  }
  return { Redis: { fromEnv: () => fake } }
})
beforeEach(() => { r.kv.clear(); r.h.clear(); r.z.clear(); r.l.clear() })

const lead = (id: string, at: string): LeadRecord => ({ id, flyerId: "nop-agent:858980", code: "858980", name: id, phone: "555-0100", email: null, message: null, createdAt: at })

describe("scans", () => {
  it("count a total and an Eastern-time month per Agent ID", async () => {
    const { countAgentScan, getAgentScans } = await import("@/lib/enterprise/portal/agent-data")
    await countAgentScan("858980", new Date("2026-10-31T12:00:00Z"))
    await countAgentScan("858980", new Date("2026-11-01T03:00:00Z")) // still Oct 31 in New York
    await countAgentScan("858980", new Date("2026-11-05T15:00:00Z"))
    await countAgentScan("858981", new Date("2026-11-05T15:00:00Z"))
    expect(r.h.get("nop-agent:858980:scans")).toEqual({ total: 3, "2026-10": 2, "2026-11": 1 })
    expect(await getAgentScans("858980", new Date("2026-11-20T12:00:00Z"))).toEqual({ total: 3, thisMonth: 1 })
    expect(await getAgentScans("999", new Date())).toEqual({ total: 0, thisMonth: 0 })
  })
})

describe("leads", () => {
  it("are listed newest first and counted per Agent ID", async () => {
    const { saveAgentLead, listAgentLeads, countAgentLeads } = await import("@/lib/enterprise/portal/agent-data")
    await saveAgentLead("858980", lead("a", "2026-11-01T10:00:00Z"))
    await saveAgentLead("858980", lead("b", "2026-11-03T10:00:00Z"))
    await saveAgentLead("858981", lead("c", "2026-11-02T10:00:00Z"))
    expect((await listAgentLeads("858980")).map((l) => l.id)).toEqual(["b", "a"])
    expect(await countAgentLeads("858980")).toBe(2)
    expect(await countAgentLeads("858980", new Date("2026-11-02T00:00:00Z"))).toBe(1)
  })

  it("can be marked contacted only by the agent whose set holds them", async () => {
    const { saveAgentLead, setAgentLeadContacted } = await import("@/lib/enterprise/portal/agent-data")
    await saveAgentLead("858980", lead("a", "2026-11-01T10:00:00Z"))
    expect(await setAgentLeadContacted("858981", "a", true)).toBeNull()
    expect((r.kv.get("nop-lead:a") as LeadRecord).contactedAt).toBeUndefined()
    const at = new Date("2026-11-05T10:00:00Z")
    expect((await setAgentLeadContacted("858980", "a", true, at))?.contactedAt).toBe(at.toISOString())
    expect((await setAgentLeadContacted("858980", "a", false))?.contactedAt).toBeNull()
  })
})

describe("approved wording", () => {
  it("starts as the marked placeholder, which is pending", async () => {
    const { getApprovedText } = await import("@/lib/enterprise/portal/approved-text")
    const t = await getApprovedText("nop", "leadConsent", "en")
    expect(t).toMatchObject({ text: "[PENDING ORG APPROVAL — consent text]", version: 0, pending: true })
  })

  it("is versioned and kept out of the org's asset index; blank puts the placeholder back", async () => {
    const { getApprovedText, saveApprovedText, listApprovedTextHistory } = await import("@/lib/enterprise/portal/approved-text")
    r.kv.set("enterprise-org:nop", { id: "nop", name: "NOP", assets: [] })
    const saved = await saveApprovedText("nop", "leadConsent", "es", "  Acepto que me contacten.  ", "admin")
    expect(saved).toMatchObject({ text: "Acepto que me contacten.", version: 1, pending: false, updatedBy: "admin" })
    expect(r.kv.get("content-asset:approved-text:nop:leadConsent:es")).toMatchObject({ orgId: "nop", assetType: "text", locked: true, approvedText: { key: "leadConsent", lang: "es", version: 1 } })
    expect((r.kv.get("enterprise-org:nop") as { assets: string[] }).assets).toEqual([])
    expect((await getApprovedText("nop", "leadConsent", "en")).pending).toBe(true)
    const back = await saveApprovedText("nop", "leadConsent", "es", "   ", "admin")
    expect(back).toMatchObject({ pending: true, version: 2 })
    expect((await listApprovedTextHistory("nop", "leadConsent", "es")).map((a) => a.approvedText?.version)).toEqual([2, 1])
  })

  it("treats any text still carrying the placeholder mark as pending", async () => {
    const { isPendingText } = await import("@/lib/enterprise/portal/approved-text")
    expect(isPendingText("I agree [PENDING ORG APPROVAL — consent text]")).toBe(true)
    expect(isPendingText("")).toBe(true)
    expect(isPendingText("I agree to be contacted.")).toBe(false)
  })
})

describe("retention", () => {
  it("deadline is 12 calendar months on, clamped to the month's last day", async () => {
    const { retentionDeadline } = await import("@/lib/enterprise/portal/retention")
    expect(retentionDeadline(new Date("2026-11-06T15:00:00Z")).toISOString()).toBe("2027-11-06T15:00:00.000Z")
    expect(retentionDeadline(new Date("2027-02-28T00:00:00Z")).toISOString()).toBe("2028-02-28T00:00:00.000Z")
    expect(retentionDeadline(new Date("2028-02-29T00:00:00Z")).toISOString()).toBe("2029-02-28T00:00:00.000Z")
  })

  it("starts once and isn't restarted by a later import; clearing removes it from the due list", async () => {
    const { startRetentionClock, clearRetentionClock, getRetentionClock } = await import("@/lib/enterprise/portal/retention")
    await startRetentionClock("858980", "terminated", new Date("2026-11-06T00:00:00Z"))
    await startRetentionClock("858980", "terminated", new Date("2027-03-01T00:00:00Z"))
    expect(await getRetentionClock("858980")).toEqual({ endedAt: "2026-11-06T00:00:00.000Z", reason: "terminated", deleteAfter: "2027-11-06T00:00:00.000Z" })
    expect(r.z.get("nop-retention-due")?.get("858980")).toBe(Date.parse("2027-11-06T00:00:00Z"))
    await clearRetentionClock("858980")
    expect(await getRetentionClock("858980")).toBeNull()
    expect(r.z.get("nop-retention-due")?.has("858980")).toBe(false)
  })
})

describe("deleting leads on request", () => {
  it("deletes only the agent's own leads and logs ids, never details", async () => {
    const { saveAgentLead, deleteAgentLeads, listAgentLeads, listLeadDeletions } = await import("@/lib/enterprise/portal/agent-data")
    await saveAgentLead("858980", { ...lead("a", "2026-11-01T10:00:00Z"), name: "Ana Ruiz", email: "ana@x.test" })
    await saveAgentLead("858981", lead("b", "2026-11-02T10:00:00Z"))
    expect(await deleteAgentLeads("admin", "858980", ["b"], "person", "")).toBeNull()
    const d = await deleteAgentLeads("admin", "858980", ["a", "b"], "person", "phoned in")
    expect(d).toMatchObject({ admin: "admin", agentId: "858980", leadIds: ["a"], requestedBy: "person", note: "phoned in" })
    expect(await listAgentLeads("858980")).toEqual([])
    expect(r.kv.has("nop-lead:a")).toBe(false)
    expect((await listAgentLeads("858981")).map((l) => l.id)).toEqual(["b"])
    expect(JSON.stringify(await listLeadDeletions())).not.toMatch(/Ana|ana@x/)
  })
})
