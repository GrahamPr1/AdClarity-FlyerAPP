import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextRequest } from "next/server"

/**
 * /api/account/leads lists and deletes the signed-in client's own leads only.
 * /api/admin/leads is admin-only, for removing a single lead on request.
 */

const s = vi.hoisted(() => ({ sub: "owner@example.test" as string | null, admin: false, deleted: [] as [string, string][], listed: [] as unknown[] }))
vi.mock("@/lib/auth", () => ({ ADMIN_SUB: "admin", getSessionIdentity: async () => (s.sub ? { sub: s.sub } : null) }))
vi.mock("@/lib/admin", () => ({ isAdminSession: async () => s.admin }))
vi.mock("@/lib/store", () => ({
  listLeadsForFlyer: async (email: string, flyerId: string) => (s.listed.push(["flyer", email, flyerId]), [{ id: "L1" }]),
  listLeadsForClient: async (email: string) => (s.listed.push(["client", email]), [{ id: "L1" }]),
  deleteLead: async (email: string, id: string) => (s.deleted.push([email, id]), email === "owner@example.test" && id === "L1"),
}))

const req = (url: string, method = "GET") => new NextRequest(`http://x${url}`, { method })
beforeEach(() => { s.sub = "owner@example.test"; s.admin = false; s.deleted.length = 0; s.listed.length = 0 })

describe("the owner's leads", () => {
  it("lists one flyer's leads under the session's own email", async () => {
    const { GET } = await import("@/app/api/account/leads/route")
    const res = (await GET(req("/api/account/leads?flyerId=flyer-1")))!
    expect(res.status).toBe(200)
    expect(s.listed).toEqual([["flyer", "owner@example.test", "flyer-1"]])
  })

  it("deletes a lead under the session's own email", async () => {
    const { DELETE } = await import("@/app/api/account/leads/route")
    expect((await DELETE(req("/api/account/leads?id=L1", "DELETE")))!.status).toBe(200)
    expect(s.deleted).toEqual([["owner@example.test", "L1"]])
  })

  it("someone else's lead id: 404, looked up only under the caller's email", async () => {
    s.sub = "other@example.test"
    const { DELETE } = await import("@/app/api/account/leads/route")
    expect((await DELETE(req("/api/account/leads?id=L1", "DELETE")))!.status).toBe(404)
    expect(s.deleted).toEqual([["other@example.test", "L1"]])
  })

  it("signed out: 401; the admin login: 403", async () => {
    const { GET } = await import("@/app/api/account/leads/route")
    s.sub = null
    expect((await GET(req("/api/account/leads?flyerId=flyer-1")))!.status).toBe(401)
    s.sub = "admin"
    expect((await GET(req("/api/account/leads?flyerId=flyer-1")))!.status).toBe(403)
  })
})

describe("admin lead delete", () => {
  it("refuses anyone who isn't admin", async () => {
    const { GET, DELETE } = await import("@/app/api/admin/leads/route")
    expect((await GET(req("/api/admin/leads?email=owner@example.test")))!.status).toBe(401)
    expect((await DELETE(req("/api/admin/leads?email=owner@example.test&id=L1", "DELETE")))!.status).toBe(401)
    expect(s.deleted).toEqual([])
  })

  it("lets admin list and delete one account's lead", async () => {
    s.admin = true
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    const { GET, DELETE } = await import("@/app/api/admin/leads/route")
    expect((await GET(req("/api/admin/leads?email=Owner@Example.test")))!.status).toBe(200)
    expect(s.listed).toEqual([["client", "owner@example.test"]])
    expect((await DELETE(req("/api/admin/leads?email=owner@example.test&id=L1", "DELETE")))!.status).toBe(200)
    expect((await DELETE(req("/api/admin/leads?email=owner@example.test&id=NOPE", "DELETE")))!.status).toBe(404)
    warn.mockRestore()
  })
})
