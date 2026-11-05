import { describe, it, expect, vi, beforeEach } from "vitest"

/** Tier, org switches, last-active and the admin views log, on an in-memory Redis. */

const r = vi.hoisted(() => ({ kv: new Map<string, unknown>(), h: new Map<string, Record<string, string>>(), l: new Map<string, unknown[]>() }))
vi.mock("@upstash/redis", () => {
  const fake = {
    get: async (k: string) => r.kv.get(k) ?? null,
    set: async (k: string, v: unknown) => void r.kv.set(k, v),
    mget: async (...ks: string[]) => ks.map((k) => r.kv.get(k) ?? null),
    hgetall: async (k: string) => r.h.get(k) ?? null,
    hset: async (k: string, v: Record<string, string>) => void r.h.set(k, { ...(r.h.get(k) ?? {}), ...v }),
    lpush: async (k: string, v: unknown) => void r.l.set(k, [v, ...(r.l.get(k) ?? [])]),
    lrange: async (k: string, a: number, b: number) => (r.l.get(k) ?? []).slice(a, b + 1),
  }
  return { Redis: { fromEnv: () => fake } }
})

beforeEach(() => { r.kv.clear(); r.h.clear(); r.l.clear() })

describe("agent tier", () => {
  it("is Basic until an admin sets it, and never reads client.plan", async () => {
    const { getAgentTier, setAgentTier } = await import("@/lib/enterprise/portal/store")
    r.kv.set("client:a@x.test:plan", "pro")
    expect(await getAgentTier("a@x.test")).toBe("basic")
    await setAgentTier("a@x.test", "leader")
    expect(r.kv.get("client:a@x.test:agent-tier")).toBe("leader")
    expect(await getAgentTier("a@x.test")).toBe("leader")
  })

  it("treats anything unexpected as Basic", async () => {
    const { getAgentTier } = await import("@/lib/enterprise/portal/store")
    r.kv.set("client:a@x.test:agent-tier", "platinum")
    expect(await getAgentTier("a@x.test")).toBe("basic")
  })
})

describe("org switches", () => {
  it("NOP defaults on; a stored off wins; another org defaults off", async () => {
    const { getOrgFeatures, setOrgFeature } = await import("@/lib/enterprise/portal/store")
    expect((await getOrgFeatures("nop")).events).toBe(true)
    const after = await setOrgFeature("nop", "events", false)
    expect(after.events).toBe(false)
    expect(after.leads).toBe(true)
    expect(r.h.get("enterprise-org:nop:features")).toEqual({ events: "off" })
    expect((await getOrgFeatures("northstar")).leads).toBe(false)
  })
})

describe("last active", () => {
  it("is written at most every 10 minutes", async () => {
    const { touchLastActive, getLastActive } = await import("@/lib/enterprise/portal/store")
    await touchLastActive("a@x.test", new Date("2026-11-05T10:00:00Z"))
    await touchLastActive("a@x.test", new Date("2026-11-05T10:05:00Z"))
    expect(await getLastActive(["a@x.test"])).toEqual(["2026-11-05T10:00:00.000Z"])
    await touchLastActive("a@x.test", new Date("2026-11-05T10:11:00Z"))
    expect(await getLastActive(["a@x.test"])).toEqual(["2026-11-05T10:11:00.000Z"])
  })
})

describe("admin views log", () => {
  it("keeps every view, newest first, globally and per agent", async () => {
    const { logAdminAgentView, listAdminAgentViews } = await import("@/lib/enterprise/portal/store")
    await logAdminAgentView({ admin: "admin", agentEmail: "a@x.test", agentId: "1", kind: "detail" })
    await logAdminAgentView({ admin: "admin", agentEmail: "b@x.test", agentId: "2", kind: "view-as" })
    expect((await listAdminAgentViews()).map((v) => v.agentEmail)).toEqual(["b@x.test", "a@x.test"])
    expect((await listAdminAgentViews({ agentEmail: "a@x.test" })).map((v) => v.kind)).toEqual(["detail"])
  })
})
