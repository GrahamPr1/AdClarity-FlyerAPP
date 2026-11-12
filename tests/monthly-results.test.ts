import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

/**
 * The monthly results email: last month's numbers, every plan (trial: scans
 * only, clicks and leads never read), zero reported as zero; only in the first
 * week of a month, once per account; never enterprise, NOP, paused, or anyone
 * who switched it off; dry run unless PUBLIC_MONTHLY_EMAIL_LIVE=1.
 */

type Acct = { email: string; planId: string; pausedAt: string | null; isEnterpriseAccount: boolean; flyers: { id: string; title: string; status: string; trackingCode?: string }[] }
const s = vi.hoisted(() => ({
  kv: new Map<string, unknown>(),
  accounts: [] as Acct[],
  records: new Map<string, { email: string; flyerId: string; createdAt: string }>(),
  month: new Map<string, { scans: number; clicks: number }>(),
  leadsSince: new Map<string, (since: Date) => number>(),
  leadCalls: 0,
  nop: new Set<string>(),
  sent: [] as Record<string, unknown>[],
  sendFails: false,
}))
vi.mock("@upstash/redis", () => ({
  Redis: { fromEnv: () => ({ get: async (k: string) => s.kv.get(k) ?? null, set: async (k: string, v: unknown) => void s.kv.set(k, v) }) },
}))
vi.mock("resend", () => ({
  Resend: class {
    emails = { send: async (p: Record<string, unknown>) => (s.sendFails ? { error: { message: "provider down" } } : (s.sent.push(p), { error: null })) }
  },
}))
vi.mock("@/lib/store", () => ({
  listClientsWithDeliverables: async () => s.accounts,
  getTrackingRecord: async (code: string) => s.records.get(code) ?? null,
  getTrackingMonthStats: async (code: string, month: string) => s.month.get(`${code}:${month}`) ?? { scans: 0, clicks: 0 },
  listFlyerChannelCodes: async () => [],
  countLeadsForFlyer: async (flyerId: string, since: Date) => (s.leadCalls++, { total: 0, since: s.leadsSince.get(flyerId)?.(since) ?? 0 }),
}))
vi.mock("@/lib/enterprise/agents-store", () => ({ isNopAgentAccount: async (e: string) => s.nop.has(e) }))
vi.mock("@/lib/lead-digest", () => ({ runLeadDigest: async ({ live }: { live: boolean }) => ({ live, accounts: 0, sent: [], wouldSend: [], dropped: [], failed: [] }) }))

import { runMonthlyResults, reportWindow } from "@/lib/monthly-results"
import { setEmailPreferences, verifyUnsubscribe } from "@/lib/email-preferences"

const NOV_3 = new Date("2026-11-03T13:00:00Z")
const OCT_START = Date.parse("2026-10-01T04:00:00Z")
const NOV_START = Date.parse("2026-11-01T04:00:00Z")

function account(email: string, planId: string, extra: Partial<Acct> = {}) {
  s.accounts.push({ email, planId, pausedAt: null, isEnterpriseAccount: false, flyers: [{ id: `f-${email}`, title: `Roof sale (${email})`, status: "Ready", trackingCode: `c-${email}` }], ...extra })
  s.records.set(`c-${email}`, { email, flyerId: `f-${email}`, createdAt: "2026-09-15T00:00:00Z" })
}

beforeEach(() => {
  vi.stubEnv("SESSION_SECRET", "test-secret")
  vi.stubEnv("RESEND_API_KEY", "re_test")
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://oneflyer.org")
  s.kv.clear(); s.records.clear(); s.month.clear(); s.leadsSince.clear(); s.nop.clear()
  s.accounts = []; s.sent = []; s.sendFails = false; s.leadCalls = 0
})
afterEach(() => vi.unstubAllEnvs())

describe("when it runs", () => {
  it("reports the previous month, and only in the first week", () => {
    expect(reportWindow(NOV_3)).toEqual({ month: "2026-10", inWindow: true })
    expect(reportWindow(new Date("2026-11-12T15:00:00Z")).inWindow).toBe(false)
    expect(reportWindow(new Date("2027-01-02T15:00:00Z")).month).toBe("2026-12")
  })
  it("outside the window nothing is read or sent", async () => {
    account("b@x.test", "basic")
    const r = await runMonthlyResults({ live: true, now: new Date("2026-11-12T15:00:00Z") })
    expect(r).toMatchObject({ inWindow: false, accounts: 0 })
    expect(s.sent).toHaveLength(0)
  })
})

