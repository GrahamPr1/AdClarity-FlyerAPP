import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { createHmac } from "node:crypto"
import { NextRequest } from "next/server"

/**
 * Resend bounce webhook: signature checked before anything is read; a
 * temporary bounce of a lead email is retried once, an hour later; a retry
 * that bounces, or a permanent bounce, isn't; the owner sees a notice that a
 * later delivery clears; other mail on the Resend account is ignored.
 */

const s = vi.hoisted(() => ({ kv: new Map<string, unknown>(), sent: [] as Record<string, unknown>[], nextId: 1 }))
vi.mock("@upstash/redis", () => ({
  Redis: {
    fromEnv: () => ({
      get: async (k: string) => s.kv.get(k) ?? null,
      set: async (k: string, v: unknown) => void s.kv.set(k, v),
      del: async (k: string) => (s.kv.delete(k) ? 1 : 0),
    }),
  },
}))
vi.mock("resend", () => ({
  Resend: class {
    emails = { send: async (p: Record<string, unknown>) => (s.sent.push(p), { data: { id: `msg_${s.nextId++}` }, error: null }) }
  },
}))
vi.mock("@/lib/store", () => ({
  getTrackingRecord: async (code: string) => ({ code, email: "owner@x.test", flyerId: "f1", businessName: "Pearl Roofing", headline: "Roof sale", expiresAt: null }),
  getLead: async (_owner: string, id: string) => ({ id, flyerId: "f1", code: "c1", name: "Sam", phone: "270-555-0100", email: null, message: null, createdAt: new Date().toISOString() }),
  saveLead: async () => {},
}))
vi.mock("@/lib/offer-page-access", () => ({ offerPageFeaturesEnabledFor: async () => true }))
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: async () => ({ allowed: true, retryAfterSeconds: 0 }), clientIp: () => "1.2.3.4" }))

import { getDeliveryNotice, recordSent, verifyResendSignature } from "@/lib/email-delivery"

const SECRET = `whsec_${Buffer.from("test-webhook-secret").toString("base64")}`
function sign(body: string, opts: { id?: string; ts?: number; secret?: string } = {}) {
  const id = opts.id ?? "msg_hook_1"
  const ts = String(opts.ts ?? Math.floor(Date.now() / 1000))
  const key = Buffer.from((opts.secret ?? SECRET).replace(/^whsec_/, ""), "base64")
  const sig = createHmac("sha256", key).update(`${id}.${ts}.${body}`).digest("base64")
  return { "svix-id": id, "svix-timestamp": ts, "svix-signature": `v1,${sig}` }
}

beforeEach(() => {
  vi.stubEnv("SESSION_SECRET", "test-secret")
  vi.stubEnv("RESEND_API_KEY", "re_test")
  vi.stubEnv("RESEND_WEBHOOK_SECRET", SECRET)
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://oneflyer.org")
  s.kv.clear()
  s.sent = []
  s.nextId = 1
})
afterEach(() => vi.unstubAllEnvs())

describe("verifyResendSignature", () => {
  const body = JSON.stringify({ type: "email.bounced" })
  const h = (x: Record<string, string>) => ({ id: x["svix-id"], timestamp: x["svix-timestamp"], signature: x["svix-signature"] })
  it("accepts Resend's signature", () => expect(verifyResendSignature(body, h(sign(body)), SECRET)).toBe(true))
  it("rejects a tampered body, a wrong secret, a stale timestamp, a missing header", () => {
    expect(verifyResendSignature(body + " ", h(sign(body)), SECRET)).toBe(false)
    expect(verifyResendSignature(body, h(sign(body, { secret: `whsec_${Buffer.from("other").toString("base64")}` })), SECRET)).toBe(false)
    expect(verifyResendSignature(body, h(sign(body, { ts: Math.floor(Date.now() / 1000) - 3600 })), SECRET)).toBe(false)
    expect(verifyResendSignature(body, { id: null, timestamp: null, signature: null }, SECRET)).toBe(false)
  })
  it("accepts any one of several signatures (secret rotation)", () => {
    const x = sign(body)
    expect(verifyResendSignature(body, { ...h(x), signature: `v1,AAAA ${x["svix-signature"]}` }, SECRET)).toBe(true)
  })
})

