import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { NextRequest } from "next/server"

/**
 * The 12-month deletion job, and the consent fill-in.
 *  - only agents whose clock ran out; a dry run deletes nothing and logs what
 *    it would; live deletes that agent's whole account (leads, events,
 *    profile...; agent-account-deletion.ts, reason "retention") and takes them
 *    off the due list; an agent back on the roster has the clock cleared
 *    instead; a Stripe refusal leaves them due for tomorrow;
 *  - the cron route needs Vercel's CRON_SECRET and is dry unless
 *    NOP_RETENTION_LIVE=on; admins can only ever start a dry run.
 */

const NOW = new Date("2027-12-01T09:00:00Z")
const r = vi.hoisted(() => ({
  due: new Map<string, number>(),
  runs: [] as unknown[],
  clocks: new Map<string, { endedAt: string; reason: string; deleteAfter: string }>(),
  roster: new Map<string, { status: string }>(),
  leads: new Map<string, string[]>(),
  deletions: [] as { by: string; agentId: string; leads: number; reason: string; note: string }[],
  billingFails: new Set<string>(),
  cleared: [] as string[],
}))
vi.mock("@upstash/redis", () => {
  const fake = {
    zrange: async (_k: string, min: number, max: number) => [...r.due.entries()].filter(([, s]) => s >= min && s <= max).map(([m]) => m),
    zrem: async (_k: string, m: string) => (r.due.delete(m) ? 1 : 0),
    lpush: async (_k: string, v: unknown) => r.runs.unshift(v),
    ltrim: async () => "OK",
    lrange: async (_k: string, a: number, b: number) => r.runs.slice(a, b + 1),
  }
  return { Redis: { fromEnv: () => fake } }
})
vi.mock("@/lib/enterprise/portal/retention", () => ({
  RETENTION_DUE_KEY: "nop-retention-due",
  getRetentionClock: async (id: string) => r.clocks.get(id) ?? null,
  clearRetentionClock: async (id: string) => { r.cleared.push(id); r.clocks.delete(id); r.due.delete(id) },
}))
vi.mock("@/lib/enterprise/agents-store", () => ({ getRosterRecord: async (id: string) => r.roster.get(id) ?? null }))
vi.mock("@/lib/enterprise/agent-account-deletion", () => ({
  summarizeAgentAccount: async (id: string) => (r.leads.has(id) ? { agentId: id, account: `${id}@x.test`, leads: r.leads.get(id)!.length, events: 1, photo: false, paidPro: false } : null),
  deleteAgentAccount: async (agentId: string, o: { by: string; reason: string; note: string }) => {
    if (r.billingFails.has(agentId)) return { ok: false, reason: "billing_failed", message: "stripe down" }
    const leads = r.leads.get(agentId)?.length ?? 0
    r.deletions.push({ by: o.by, agentId, leads, reason: o.reason, note: o.note })
    r.leads.delete(agentId)
    r.due.delete(agentId)
    return { ok: true, deletion: { agentId, leads, events: 1 } }
  },
}))
vi.mock("@/lib/admin", () => ({ isAdminSession: async (sub: string | null | undefined) => sub === "admin@x.test" }))

function agent(id: string, opts: { endedAt: string; deleteAfter: string; status?: string | null; leads?: number }) {
  r.clocks.set(id, { endedAt: opts.endedAt, reason: "terminated", deleteAfter: opts.deleteAfter })
  r.due.set(id, Date.parse(opts.deleteAfter))
  if (opts.status !== null) r.roster.set(id, { status: opts.status ?? "terminated" })
  r.leads.set(id, Array.from({ length: opts.leads ?? 0 }, (_, i) => `lead-${id}-${i}`))
}

beforeEach(() => {
  r.due.clear(); r.runs.length = 0; r.clocks.clear(); r.roster.clear(); r.leads.clear(); r.deletions.length = 0; r.cleared.length = 0; r.billingFails.clear()
  vi.stubEnv("SESSION_SECRET", "test-secret")
  agent("100001", { endedAt: "2026-11-01T00:00:00Z", deleteAfter: "2027-11-01T00:00:00Z", leads: 3 }) // due, terminated
  agent("100002", { endedAt: "2026-11-15T00:00:00Z", deleteAfter: "2027-11-15T00:00:00Z", status: null, leads: 1 }) // due, removed from roster
  agent("100003", { endedAt: "2027-06-01T00:00:00Z", deleteAfter: "2028-06-01T00:00:00Z", leads: 5 }) // not due yet
  agent("100004", { endedAt: "2026-10-01T00:00:00Z", deleteAfter: "2027-10-01T00:00:00Z", status: "active", leads: 2 }) // due, but back
})
afterEach(() => vi.unstubAllEnvs())

const job = () => import("@/lib/enterprise/portal/retention-job")