describe("what it says", () => {
  it("Basic/Pro: scans, clicks and leads for the month (leads counted inside the month only)", async () => {
    account("b@x.test", "basic")
    s.month.set("c-b@x.test:2026-10", { scans: 23, clicks: 9 })
    s.leadsSince.set("f-b@x.test", (since) => (since.getTime() <= OCT_START ? 5 : since.getTime() <= NOV_START ? 2 : 0))
    await runMonthlyResults({ live: true, now: NOV_3 })
    const mail = s.sent[0] as { subject: string; html: string; text: string; headers: Record<string, string> }
    expect(mail.subject).toBe("Your flyers in October 2026: 23 scans, 9 clicks, 3 leads")
    expect(mail.text).toContain("Roof sale (b@x.test): 23 scans, 9 clicks, 3 leads")
    expect(verifyUnsubscribe(Object.fromEntries(new URL(mail.headers["List-Unsubscribe"].slice(1, -1)).searchParams))).toEqual({ email: "b@x.test", category: "results" })
  })
  it("trial: scans only — clicks and leads aren't read or shown", async () => {
    account("t@x.test", "trial")
    s.month.set("c-t@x.test:2026-10", { scans: 4, clicks: 3 })
    await runMonthlyResults({ live: true, now: NOV_3 })
    const mail = s.sent[0] as { subject: string; html: string; text: string }
    expect(mail.subject).toBe("Your flyers in October 2026: 4 scans")
    expect(mail.html).not.toMatch(/>Clicks<|>Leads</)
    expect(mail.text).not.toMatch(/\d+ clicks?|\d+ leads?/)
    expect(s.leadCalls).toBe(0)
  })
  it("a month with no activity is reported as zero", async () => {
    account("b@x.test", "pro")
    await runMonthlyResults({ live: true, now: NOV_3 })
    const mail = s.sent[0] as { subject: string; text: string }
    expect(mail.subject).toBe("Your flyers in October 2026: 0 scans, 0 clicks, 0 leads")
    expect(mail.text).toContain("None of your flyers' QR codes were scanned in October 2026.")
  })
})

describe("who gets it", () => {
  it("never enterprise, NOP, paused, switched off, or with nothing to report", async () => {
    account("ent@x.test", "pro", { isEnterpriseAccount: true })
    account("nop@x.test", "pro"); s.nop.add("nop@x.test")
    account("paused@x.test", "basic", { pausedAt: "2026-10-20T00:00:00Z" })
    account("off@x.test", "basic"); await setEmailPreferences("off@x.test", { results: false })
    account("noqr@x.test", "basic", { flyers: [{ id: "f", title: "No QR", status: "Ready" }] })
    account("new@x.test", "basic"); s.records.set("c-new@x.test", { email: "new@x.test", flyerId: "f-new@x.test", createdAt: "2026-11-02T00:00:00Z" })
    const r = await runMonthlyResults({ live: true, now: NOV_3 })
    expect(s.sent).toHaveLength(0)
    expect(Object.fromEntries(r.skipped.map((x) => [x.to, x.why]))).toEqual({
      "ent@x.test": "enterprise account",
      "nop@x.test": "NOP agent account",
      "paused@x.test": "account paused",
      "off@x.test": "monthly results switched off",
      "noqr@x.test": "no flyer with a QR code to report on",
      "new@x.test": "no flyer with a QR code to report on",
    })
  })
  it("once per account per month; a failed send is retried the next day", async () => {
    account("b@x.test", "basic")
    s.sendFails = true
    expect((await runMonthlyResults({ live: true, now: NOV_3 })).failed).toEqual([{ to: "b@x.test", reason: "provider down" }])
    s.sendFails = false
    expect((await runMonthlyResults({ live: true, now: new Date("2026-11-04T13:00:00Z") })).sent).toEqual(["b@x.test"])
    expect((await runMonthlyResults({ live: true, now: new Date("2026-11-05T13:00:00Z") })).sent).toEqual([])
    expect(s.sent).toHaveLength(1)
  })
  it("dry run: reports, sends nothing, marks nothing", async () => {
    account("b@x.test", "basic")
    s.month.set("c-b@x.test:2026-10", { scans: 2, clicks: 1 })
    const r = await runMonthlyResults({ live: false, now: NOV_3 })
    expect(r.wouldSend).toEqual([{ to: "b@x.test", plan: "basic", flyers: 1, scans: 2 }])
    expect(s.sent).toHaveLength(0)
    expect((await runMonthlyResults({ live: false, now: NOV_3 })).wouldSend).toHaveLength(1)
  })
})

describe("the cron and the switch", () => {
  it("dry run unless PUBLIC_MONTHLY_EMAIL_LIVE=1, independently of the digest", async () => {
    vi.stubEnv("CRON_SECRET", "cron-secret")
    vi.stubEnv("PUBLIC_DIGEST_LIVE", "1")
    vi.stubEnv("PUBLIC_MONTHLY_EMAIL_LIVE", "")
    const { NextRequest } = await import("next/server")
    const { GET } = await import("@/app/api/cron/public-emails/route")
    const res = await GET(new NextRequest("https://oneflyer.org/api/cron/public-emails", { headers: { authorization: "Bearer cron-secret" } }))
    expect(await res.json()).toMatchObject({ live: true, monthly: { live: false } })
  })
  it("unsubscribing from results switches only that off", async () => {
    const { unsubscribedPatch } = await import("@/lib/email-preferences")
    expect(unsubscribedPatch("results")).toEqual({ results: false })
    expect(await setEmailPreferences("b@x.test", unsubscribedPatch("results"))).toMatchObject({ leads: "instant", results: false })
  })
})
