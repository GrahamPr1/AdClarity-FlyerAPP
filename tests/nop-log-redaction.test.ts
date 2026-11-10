import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * After an agent account is deleted, the logs keep the fact of each decision
 * and action (Agent ID, when, who, what) but not the person: name, phone and
 * email become "[deleted]". Emails are redacted wherever they appear; a name
 * or phone only in entries about this agent (another agent with the same
 * name keeps theirs). Admins' identities stay. Checked against a real Redis
 * too (the Lua replace); here the list replace is emulated.
 */

const r = vi.hoisted(() => ({ lists: new Map<string, string[]>(), deleted: [] as string[] }))
vi.mock("@upstash/redis", () => {
  const fake = {
    lrange: async (k: string) => (r.lists.get(k) ?? []).map((s) => JSON.parse(s)),
    eval: async (_script: string, keys: string[], args: string[]) => {
      const list = r.lists.get(keys[0]) ?? []
      let n = 0
      for (let i = 0; i < args.length; i += 2) {
        const j = list.indexOf(args[i])
        if (j >= 0) { list[j] = args[i + 1]; n++ }
      }
      return n
    },
    del: async (...ks: string[]) => (r.deleted.push(...ks), ks.length),
  }
  return { Redis: { fromEnv: () => fake } }
})

const put = (k: string, ...entries: Record<string, unknown>[]) => r.lists.set(k, entries.map((e) => JSON.stringify(e)))
const get = (k: string) => (r.lists.get(k) ?? []).map((s) => JSON.parse(s))
const WHO = { agentId: "123456", emails: ["Pat@x.test", "shown@x.test"], names: ["Pat Lee"], phones: ["(270) 555-0100"] }

beforeEach(() => {
  r.lists.clear(); r.deleted.length = 0
  put("nop-signups:log",
    { admin: "owner@x.test", action: "approve", agentId: "123456", account: "pat@x.test", name: "Pat Lee", phone: "(270) 555-0100", lang: "es", at: "t1" },
    { admin: "owner@x.test", action: "approve_name", agentId: "123456", account: "pat@x.test", name: "Patricia Lee", previousName: "Pat Lee", at: "t2" },
    { admin: "owner@x.test", action: "approve", agentId: "999999", account: "other@x.test", name: "Pat Lee", phone: "(270) 555-0999", at: "t3" },
  )
  put("nop-program-status-log", { at: "t", admin: "quinn@x.test", action: "remove", agentId: "123456", account: "pat@x.test", status: "active" })
  put("agent-flags:nop", { id: "f", type: "signup_duplicate", agentId: "777777", account: "pat@x.test", attemptedEmail: "pat@x.test", heldBy: "holder@x.test", at: "t" })
  put("admin-agent-views", { admin: "owner@x.test", agentEmail: "pat@x.test", agentId: "123456", kind: "view-as", at: "t" })
  put("nop-admin-actions",
    { actor: "quinn@x.test", actorName: "Quinn", role: "program", action: "print_request.status", detail: "abc for PAT@x.test: Fulfilled", at: "t" },
    { actor: "owner@x.test", actorName: null, role: "owner", action: "org_feature", detail: "leads off", at: "t" },
  )
})

describe("redacting a deleted agent from the logs", () => {
  it("keeps who/what/when/Agent ID; replaces their name, phone and email (also a later name change)", async () => {
    const { redactAgentFromLogs } = await import("@/lib/enterprise/log-redaction")
    const n = await redactAgentFromLogs(WHO)
    expect(n).toBe(6)
    const [first, second, other] = get("nop-signups:log")
    expect(first).toEqual({ admin: "owner@x.test", action: "approve", agentId: "123456", account: "[deleted]", name: "[deleted]", phone: "[deleted]", lang: "es", at: "t1" })
    expect(second).toMatchObject({ action: "approve_name", agentId: "123456", account: "[deleted]", name: "[deleted]", previousName: "[deleted]" })
    expect(other).toMatchObject({ agentId: "999999", account: "other@x.test", name: "Pat Lee", phone: "(270) 555-0999" })
    expect(get("nop-program-status-log")[0]).toMatchObject({ admin: "quinn@x.test", action: "remove", agentId: "123456", account: "[deleted]" })
    expect(get("agent-flags:nop")[0]).toMatchObject({ agentId: "777777", account: "[deleted]", attemptedEmail: "[deleted]", heldBy: "holder@x.test" })
    expect(get("admin-agent-views")[0]).toMatchObject({ admin: "owner@x.test", agentEmail: "[deleted]", agentId: "123456" })
    expect(get("nop-admin-actions")).toEqual([
      expect.objectContaining({ actor: "quinn@x.test", detail: "abc for [deleted]: Fulfilled" }),
      expect.objectContaining({ detail: "leads off" }),
    ])
    expect(r.deleted).toEqual(["admin-agent-views:pat@x.test", "admin-agent-views:shown@x.test"])
  })

  it("running it again changes nothing", async () => {
    const { redactAgentFromLogs } = await import("@/lib/enterprise/log-redaction")
    await redactAgentFromLogs(WHO)
    expect(await redactAgentFromLogs(WHO)).toBe(0)
  })
})