describe("the job", () => {
  it("dry run: reports what's due, deletes and changes nothing", async () => {
    const run = await (await job()).runRetentionJob({ live: false, by: "daily job", now: NOW })
    expect(run).toMatchObject({ mode: "dry_run", totalLeads: 4, totalDeleted: 0 })
    expect(run.agents).toEqual([
      { agentId: "100001", leads: 3, events: 1, account: true, deleted: 0 },
      { agentId: "100002", leads: 1, events: 1, account: true, deleted: 0 },
      { agentId: "100004", leads: 0, deleted: 0, skipped: "back_on_roster" },
    ])
    expect(r.deletions).toEqual([])
    expect(r.cleared).toEqual([])
    expect([...r.due.keys()].sort()).toEqual(["100001", "100002", "100003", "100004"])
    expect(r.runs).toHaveLength(1)
  })

  it("live: deletes the whole account of due agents only, as retention; clears the clock of an agent who came back", async () => {
    const run = await (await job()).runRetentionJob({ live: true, by: "daily job", now: NOW })
    expect(run).toMatchObject({ mode: "live", totalLeads: 4, totalDeleted: 4 })
    expect(run.agents[0]).toMatchObject({ agentId: "100001", accountDeleted: true, events: 1 })
    expect(r.deletions.map((d) => [d.agentId, d.leads, d.reason, d.by])).toEqual([["100001", 3, "retention", "retention job"], ["100002", 1, "retention", "retention job"]])
    expect(r.deletions[0].note).toBe("12 months after terminated on 2026-11-01")
    expect(r.leads.get("100003")).toHaveLength(5)
    expect(r.cleared).toEqual(["100004"])
    expect([...r.due.keys()]).toEqual(["100003"])
  })

  it("if Stripe refuses, that agent stays due and nothing of theirs is deleted", async () => {
    r.billingFails.add("100001")
    const run = await (await job()).runRetentionJob({ live: true, by: "daily job", now: NOW })
    expect(run.agents[0]).toMatchObject({ agentId: "100001", skipped: "billing_failed", deleted: 0 })
    expect(r.leads.get("100001")).toHaveLength(3)
    expect(r.due.has("100001")).toBe(true)
  })

  it("a second live run finds nothing to do", async () => {
    const { runRetentionJob } = await job()
    await runRetentionJob({ live: true, by: "daily job", now: NOW })
    const again = await runRetentionJob({ live: true, by: "daily job", now: NOW })
    expect(again).toMatchObject({ agents: [], totalLeads: 0, totalDeleted: 0 })
  })
})

describe("cron route", () => {
  const get = async (auth?: string) => {
    const { GET } = await import("@/app/api/cron/nop-lead-retention/route")
    const res = await GET(new NextRequest("http://x/api/cron/nop-lead-retention", { headers: auth ? { authorization: auth } : {} }))
    return { status: res.status, json: await res.json() }
  }

  it("refuses without Vercel's secret, and runs nothing", async () => {
    vi.stubEnv("CRON_SECRET", "cron-secret")
    expect((await get()).status).toBe(401)
    expect((await get("Bearer wrong")).status).toBe(401)
    vi.stubEnv("CRON_SECRET", "")
    expect((await get("Bearer ")).status).toBe(500)
    expect(r.runs).toEqual([])
  })

  it("dry unless NOP_RETENTION_LIVE=on", async () => {
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(NOW)
    vi.stubEnv("CRON_SECRET", "cron-secret")
    expect((await get("Bearer cron-secret")).json).toMatchObject({ mode: "dry_run", deleted: 0 })
    expect(r.deletions).toEqual([])
    vi.stubEnv("NOP_RETENTION_LIVE", "on")
    expect((await get("Bearer cron-secret")).json).toMatchObject({ mode: "live" })
    expect(r.deletions.length).toBe(2)
    vi.useRealTimers()
  })
})

describe("admin dry run", () => {
  const call = async (method: "GET" | "POST", who: string) => {
    const { createSessionToken, SESSION_COOKIE } = await import("@/lib/auth")
    const { GET, POST } = await import("@/app/api/admin/enterprise/nop/retention/route")
    const req = new NextRequest("http://x/api", { method, headers: { cookie: `${SESSION_COOKIE}=${await createSessionToken(who)}` } })
    const res = await (method === "GET" ? GET : POST)(req)
    return { status: res.status, json: await res.json() }
  }

  it("an admin's run is always a dry run, even with the job live", async () => {
    vi.stubEnv("NOP_RETENTION_LIVE", "on")
    const res = await call("POST", "admin@x.test")
    expect(res.json.run).toMatchObject({ mode: "dry_run", by: "admin@x.test", totalDeleted: 0 })
    expect(r.deletions).toEqual([])
    expect(res.json.live).toBe(true)
  })

  it("non-admins can't read or run it", async () => {
    expect((await call("GET", "agent@x.test")).status).toBe(401)
    expect((await call("POST", "agent@x.test")).status).toBe(401)
  })
})

describe("consent fill-in", () => {
  it("fills {agent_name}; the admin save refuses any other fill-in", async () => {
    const { fillConsent, checkConsentText } = await import("@/lib/enterprise/portal/lead-capture")
    expect(fillConsent("I agree that {agent_name}, an agent, may contact me. {agent_name} again.", "Pat Lee")).toBe("I agree that Pat Lee, an agent, may contact me. Pat Lee again.")
    expect(checkConsentText("I agree that {agent_name} may contact me.")).toEqual({ ok: true })
    expect(checkConsentText("I agree that {agent} may contact me.")).toMatchObject({ ok: false })
  })
})
