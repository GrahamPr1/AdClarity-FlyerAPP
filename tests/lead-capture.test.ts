import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextRequest } from "next/server"
import type { ClientRecord, LeadRecord, TrackingRecord } from "@/lib/types"

/**
 * The offer-page lead form: POST /api/leads/{code}.
 *
 * Pins what the brief made hard requirements: a lead is saved and the owner
 * emailed on an active paid plan; a honeypot hit or a rate-limited burst is
 * dropped while answering exactly like success; the plan is enforced on the
 * server; and the saved record carries no IP address or other identifier.
 */

const db = vi.hoisted(() => ({
  tracking: new Map<string, unknown>(),
  clients: new Map<string, unknown>(),
  saved: [] as { email: string; lead: unknown }[],
  hits: new Map<string, number>(),
  rateKeys: [] as string[],
  emails: [] as unknown[],
  emailFails: false,
}))

vi.mock("@/lib/store", () => ({
  getTrackingRecord: async (code: string) => db.tracking.get(code) ?? null,
  getClient: async (email: string) => db.clients.get(email) ?? null,
  getAgentProfile: async () => null,
  saveLead: async (email: string, lead: unknown) => void db.saved.push({ email, lead }),
}))
vi.mock("@/lib/rate-limit", () => ({
  clientIp: (h: Headers) => h.get("x-forwarded-for")?.split(",")[0]!.trim() ?? "unknown",
  checkRateLimit: async (key: string, limit: number) => {
    db.rateKeys.push(key)
    const n = (db.hits.get(key) ?? 0) + 1
    db.hits.set(key, n)
    return { allowed: n <= limit, retryAfterSeconds: n <= limit ? 0 : 60 }
  },
}))
// Lead emails on (the default); email-preferences.test.ts covers "off".
vi.mock("@/lib/email-preferences", () => ({ getEmailPreferences: async () => ({ leads: "instant", updatedAt: null }) }))
vi.mock("@/lib/email", () => ({
  sendLeadNotification: async (input: unknown) => {
    db.emails.push(input)
    return db.emailFails ? { sent: false, reason: "resend down" } : { sent: true }
  },
}))

const OWNER = "owner@example.test"
const IP = "203.0.113.77"
const record: TrackingRecord = {
  email: OWNER, flyerId: "flyer-1", businessName: "Pearl Roofing",
  headline: "Spring roof check", offer: "$49 inspection", cta: "Call now", disclaimer: null,
  phone: "555-0142", website: null, createdAt: "2026-01-01T00:00:00.000Z",
}
const client = (over: Partial<ClientRecord>) => ({ email: OWNER, plan: "basic", pausedAt: null, ...over }) as ClientRecord
const good = { name: "Dana Reyes", phone: "(555) 010-2030", email: "dana@example.test", message: "Leaky skylight" }

