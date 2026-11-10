import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextRequest } from "next/server"

/**
 * "Delete agent account" (admin): the owner or a program admin; a preview of
 * what goes; the Agent ID typed again to confirm; logged with the admin. A
 * Stripe refusal deletes nothing and says so. The deletion itself was checked
 * against a real Redis (only the download record and the QR mapping remain).
 */

const s = vi.hoisted(() => ({
  who: "quinn@x.test" as string | null,
  summary: { agentId: "123456", account: "agent@x.test", name: "Pat Lee", status: "active", leads: 3, events: 1, photo: true, paidPro: true } as Record<string, unknown> | null,
  deleted: [] as { agentId: string; by: string; reason: string }[],
  audits: [] as string[],
  billingFails: false,
}))
vi.mock("@/lib/enterprise/program-admins", () => ({
  requireNopAdmin: async () => (s.who ? { admin: s.who, name: "Quinn", role: "program" } : { response: Response.json({ error: "Unauthorized" }, { status: 401 }) }),
  audit: async (_w: unknown, action: string, detail: string) => void s.audits.push(`${action} ${detail}`),
}))
vi.mock("@/lib/enterprise/agent-account-deletion", () => ({
  summarizeAgentAccount: async (id: string) => (s.summary && id === s.summary.agentId ? s.summary : null),
  deleteAgentAccount: async (agentId: string, o: { by: string; reason: string }) => {
    if (s.billingFails) return { ok: false, reason: "billing_failed", message: "card_declined" }
    if (!s.summary || agentId !== s.summary.agentId) return { ok: false, reason: "not_found" }
    s.deleted.push({ agentId, by: o.by, reason: o.reason })
    return { ok: true, deletion: { agentId, leads: 3, events: 1, photo: true, billing: { cancelled: true, refunded: 1200, currency: "usd" } } }
  },
}))

beforeEach(() => {
  s.who = "quinn@x.test"; s.deleted.length = 0; s.audits.length = 0; s.billingFails = false
  s.summary = { agentId: "123456", account: "agent@x.test", name: "Pat Lee", status: "active", leads: 3, events: 1, photo: true, paidPro: true }
})

const route = () => import("@/app/api/admin/enterprise/nop/agent-deletion/route")
const post = async (body: unknown) => {
  const res = await (await route()).POST(new NextRequest("http://x", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }))
  return { status: res.status, json: await res.json() }
}

describe("delete agent account", () => {
  it("preview shows what goes", async () => {
    const res = await (await route()).GET(new NextRequest("http://x/api?agentId=123456"))
    expect((await res.json()).summary).toMatchObject({ leads: 3, events: 1, paidPro: true })
    expect((await (await route()).GET(new NextRequest("http://x/api?agentId=999999"))).status).toBe(404)
  })

  it("needs the Agent ID typed again and confirm: true", async () => {
    expect((await post({ agentId: "123456", confirm: true })).json.error).toBe("confirm_required")
    expect((await post({ agentId: "123456", confirmAgentId: "123457", confirm: true })).json.error).toBe("confirm_required")
    expect((await post({ agentId: "123456", confirmAgentId: "123456" })).json.error).toBe("confirm_required")
    expect(s.deleted).toEqual([])
  })

  it("a program admin deletes; it's logged with them, and billing shows in the log", async () => {
    const res = await post({ agentId: "123456", confirmAgentId: "123456", confirm: true })
    expect(res.status).toBe(200)
    expect(s.deleted).toEqual([{ agentId: "123456", by: "quinn@x.test", reason: "admin" }])
    expect(s.audits).toEqual(["agent.delete_account agent 123456: 3 leads, 1 events, Pro cancelled, 1200 cents refunded"])
  })

  it("Stripe refuses: nothing deleted, a clear message, not logged as deleted", async () => {
    s.billingFails = true
    const res = await post({ agentId: "123456", confirmAgentId: "123456", confirm: true })
    expect(res.status).toBe(502)
    expect(res.json.message).toContain("nothing was deleted")
    expect(s.audits).toEqual([])
  })

  it("signed out or an agent: 401", async () => {
    s.who = null
    expect((await post({ agentId: "123456", confirmAgentId: "123456", confirm: true })).status).toBe(401)
    expect(s.deleted).toEqual([])
  })
})
