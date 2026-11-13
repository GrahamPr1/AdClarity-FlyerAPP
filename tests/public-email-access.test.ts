import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { NextRequest } from "next/server"
import { isValidElement, type ReactNode } from "react"

/**
 * Enterprise org accounts and NOP agents get none of the public emails, so
 * /profile doesn't show them the Emails section and the settings API refuses
 * them. Public accounts are unaffected. Lookups that fail count as excluded.
 */

const s = vi.hoisted(() => ({ kv: new Map<string, unknown>(), orgs: new Set<string>(), nop: new Set<string>(), broken: false, sub: "" }))
vi.mock("@upstash/redis", () => ({
  Redis: { fromEnv: () => ({ get: async (k: string) => s.kv.get(k) ?? null, set: async (k: string, v: unknown) => void s.kv.set(k, v) }) },
}))
vi.mock("@/lib/store", () => ({
  getAgentProfile: async (email: string) => {
    if (s.broken) throw new Error("redis down")
    return s.orgs.has(email) ? { orgId: "org-1" } : null
  },
}))
vi.mock("@/lib/enterprise/agents-store", () => ({ isNopAgentAccount: async (email: string) => s.nop.has(email) }))
vi.mock("next/headers", () => ({ cookies: async () => ({}) }))
vi.mock("next/navigation", () => ({ redirect: (to: string) => { throw new Error(`redirect ${to}`) } }))
vi.mock("@/lib/auth", () => ({ ADMIN_SUB: "admin", getSessionIdentity: async () => (s.sub ? { sub: s.sub } : null) }))

import { receivesPublicEmails } from "@/lib/public-email-access"
import { EmailSettings } from "@/components/email-settings"

beforeEach(() => {
  vi.stubEnv("SESSION_SECRET", "test-secret")
  s.kv.clear(); s.orgs = new Set(["org@x.test"]); s.nop = new Set(["nop@x.test"]); s.broken = false; s.sub = ""
})
afterEach(() => vi.unstubAllEnvs())

/** Whether a rendered element tree contains a given component. */
function contains(node: ReactNode, type: unknown): boolean {
  if (Array.isArray(node)) return node.some((n) => contains(n, type))
  if (!isValidElement(node)) return false
  if (node.type === type) return true
  return contains((node.props as { children?: ReactNode }).children, type)
}

describe("receivesPublicEmails", () => {
  it("public accounts yes; enterprise org and NOP agents no", async () => {
    expect(await receivesPublicEmails("owner@x.test")).toBe(true)
    expect(await receivesPublicEmails("org@x.test")).toBe(false)
    expect(await receivesPublicEmails("nop@x.test")).toBe(false)
  })
  it("fails closed when a lookup fails", async () => {
    s.broken = true
    expect(await receivesPublicEmails("owner@x.test")).toBe(false)
  })
})

describe("/profile", () => {
  const page = async () => (await import("@/app/profile/page")).default()
  it("shows the Emails section to a public account", async () => {
    s.sub = "owner@x.test"
    expect(contains(await page(), EmailSettings)).toBe(true)
  })
  for (const who of ["org@x.test", "nop@x.test"]) {
    it(`hides it from ${who.split("@")[0]}`, async () => {
      s.sub = who
      expect(contains(await page(), EmailSettings)).toBe(false)
    })
  }
})

describe("/api/account/email-preferences", () => {
  const req = (method: "GET" | "PUT") =>
    new NextRequest("https://oneflyer.org/api/account/email-preferences", {
      method,
      headers: { "content-type": "application/json" },
      ...(method === "PUT" ? { body: JSON.stringify({ leads: "off", results: false }) } : {}),
    })
  for (const who of ["org@x.test", "nop@x.test"]) {
    it(`${who.split("@")[0]}: GET and PUT refused, nothing saved`, async () => {
      s.sub = who
      const { GET, PUT } = await import("@/app/api/account/email-preferences/route")
      expect((await GET(req("GET"))).status).toBe(403)
      const put = await PUT(req("PUT"))
      expect(put.status).toBe(403)
      expect(await put.json()).toMatchObject({ error: "not_available" })
      expect(s.kv.size).toBe(0)
    })
  }
  it("a public account can still read and change its settings", async () => {
    s.sub = "owner@x.test"
    const { GET, PUT } = await import("@/app/api/account/email-preferences/route")
    expect((await GET(req("GET"))).status).toBe(200)
    expect(await (await PUT(req("PUT"))).json()).toMatchObject({ ok: true, preferences: { leads: "off", results: false } })
  })
})