async function submit(body: unknown, { code = "ABC2345", ip = IP } = {}) {
  const { POST } = await import("@/app/api/leads/[code]/route")
  const req = new NextRequest(`http://x/api/leads/${code}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip, "user-agent": "Mozilla/5.0 Test" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  })
  const res = await POST(req, { params: Promise.resolve({ code }) })
  return { status: res.status, json: await res.json() }
}

beforeEach(() => {
  db.tracking.clear(); db.clients.clear(); db.hits.clear()
  db.saved.length = 0; db.rateKeys.length = 0; db.emails.length = 0; db.emailFails = false
  db.tracking.set("ABC2345", record)
  db.clients.set(OWNER, client({}))
})

describe("a lead on an active paid plan", () => {
  it.each(["basic", "pro"] as const)("%s: saved, owner emailed, visitor told it worked", async (plan) => {
    db.clients.set(OWNER, client({ plan }))
    const res = await submit(good)
    expect(res).toEqual({ status: 200, json: { ok: true } })
    expect(db.saved).toHaveLength(1)
    expect(db.saved[0].email).toBe(OWNER)
    expect(db.saved[0].lead).toMatchObject({ flyerId: "flyer-1", code: "ABC2345", name: "Dana Reyes", phone: "(555) 010-2030", email: "dana@example.test", message: "Leaky skylight" })
    expect(db.emails).toHaveLength(1)
    expect(db.emails[0]).toMatchObject({ to: OWNER, businessName: "Pearl Roofing", dashboardUrl: "https://oneflyer.org/dashboard" })
  })

  it("holds only what the visitor typed, plus when and where: no IP, no user agent", async () => {
    await submit(good)
    const lead = db.saved[0].lead as LeadRecord
    expect(Object.keys(lead).sort()).toEqual(["afterOfferEnded", "code", "createdAt", "email", "flyerId", "id", "message", "name", "phone"])
    expect(JSON.stringify(lead)).not.toContain(IP)
    expect(JSON.stringify(lead)).not.toContain("Mozilla")
    expect(Number.isNaN(Date.parse(lead.createdAt))).toBe(false)
  })

  it("is still saved, and the visitor still told it worked, when the email fails", async () => {
    db.emailFails = true
    const errors = vi.spyOn(console, "error").mockImplementation(() => {})
    const res = await submit(good)
    expect(res.status).toBe(200)
    expect(db.saved).toHaveLength(1)
    expect(errors).toHaveBeenCalledWith(expect.stringContaining("owner email failed"), "resend down")
    errors.mockRestore()
  })

  it("treats email and message as optional", async () => {
    const res = await submit({ name: "Sam", phone: "555 010 2030", email: "", message: "" })
    expect(res.status).toBe(200)
    expect(db.saved[0].lead).toMatchObject({ email: null, message: null })
  })
})

describe("a lead after the offer's end date", () => {
  it("is still taken, flagged afterOfferEnded on the stored lead and in the owner's email", async () => {
    db.tracking.set("ABC2345", { ...record, expiresAt: "2020-01-31" })
    expect((await submit(good)).status).toBe(200)
    expect((db.saved[0].lead as LeadRecord).afterOfferEnded).toBe(true)
    expect(db.emails[0]).toMatchObject({ afterOfferEnded: true })
  })

  it("is not flagged while the offer is running, or when it has no end date", async () => {
    db.tracking.set("ABC2345", { ...record, expiresAt: "2099-12-31" })
    await submit(good)
    db.tracking.set("ABC2345", { ...record })
    await submit(good, { ip: "198.51.100.9" })
    expect(db.saved.map((s) => (s.lead as LeadRecord).afterOfferEnded)).toEqual([false, false])
    expect(db.emails.map((e) => (e as { afterOfferEnded: boolean }).afterOfferEnded)).toEqual([false, false])
  })

  it("plan gating is unchanged: a trial owner's ended offer still refuses the POST", async () => {
    db.tracking.set("ABC2345", { ...record, expiresAt: "2020-01-31" })
    db.clients.set(OWNER, client({ plan: "trial" }))
    expect((await submit(good)).status).toBe(403)
    expect(db.saved).toHaveLength(0)
  })
})

describe("spam is dropped silently", () => {
  it("a filled honeypot: 200 ok, nothing saved, nobody emailed", async () => {
    const res = await submit({ ...good, website: "http://spam.example" })
    expect(res).toEqual({ status: 200, json: { ok: true } })
    expect(db.saved).toHaveLength(0)
    expect(db.emails).toHaveLength(0)
  })

  it("past the per-IP limit: the same 200 ok, nothing saved", async () => {
    for (let i = 0; i < 5; i++) expect((await submit(good)).status).toBe(200)
    expect(db.saved).toHaveLength(5)
    const res = await submit(good)
    expect(res).toEqual({ status: 200, json: { ok: true } })
    expect(db.saved).toHaveLength(5)
    expect(db.emails).toHaveLength(5)
  })

  it("limits per IP and per flyer: another visitor, or another flyer, isn't blocked", async () => {
    for (let i = 0; i < 6; i++) await submit(good)
    db.tracking.set("XYZ6789", { ...record, flyerId: "flyer-2" })
    await submit(good, { ip: "198.51.100.9" })
    await submit(good, { code: "XYZ6789" })
    expect(db.saved).toHaveLength(7)
    expect(new Set(db.rateKeys)).toEqual(new Set([`lead:flyer-1:${IP}`, "lead:flyer-1:198.51.100.9", `lead:flyer-2:${IP}`]))
  })
})

describe("the plan is enforced on the server", () => {
  it.each([
    ["trial (also where a cancelled subscription lands)", client({ plan: "trial" })],
    ["paused basic", client({ plan: "basic", pausedAt: "2026-11-01T00:00:00.000Z" })],
    ["paused pro", client({ plan: "pro", pausedAt: "2026-11-01T00:00:00.000Z" })],
  ])("%s: a direct POST is refused and nothing is saved", async (_label, owner) => {
    db.clients.set(OWNER, owner)
    const res = await submit(good)
    expect(res.status).toBe(403)
    expect(db.saved).toHaveLength(0)
    expect(db.emails).toHaveLength(0)
  })

  it("an owner with no record: refused", async () => {
    db.clients.clear()
    expect((await submit(good)).status).toBe(403)
  })
})

describe("validation", () => {
  it.each([
    ["no name", { ...good, name: "  " }],
    ["no phone", { ...good, phone: "" }],
    ["a phone with letters", { ...good, phone: "call me maybe" }],
    ["too few digits", { ...good, phone: "12345" }],
    ["a bad email", { ...good, email: "dana@" }],
    ["a name over 100", { ...good, name: "x".repeat(101) }],
    ["a message over 1000", { ...good, message: "x".repeat(1001) }],
  ])("%s: 422 and nothing saved", async (_label, body) => {
    const res = await submit(body)
    expect(res.status).toBe(422)
    expect(typeof res.json.message).toBe("string")
    expect(db.saved).toHaveLength(0)
  })

  it("a body that isn't JSON: 400", async () => {
    expect((await submit("not json")).status).toBe(400)
  })

  it("an unknown code: 404", async () => {
    expect((await submit(good, { code: "NOPE000" })).status).toBe(404)
  })
})
