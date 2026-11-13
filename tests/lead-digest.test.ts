import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { NextRequest } from "next/server"

/**
 * The daily lead digest: "Once a day" queues instead of emailing; the job
 * sends one digest per account only when live, keeps every queue on a dry
 * run, decides eligibility at send time (lead emails off, or no lead capture
 * any more -> dropped, nothing sent), keeps the queue if the send fails, and
 * the cron route refuses anything without the cron secret.
 */

const s = vi.hoisted(() => ({
  kv: new Map<string, unknown>(),
  lists: new Map<string, string[]>(),
  sets: new Map<string, Set<string>>(),
  sent: [] as Record<string, unknown>[],
  sendFails: false,
  eligible: new Set<string>(),
}))
vi.mock("@upstash/redis", () => ({
  Redis: {
    fromEnv: () => ({
      get: async (k: string) => s.kv.get(k) ?? null,
      set: async (k: string, v: unknown) => void s.kv.set(k, v),
      del: async (k: string) => (s.lists.delete(k), s.kv.delete(k), 1),
      rpush: async (k: string, v: string) => (s.lists.set(k, [...(s.lists.get(k) ?? []), v]), s.lists.get(k)!.length),
      lrange: async (k: string) => [...(s.lists.get(k) ?? [])],
      ltrim: async (k: string, start: number) => void s.lists.set(k, (s.lists.get(k) ?? []).slice(start)),
      llen: async (k: string) => (s.lists.get(k) ?? []).length,
      sadd: async (k: string, v: string) => void s.sets.set(k, new Set([...(s.sets.get(k) ?? []), v])),
      srem: async (k: string, v: string) => void s.sets.get(k)?.delete(v),
      smembers: async (k: string) => [...(s.sets.get(k) ?? [])],
    }),
  },
}))
vi.mock("resend", () => ({
  Resend: class {
    emails = { send: async (p: Record<string, unknown>) => (s.sendFails ? { error: { message: "provider down" } } : (s.sent.push(p), { error: null })) }
  },
}))
vi.mock("@/lib/offer-page-access", () => ({ offerPageFeaturesEnabledFor: async (email: string) => s.eligible.has(email) }))
vi.mock("@/lib/store", () => ({
  getTrackingRecord: async (code: string) => ({ code, email: "owner@x.test", flyerId: "f1", businessName: "Pearl Roofing", headline: "Roof sale", expiresAt: null }),
  saveLead: async () => {},
}))
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: async () => ({ allowed: true, retryAfterSeconds: 0 }), clientIp: () => "1.2.3.4" }))
vi.mock("@/lib/public-email-access", () => ({ receivesPublicEmails: async () => true }))

import { queueLeadForDigest, runLeadDigest } from "@/lib/lead-digest"
import { setEmailPreferences, verifyUnsubscribe } from "@/lib/email-preferences"

const lead = (name: string) => ({ name, phone: "270-555-0100", email: null, message: null, createdAt: new Date().toISOString(), flyerTitle: "Roof sale", afterOfferEnded: false })

beforeEach(() => {
  vi.stubEnv("SESSION_SECRET", "test-secret")
  vi.stubEnv("RESEND_API_KEY", "re_test")
  vi.stubEnv("CRON_SECRET", "cron-secret")
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://oneflyer.org")
  vi.stubEnv("PUBLIC_DIGEST_LIVE", "1")
  s.kv.clear(); s.lists.clear(); s.sets.clear(); s.sent = []; s.sendFails = false
  s.eligible = new Set(["owner@x.test"])
})
afterEach(() => vi.unstubAllEnvs())

describe("a lead on 'Once a day'", () => {
  it("is queued for the digest, not emailed", async () => {
    await setEmailPreferences("owner@x.test", { leads: "daily" })
    const { POST } = await import("@/app/api/leads/[code]/route")
    const res = await POST(new NextRequest("https://oneflyer.org/api/leads/c1", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "Sam", phone: "270-555-0100", email: "", message: "" }) }), { params: Promise.resolve({ code: "c1" }) })
    expect(res.status).toBe(200)
    expect(s.sent).toHaveLength(0)
    expect(s.lists.get("lead-digest:v1:queue:owner@x.test")).toHaveLength(1)
  })
})

