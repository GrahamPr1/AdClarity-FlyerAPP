import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { NextRequest } from "next/server"

/**
 * Email preferences and the signed one-click unsubscribe: the link can't be
 * forged, a GET never unsubscribes, the mail client's RFC 8058 POST and the
 * page's confirm both work, and the lead email carries the headers and footer
 * — and is not sent once the owner has switched lead emails off.
 */

const s = vi.hoisted(() => ({ kv: new Map<string, unknown>(), sent: [] as Record<string, unknown>[], leads: [] as unknown[] }))
vi.mock("@upstash/redis", () => ({
  Redis: { fromEnv: () => ({ get: async (k: string) => s.kv.get(k) ?? null, set: async (k: string, v: unknown) => void s.kv.set(k, v) }) },
}))
vi.mock("resend", () => ({
  Resend: class {
    emails = { send: async (payload: Record<string, unknown>) => (s.sent.push(payload), { error: null }) }
  },
}))
vi.mock("@/lib/store", () => ({
  getTrackingRecord: async (code: string) => ({ code, email: "owner@x.test", flyerId: "f1", businessName: "Pearl Roofing", headline: "Roof sale", expiresAt: null }),
  saveLead: async (_email: string, lead: unknown) => void s.leads.push(lead),
}))
vi.mock("@/lib/offer-page-access", () => ({ offerPageFeaturesEnabledFor: async () => true }))
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: async () => ({ allowed: true, retryAfterSeconds: 0 }), clientIp: () => "1.2.3.4" }))

import { getEmailPreferences, oneClickUnsubscribeUrl, unsubscribePageUrl, verifyUnsubscribe } from "@/lib/email-preferences"

beforeEach(() => {
  vi.stubEnv("SESSION_SECRET", "test-secret")
  vi.stubEnv("RESEND_API_KEY", "re_test")
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://oneflyer.org")
  s.kv.clear()
  s.sent = []
  s.leads = []
})
afterEach(() => vi.unstubAllEnvs())

const paramsOf = (url: string) => Object.fromEntries(new URL(url).searchParams)

describe("signed unsubscribe links", () => {
  it("verify for the email and category they were made for", () => {
    expect(verifyUnsubscribe(paramsOf(unsubscribePageUrl("Owner@X.test", "leads")))).toEqual({ email: "owner@x.test", category: "leads" })
  })

  it("can't be pointed at someone else, or another category, or forged", () => {
    const p = paramsOf(unsubscribePageUrl("owner@x.test", "leads"))
    expect(verifyUnsubscribe({ ...p, e: Buffer.from("victim@x.test").toString("base64url") })).toBeNull()
    expect(verifyUnsubscribe({ ...p, c: "monthly" })).toBeNull()
    expect(verifyUnsubscribe({ ...p, t: p.t.slice(0, -2) + "xx" })).toBeNull()
    expect(verifyUnsubscribe({})).toBeNull()
  })
})

describe("POST /api/email/unsubscribe", () => {
  const route = () => import("@/app/api/email/unsubscribe/route")

  it("has no GET — a mail scanner opening the link changes nothing", async () => {
    expect((await route()) as Record<string, unknown>).not.toHaveProperty("GET")
  })

  it("the mail client's one-click POST (RFC 8058) switches lead emails off and answers 200", async () => {
    const res = await (await route()).POST(new NextRequest(oneClickUnsubscribeUrl("owner@x.test", "leads"), {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: "List-Unsubscribe=One-Click",
    }))
    expect(res.status).toBe(200)
    expect((await getEmailPreferences("owner@x.test")).leads).toBe("off")
  })

  it("the page's confirm button is sent back to the page to show it worked", async () => {
    const res = await (await route()).POST(new NextRequest(oneClickUnsubscribeUrl("owner@x.test", "leads"), {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: "from=page",
    }))
    expect(res.status).toBe(303)
    expect(res.headers.get("location")).toMatch(/\/unsubscribe\?done=leads$/)
  })

  it("refuses a tampered link and changes nothing", async () => {
    const url = oneClickUnsubscribeUrl("owner@x.test", "leads").replace(/t=[^&]+/, "t=forged")
    const res = await (await route()).POST(new NextRequest(url, { method: "POST" }))
    expect(res.status).toBe(400)
    expect((await getEmailPreferences("owner@x.test")).leads).toBe("instant")
  })
})

describe("the lead email", () => {
  const submit = async () => {
    const { POST } = await import("@/app/api/leads/[code]/route")
    return POST(
      new NextRequest("https://oneflyer.org/api/leads/c1", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "Sam", phone: "270-555-0100", email: "", message: "" , consent: true }) }),
      { params: Promise.resolve({ code: "c1" }) },
    )
  }

  it("carries List-Unsubscribe headers and a working footer link", async () => {
    const res = await submit()
    expect(res.status).toBe(200)
    expect(s.sent).toHaveLength(1)
    const mail = s.sent[0] as { headers: Record<string, string>; html: string }
    expect(mail.headers["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click")
    const header = mail.headers["List-Unsubscribe"].slice(1, -1)
    expect(verifyUnsubscribe(paramsOf(header))).toEqual({ email: "owner@x.test", category: "leads" })
    const footer = mail.html.match(/href="([^"]*\/unsubscribe\?[^"]*)"/)![1].replace(/&amp;/g, "&")
    expect(verifyUnsubscribe(paramsOf(footer))).toEqual({ email: "owner@x.test", category: "leads" })
  })

  it("is not sent when the owner has lead emails off — the lead is still saved", async () => {
    const { setEmailPreferences } = await import("@/lib/email-preferences")
    await setEmailPreferences("owner@x.test", { leads: "off" })
    const res = await submit()
    expect(res.status).toBe(200)
    expect(s.sent).toHaveLength(0)
    expect(s.leads).toHaveLength(1)
  })
})

describe("PUT /api/account/email-preferences", () => {
  it("accepts a known mode for the signed-in account and refuses anything else", async () => {
    const { createSessionToken, SESSION_COOKIE } = await import("@/lib/auth")
    const { PUT } = await import("@/app/api/account/email-preferences/route")
    const cookie = `${SESSION_COOKIE}=${await createSessionToken("owner@x.test")}`
    const put = (body: unknown) => PUT(new NextRequest("https://oneflyer.org/api/account/email-preferences", { method: "PUT", headers: { cookie, "content-type": "application/json" }, body: JSON.stringify(body) }))
    expect((await put({ leads: "off" })).status).toBe(200)
    expect((await getEmailPreferences("owner@x.test")).leads).toBe("off")
    expect((await put({ leads: "sometimes" })).status).toBe(422)
  })
})
