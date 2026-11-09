import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { NextRequest } from "next/server"

/**
 * "Remove from program" and Undo (agent-membership.ts):
 *  - remove: terminated, the 12-month retention clock starts (and is due for
 *    the deletion job), sign-in refused (neutral reply, no code), no features,
 *    QR to the program's page; logged with the admin;
 *  - undo: the previous status back, clock cleared (nothing will be deleted),
 *    sign-in and QR restored; logged;
 *  - admin only.
 */

const r = vi.hoisted(() => ({
  kv: new Map<string, unknown>(),
  sets: new Map<string, Set<string>>(),
  lists: new Map<string, unknown[]>(),
  zsets: new Map<string, Map<string, number>>(),
  codes: [] as { to: string; purpose: string }[],
}))
vi.mock("@upstash/redis", () => {
  const set = (k: string) => r.sets.get(k) ?? (r.sets.set(k, new Set()), r.sets.get(k)!)
  const zset = (k: string) => r.zsets.get(k) ?? (r.zsets.set(k, new Map()), r.zsets.get(k)!)
  const fake = {
    get: async (k: string) => r.kv.get(k) ?? null,
    set: async (k: string, v: unknown, o?: { nx?: boolean }) => { if (o?.nx && r.kv.has(k)) return null; r.kv.set(k, v); return "OK" },
    del: async (...ks: string[]) => ks.reduce((n, k) => n + (r.kv.delete(k) ? 1 : 0), 0),
    mget: async (...ks: string[]) => ks.map((k) => r.kv.get(k) ?? null),
    incr: async (k: string) => { const n = Number(r.kv.get(k) ?? 0) + 1; r.kv.set(k, n); return n },
    decr: async (k: string) => { const n = Number(r.kv.get(k) ?? 0) - 1; r.kv.set(k, n); return n },
    expire: async () => 1,
    sadd: async (k: string, ...m: string[]) => m.filter((x) => !set(k).has(x) && set(k).add(x)).length,
    srem: async (k: string, ...m: string[]) => m.filter((x) => set(k).delete(x)).length,
    smembers: async (k: string) => [...set(k)],
    lpush: async (k: string, v: unknown) => r.lists.set(k, [v, ...(r.lists.get(k) ?? [])]).get(k)!.length,
    lrange: async (k: string, a: number, b: number) => (r.lists.get(k) ?? []).slice(a, b === -1 ? undefined : b + 1),
    zadd: async (k: string, e: { score: number; member: string }) => (zset(k).set(e.member, e.score), 1),
    zrem: async (k: string, m: string) => (zset(k).delete(m) ? 1 : 0),
    zcard: async (k: string) => zset(k).size,
    zcount: async () => 0,
    zrange: async () => [],
    zscore: async (k: string, m: string) => zset(k).get(m) ?? null,
    hget: async () => null,
    hgetall: async () => null,
  }
  return { Redis: { fromEnv: () => fake } }
})
vi.mock("@/lib/email", () => ({
  sendAgentVerificationCode: async (to: string, _c: string, _p: string, _l: string, purpose: string) => (r.codes.push({ to, purpose }), true),
}))
vi.mock("@vercel/functions", () => ({ waitUntil: (p: Promise<unknown>) => p }))
vi.mock("@/lib/enterprise/access-http", async (orig) => ({ ...(await orig<typeof import("@/lib/enterprise/access-http")>()), accessRateLimit: async () => null }))
vi.mock("@/lib/admin", () => ({ isAdminSession: async (sub: string | null | undefined) => sub === "admin@x.test" }))
vi.mock("@/lib/enterprise/nop-enroll-domain", () => ({ getEnrollDomain: async () => "join.basicbenefits.com" }))

const AGENT = "quinn@x.test"
beforeEach(async () => {
  vi.stubEnv("SESSION_SECRET", "test-secret")
  r.kv.clear(); r.sets.clear(); r.lists.clear(); r.zsets.clear(); r.codes.length = 0
  const { importRoster, lockAgentId } = await import("@/lib/enterprise/agents-store")
  await importRoster([{ agentId: "123456", companyName: "", agentName: "Quinn Pearl", rosterEmail: AGENT, rosterPhone: "(270) 555-0100", referralCode: "", enrollmentUrl: "", enrollmentUrlMismatch: false, status: "active" }])
  await lockAgentId("123456", AGENT)
})
afterEach(() => vi.unstubAllEnvs())