describe("runLeadDigest", () => {
  it("dry run: sends nothing and keeps the queue, reporting what it would send", async () => {
    await queueLeadForDigest("owner@x.test", lead("A"))
    await queueLeadForDigest("owner@x.test", lead("B"))
    const r = await runLeadDigest({ live: false })
    expect(r.wouldSend).toEqual([{ to: "owner@x.test", leads: 2 }])
    expect(s.sent).toHaveLength(0)
    expect(s.lists.get("lead-digest:v1:queue:owner@x.test")).toHaveLength(2)
  })

  it("live: one digest per account, with the unsubscribe headers, then the queue is cleared", async () => {
    await queueLeadForDigest("owner@x.test", lead("A"))
    await queueLeadForDigest("owner@x.test", lead("B"))
    const r = await runLeadDigest({ live: true })
    expect(r.sent).toEqual(["owner@x.test"])
    expect(s.sent).toHaveLength(1)
    const mail = s.sent[0] as { subject: string; headers: Record<string, string>; html: string }
    expect(mail.subject).toBe("2 new leads from your flyers")
    expect(mail.headers["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click")
    expect(verifyUnsubscribe(Object.fromEntries(new URL(mail.headers["List-Unsubscribe"].slice(1, -1)).searchParams))).toEqual({ email: "owner@x.test", category: "leads" })
    expect(s.lists.get("lead-digest:v1:queue:owner@x.test") ?? []).toHaveLength(0)
    expect((await runLeadDigest({ live: true })).sent).toEqual([])
  })

  it("lead emails switched off since: nothing sent, queue dropped", async () => {
    await queueLeadForDigest("owner@x.test", lead("A"))
    await setEmailPreferences("owner@x.test", { leads: "off" })
    const r = await runLeadDigest({ live: true })
    expect(r.dropped).toEqual([{ to: "owner@x.test", why: "lead emails switched off" }])
    expect(s.sent).toHaveLength(0)
  })

  it("no lead capture any more (trial, paused, enterprise): nothing sent, queue dropped", async () => {
    s.eligible.clear()
    await queueLeadForDigest("owner@x.test", lead("A"))
    const r = await runLeadDigest({ live: true })
    expect(r.dropped[0].to).toBe("owner@x.test")
    expect(s.sent).toHaveLength(0)
  })

  it("a failed send keeps the leads for tomorrow", async () => {
    s.sendFails = true
    await queueLeadForDigest("owner@x.test", lead("A"))
    const r = await runLeadDigest({ live: true })
    expect(r.failed).toEqual([{ to: "owner@x.test", reason: "provider down" }])
    expect(s.lists.get("lead-digest:v1:queue:owner@x.test")).toHaveLength(1)
  })
})

describe("while the scheduled emails are NOT live", () => {
  it("a lead on 'Once a day' is emailed instantly instead — never queued for a digest that won't go out", async () => {
    vi.stubEnv("PUBLIC_DIGEST_LIVE", "")
    await setEmailPreferences("owner@x.test", { leads: "daily" })
    const { POST } = await import("@/app/api/leads/[code]/route")
    await POST(new NextRequest("https://oneflyer.org/api/leads/c1", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "Sam", phone: "270-555-0100", email: "", message: "" }) }), { params: Promise.resolve({ code: "c1" }) })
    expect(s.sent).toHaveLength(1)
    expect(s.lists.get("lead-digest:v1:queue:owner@x.test")).toBeUndefined()
  })

  it("'Once a day' can't be chosen", async () => {
    vi.stubEnv("PUBLIC_DIGEST_LIVE", "")
    const { createSessionToken, SESSION_COOKIE } = await import("@/lib/auth")
    const { PUT, GET } = await import("@/app/api/account/email-preferences/route")
    const cookie = `${SESSION_COOKIE}=${await createSessionToken("owner@x.test")}`
    const res = await PUT(new NextRequest("https://oneflyer.org/api/account/email-preferences", { method: "PUT", headers: { cookie, "content-type": "application/json" }, body: JSON.stringify({ leads: "daily" }) }))
    expect(res.status).toBe(422)
    expect(await (await GET(new NextRequest("https://oneflyer.org/api/account/email-preferences", { headers: { cookie } }))).json()).toMatchObject({ digestAvailable: false })
  })
})

describe("GET /api/cron/public-emails", () => {
  it("refuses without the cron secret, and stays a dry run unless PUBLIC_DIGEST_LIVE=1", async () => {
    vi.stubEnv("PUBLIC_DIGEST_LIVE", "")
    const { GET } = await import("@/app/api/cron/public-emails/route")
    expect((await GET(new NextRequest("https://oneflyer.org/api/cron/public-emails"))).status).toBe(401)
    await queueLeadForDigest("owner@x.test", lead("A"))
    const res = await GET(new NextRequest("https://oneflyer.org/api/cron/public-emails", { headers: { authorization: "Bearer cron-secret" } }))
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ live: false, digest: { wouldSend: [{ to: "owner@x.test", leads: 1 }] } })
    expect(s.sent).toHaveLength(0)
  })
})