describe("POST /api/webhooks/resend", () => {
  const route = () => import("@/app/api/webhooks/resend/route")
  async function deliver(event: unknown, headers?: Record<string, string>) {
    const body = JSON.stringify(event)
    const res = await (await route()).POST(new NextRequest("https://oneflyer.org/api/webhooks/resend", { method: "POST", body, headers: headers ?? sign(body) }))
    return { status: res.status, body: await res.json() }
  }
  const bounce = (emailId: string, type = "Transient") => ({ type: "email.bounced", data: { email_id: emailId, to: ["owner@icloud.test"], bounce: { type, subType: "General", message: "554 5.7.1 Command rejected" } } })

  it("refuses an unsigned or forged request before reading it", async () => {
    expect((await deliver(bounce("msg_x"), { "svix-id": "a", "svix-timestamp": String(Math.floor(Date.now() / 1000)), "svix-signature": "v1,Zm9yZ2Vk" })).status).toBe(401)
  })

  it("ignores mail it doesn't follow (e.g. NOP's sign-in codes on the same Resend account)", async () => {
    expect((await deliver(bounce("msg_not_ours"))).body).toMatchObject({ handled: false })
    expect(s.sent).toHaveLength(0)
  })

  it("temporary bounce: retried once, an hour later, and the owner sees a notice", async () => {
    await recordSent("msg_orig", { kind: "lead", owner: "owner@x.test", code: "c1", leadId: "L1", attempt: 1 })
    const r = await deliver(bounce("msg_orig"))
    expect(r.body).toMatchObject({ handled: true, action: "retry_scheduled" })
    expect(s.sent).toHaveLength(1)
    const when = Date.parse((s.sent[0] as { scheduledAt: string }).scheduledAt)
    expect(when - Date.now()).toBeGreaterThan(55 * 60 * 1000)
    expect(await getDeliveryNotice("owner@x.test")).toMatchObject({ address: "owner@icloud.test", type: "temporary", retrying: true })

    // The retry bounces too: no third attempt.
    const r2 = await deliver(bounce("msg_1"))
    expect(r2.body).toMatchObject({ handled: true, action: "notice_set" })
    expect(s.sent).toHaveLength(1)
  })

  it("permanent bounce: not retried; notice says the address was refused", async () => {
    await recordSent("msg_orig", { kind: "lead", owner: "owner@x.test", code: "c1", leadId: "L1", attempt: 1 })
    expect((await deliver(bounce("msg_orig", "Permanent"))).body).toMatchObject({ action: "notice_set" })
    expect(s.sent).toHaveLength(0)
    expect(await getDeliveryNotice("owner@x.test")).toMatchObject({ type: "permanent", retrying: false })
  })

  it("no retry once the owner has switched lead emails off", async () => {
    const { setEmailPreferences } = await import("@/lib/email-preferences")
    await setEmailPreferences("owner@x.test", { leads: "off" })
    await recordSent("msg_orig", { kind: "lead", owner: "owner@x.test", code: "c1", leadId: "L1", attempt: 1 })
    await deliver(bounce("msg_orig"))
    expect(s.sent).toHaveLength(0)
  })

  it("a later delivered lead email clears the notice", async () => {
    await recordSent("msg_orig", { kind: "lead", owner: "owner@x.test", code: "c1", leadId: "L1", attempt: 1 })
    await deliver(bounce("msg_orig", "Permanent"))
    await recordSent("msg_later", { kind: "lead", owner: "owner@x.test", code: "c1", leadId: "L2", attempt: 1 })
    expect((await deliver({ type: "email.delivered", data: { email_id: "msg_later" } })).body).toMatchObject({ action: "notice_cleared" })
    expect(await getDeliveryNotice("owner@x.test")).toBeNull()
  })
})

describe("the lead route records what it sent", () => {
  it("so a bounce can be matched back to the lead", async () => {
    const { POST } = await import("@/app/api/leads/[code]/route")
    await POST(new NextRequest("https://oneflyer.org/api/leads/c1", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "Sam", phone: "270-555-0100", email: "", message: "" }) }), { params: Promise.resolve({ code: "c1" }) })
    expect(s.kv.get("email-sent:v1:msg_1")).toMatchObject({ kind: "lead", owner: "owner@x.test", code: "c1", attempt: 1 })
  })
})