async function asUser(sub: string) {
  const { createSessionToken, SESSION_COOKIE } = await import("@/lib/auth")
  return `${SESSION_COOKIE}=${await createSessionToken(sub)}`
}
async function program(action: string, who = "admin@x.test") {
  const { POST } = await import("@/app/api/admin/enterprise/agents/[email]/program/route")
  const res = await POST(new NextRequest("http://x/api", { method: "POST", headers: { cookie: await asUser(who), "content-type": "application/json" }, body: JSON.stringify({ action }) }), { params: Promise.resolve({ email: encodeURIComponent(AGENT) }) })
  return { status: res.status, json: await res.json() }
}
async function signIn() {
  r.codes.length = 0
  const { POST } = await import("@/app/api/enterprise/nop/access/signin/route")
  await POST(new NextRequest("http://x/api", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: AGENT }) }))
  return r.codes.length > 0
}
const qr = async () => {
  const { nopQrTarget } = await import("@/lib/enterprise/nop-roster")
  const { getRosterRecord } = await import("@/lib/enterprise/agents-store")
  return nopQrTarget("123456", await getRosterRecord("123456"), "join.basicbenefits.com")
}

describe("remove from program, and undo", () => {
  it("before: an active agent signs in and their QR goes to their enrollment URL", async () => {
    expect(await signIn()).toBe(true)
    expect(await qr()).toBe("https://join.basicbenefits.com/123456")
  })

  it("remove: terminated, clock started and due for deletion, sign-in refused, QR to the program page, logged", async () => {
    const res = await program("remove")
    expect(res.status).toBe(200)
    const { getRosterRecord } = await import("@/lib/enterprise/agents-store")
    expect(await getRosterRecord("123456")).toMatchObject({ status: "terminated", statusBeforeRemoval: "active", removedBy: "admin@x.test" })
    const { getRetentionClock } = await import("@/lib/enterprise/portal/retention")
    const clock = await getRetentionClock("123456")
    expect(clock).toMatchObject({ reason: "terminated" })
    expect(r.zsets.get("nop-retention-due")?.get("123456")).toBe(Date.parse(clock!.deleteAfter))
    const { isGenerationStatus } = await import("@/lib/enterprise/nop-roster")
    expect(isGenerationStatus(await getRosterRecord("123456"))).toBe(false)
    expect(await signIn()).toBe(false)
    expect(await qr()).toBe("https://join.basicbenefits.com/")
    expect((r.lists.get("nop-program-status-log") as { action: string; admin: string; account: string }[])[0]).toMatchObject({ action: "remove", admin: "admin@x.test", account: AGENT })
    expect((await program("remove")).status).toBe(409)
  })

  it("undo: everything back (status, sign-in, QR), clock cleared so nothing is deleted, logged", async () => {
    await program("remove")
    const res = await program("reactivate")
    expect(res.json).toMatchObject({ ok: true, status: "active" })
    const { getRosterRecord } = await import("@/lib/enterprise/agents-store")
    const rec = await getRosterRecord("123456")
    expect(rec?.status).toBe("active")
    expect(rec).not.toHaveProperty("statusBeforeRemoval")
    const { getRetentionClock } = await import("@/lib/enterprise/portal/retention")
    expect(await getRetentionClock("123456")).toBeNull()
    expect(r.zsets.get("nop-retention-due")?.has("123456")).toBe(false)
    expect(await signIn()).toBe(true)
    expect(await qr()).toBe("https://join.basicbenefits.com/123456")
    expect((r.lists.get("nop-program-status-log") as { action: string }[]).map((l) => l.action)).toEqual(["reactivate", "remove"])
    expect((await program("reactivate")).status).toBe(409)
  })

  it("a suspended agent who is removed comes back suspended", async () => {
    const { getRosterRecord, saveRosterRecord } = await import("@/lib/enterprise/agents-store")
    await saveRosterRecord({ ...(await getRosterRecord("123456"))!, status: "suspended" })
    await program("remove")
    expect((await program("reactivate")).json.status).toBe("suspended")
  })

  it("admin only", async () => {
    expect((await program("remove", AGENT)).status).toBe(401)
    const { getRosterRecord } = await import("@/lib/enterprise/agents-store")
    expect((await getRosterRecord("123456"))?.status).toBe("active")
  })
})
