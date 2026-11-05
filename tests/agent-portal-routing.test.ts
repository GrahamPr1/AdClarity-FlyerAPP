import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { NextRequest } from "next/server"

/**
 * Old /enterprise/nop/* addresses redirect permanently into /agent/*, and
 * middleware sends a NOP agent who lands on the business pages to the
 * portal, while SMB customers and admin go through exactly as before.
 */

const s = vi.hoisted(() => ({ agents: new Set(["agent@x.test"]), fail: false }))
vi.mock("@/lib/enterprise/portal/agent-account-edge", () => ({
  holdsAgentId: async (email: string) => {
    if (s.fail) throw new Error("redis down")
    return s.agents.has(email)
  },
}))

beforeEach(() => { vi.stubEnv("SESSION_SECRET", "test-secret"); s.fail = false })
afterEach(() => vi.unstubAllEnvs())

async function redirectOf(fn: () => unknown) {
  try {
    await fn()
  } catch (e) {
    const d = (e as { digest?: string }).digest ?? ""
    const [, , url, status] = d.split(";")
    return { url, status }
  }
  return null
}

describe("old addresses", () => {
  it.each([
    ["/enterprise/nop/dashboard", () => import("@/app/enterprise/nop/dashboard/page"), undefined, "/agent"],
    ["/enterprise/nop/profile", () => import("@/app/enterprise/nop/profile/page"), undefined, "/agent/profile"],
    ["/enterprise/nop/flyer/NOP_P2_ES", () => import("@/app/enterprise/nop/flyer/[template]/page"), { template: "NOP_P2_ES" }, "/agent/create/NOP_P2_ES"],
  ] as const)("%s -> %s, permanent (308)", async (_from, load, params, to) => {
    const { default: Page } = await load()
    const r = await redirectOf(() => (Page as (p: unknown) => unknown)(params ? { params: Promise.resolve(params) } : {}))
    expect(r).toEqual({ url: to, status: "308" })
  })

  it("/enterprise/nop/register still goes to /agent/start", async () => {
    const { default: Page } = await import("@/app/enterprise/nop/register/page")
    expect((await redirectOf(() => Page()))?.url).toBe("/agent/start")
  })
})

async function mw(path: string, sub: string | null) {
  const { middleware } = await import("@/middleware")
  const { createSessionToken, SESSION_COOKIE } = await import("@/lib/auth")
  const headers: Record<string, string> = sub ? { cookie: `${SESSION_COOKIE}=${await createSessionToken(sub)}` } : {}
  const res = await middleware(new NextRequest(`http://x${path}`, { headers }))
  return { status: res.status, location: res.headers.get("location") }
}

describe("middleware", () => {
  it.each(["/dashboard", "/dashboard/offer/f1", "/onboarding", "/profile"])("a NOP agent on %s goes to /agent", async (path) => {
    expect(await mw(path, "agent@x.test")).toEqual({ status: 307, location: "http://x/agent" })
  })

  it.each(["/dashboard", "/onboarding", "/profile", "/dashboard/offer/f1"])("an SMB customer on %s goes through unchanged", async (path) => {
    expect((await mw(path, "shop@x.test")).location).toBeNull()
  })

  it("admin goes through; signed out still goes to login; /admin is untouched", async () => {
    expect((await mw("/dashboard", "admin")).location).toBeNull()
    expect((await mw("/dashboard", null)).location).toBe("http://x/login?next=%2Fdashboard")
    expect((await mw("/admin/enterprise/agents", "agent@x.test")).location).toBeNull()
  })

  it("if the agent lookup fails, the request carries on as before", async () => {
    s.fail = true
    const err = vi.spyOn(console, "error").mockImplementation(() => {})
    expect((await mw("/dashboard", "agent@x.test")).location).toBeNull()
    err.mockRestore()
  })
})
