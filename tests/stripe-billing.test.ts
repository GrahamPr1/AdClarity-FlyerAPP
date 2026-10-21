import { describe, it, expect, vi, beforeEach } from "vitest"
import Stripe from "stripe"
import { usageWindow, addMonthsUtc, RESET_PERIOD_MS } from "@/lib/usage-window"
import type { MemberBilling } from "@/lib/types"

// ---- Usage window ----------------------------------------------------------

const DAY = 24 * 60 * 60 * 1000
const utc = (s: string) => Date.parse(s)

function billingFixture(over: Partial<MemberBilling> = {}): MemberBilling {
  return {
    stripeSubscriptionId: "sub_1",
    priceId: "price_x",
    plan: "basic",
    interval: "monthly",
    unitAmount: 1900,
    status: "active",
    currentPeriodStart: utc("2026-10-05T12:00:00Z"),
    currentPeriodEnd: utc("2026-11-05T12:00:00Z"),
    cancelAtPeriodEnd: false,
    collectionPaused: false,
    currentPeriodPaid: true,
    paidSince: null,
    lastPaymentDate: null,
    lastPaymentAmount: null,
    lastPaymentTax: null,
    billingState: null,
    failedPaymentCount: 0,
    refundCount: 0,
    disputeCount: 0,
    lastDisputeAt: null,
    cancellationReason: null,
    cancellationFeedback: null,
    canceledAt: null,
    endedAt: null,
    planSource: "stripe",
    overrideBy: null,
    overrideAt: null,
    overridePlan: null,
    syncedAt: "2026-10-05T12:00:00Z",
    ...over,
  }
}
const sub = billingFixture

describe("usage window", () => {
  it("free trial keeps the rolling 30 days from its stored start", () => {
    const start = utc("2026-10-01T00:00:00Z")
    const w = usageWindow(start + 10 * DAY, "trial", start, null)
    expect(w).toEqual({ start, end: start + RESET_PERIOD_MS, source: "rolling" })
  })

  it("free trial rolls to a fresh window once 30 days pass", () => {
    const start = utc("2026-09-01T00:00:00Z")
    const now = start + 31 * DAY
    expect(usageWindow(now, "trial", start, null).start).toBe(now)
  })

  it("a monthly subscriber's window IS the Stripe billing period", () => {
    const s = sub({})
    const w = usageWindow(utc("2026-10-20T00:00:00Z"), "basic", utc("2026-09-01T00:00:00Z"), s)
    expect(w).toEqual({ start: s.currentPeriodStart!, end: s.currentPeriodEnd!, source: "stripe" })
  })

  it("resets exactly on the Stripe boundary once the renewal is synced", () => {
    const renewed = sub({ currentPeriodStart: utc("2026-11-05T12:00:00Z"), currentPeriodEnd: utc("2026-12-05T12:00:00Z") })
    const w = usageWindow(utc("2026-11-05T12:00:01Z"), "basic", utc("2026-10-05T12:00:00Z"), renewed)
    expect(w.start).toBe(utc("2026-11-05T12:00:00Z"))
  })

  it("does not grant a new allowance before Stripe has actually renewed", () => {
    // Period ended, renewal webhook not in yet: stay in the old window.
    const s = sub({})
    expect(usageWindow(utc("2026-11-06T00:00:00Z"), "basic", s.currentPeriodStart, s).start).toBe(s.currentPeriodStart)
  })

  it("an annual subscriber still gets a MONTHLY allowance, stepped from the period start", () => {
    const s = sub({ interval: "annual", currentPeriodStart: utc("2026-01-31T00:00:00Z"), currentPeriodEnd: utc("2027-01-31T00:00:00Z") })
    const w = usageWindow(utc("2026-03-15T00:00:00Z"), "basic", null, s)
    expect(new Date(w.start).toISOString()).toBe("2026-02-28T00:00:00.000Z")
    expect(new Date(w.end).toISOString()).toBe("2026-03-31T00:00:00.000Z")
  })

  it("the last annual step ends at the period end, not beyond it", () => {
    const s = sub({ interval: "annual", currentPeriodStart: utc("2026-01-10T00:00:00Z"), currentPeriodEnd: utc("2027-01-10T00:00:00Z") })
    const w = usageWindow(utc("2026-12-20T00:00:00Z"), "pro", null, s)
    expect(new Date(w.start).toISOString()).toBe("2026-12-10T00:00:00.000Z")
    expect(w.end).toBe(s.currentPeriodEnd!)
  })

  it("a renewal whose invoice is NOT paid does not reset usage — it keeps the previous allowance", () => {
    const previousStart = utc("2026-10-05T12:00:00Z")
    const renewedUnpaid = sub({
      status: "past_due",
      currentPeriodPaid: false,
      currentPeriodStart: utc("2026-11-05T12:00:00Z"),
      currentPeriodEnd: utc("2026-12-05T12:00:00Z"),
    })
    const w = usageWindow(utc("2026-11-06T00:00:00Z"), "basic", previousStart, renewedUnpaid)
    expect(w.start).toBe(previousStart)
  })

  it("...and resets as soon as that invoice is paid", () => {
    const paid = sub({ status: "active", currentPeriodPaid: true, currentPeriodStart: utc("2026-11-05T12:00:00Z"), currentPeriodEnd: utc("2026-12-05T12:00:00Z") })
    expect(usageWindow(utc("2026-11-07T00:00:00Z"), "basic", utc("2026-10-05T12:00:00Z"), paid).start).toBe(utc("2026-11-05T12:00:00Z"))
  })

  it("past_due keeps the Stripe window (plan is kept while Stripe retries)", () => {
    expect(usageWindow(utc("2026-10-20T00:00:00Z"), "basic", null, sub({ status: "past_due" })).source).toBe("stripe")
  })

  it("a cancelled subscriber falls back to the rolling clock, without a fresh reset", () => {
    const stored = utc("2026-10-05T12:00:00Z")
    const w = usageWindow(utc("2026-10-20T00:00:00Z"), "trial", stored, sub({ status: "canceled" }))
    expect(w).toEqual({ start: stored, end: stored + RESET_PERIOD_MS, source: "rolling" })
  })

  it("addMonthsUtc clamps to the end of shorter months", () => {
    expect(new Date(addMonthsUtc(utc("2026-01-31T05:00:00Z"), 1)).toISOString()).toBe("2026-02-28T05:00:00.000Z")
    expect(new Date(addMonthsUtc(utc("2026-08-31T00:00:00Z"), 4)).toISOString()).toBe("2026-12-31T00:00:00.000Z")
  })
})

// ---- Price map / entitlement ----------------------------------------------

describe("price map and entitlement", () => {
  beforeEach(() => {
    vi.stubEnv("STRIPE_PRICE_BASIC_MONTHLY", "price_bm")
    vi.stubEnv("STRIPE_PRICE_BASIC_ANNUAL", "price_ba")
    vi.stubEnv("STRIPE_PRICE_PRO_MONTHLY", "price_pm")
    vi.stubEnv("STRIPE_PRICE_PRO_ANNUAL", "price_pa")
  })

  it("maps every configured price back to its plan and interval", async () => {
    const { planForPriceId, priceIdFor } = await import("@/lib/stripe")
    expect(planForPriceId("price_pa")).toEqual({ plan: "pro", interval: "annual" })
    expect(priceIdFor("basic", "monthly")).toBe("price_bm")
    expect(planForPriceId("price_unknown")).toBeNull()
  })

  it("keeps the plan through past_due, drops it once Stripe gives up", async () => {
    const { isEntitledStatus } = await import("@/lib/stripe")
    expect(isEntitledStatus("active")).toBe(true)
    expect(isEntitledStatus("past_due")).toBe(true)
    for (const s of ["canceled", "unpaid", "incomplete", "incomplete_expired", "paused"] as const) {
      expect(isEntitledStatus(s)).toBe(false)
    }
  })
})

// ---- Webhook route --------------------------------------------------------

const store = vi.hoisted(() => ({
  claimStripeEvent: vi.fn(),
  completeStripeEvent: vi.fn(),
  releaseStripeEvent: vi.fn(),
  appendBillingEvent: vi.fn(),
}))
const billing = vi.hoisted(() => ({
  processStripeEvent: vi.fn(),
}))
vi.mock("@/lib/store", () => store)
vi.mock("@/lib/billing", () => billing)

const SECRET = "whsec_unit_test"

function signedRequest(payload: object, secret = SECRET) {
  const body = JSON.stringify(payload)
  const header = Stripe.webhooks.generateTestHeaderString({ payload: body, secret })
  return new Request("http://localhost/api/stripe/webhook", {
    method: "POST",
    body,
    headers: { "stripe-signature": header, "content-type": "application/json" },
  })
}

const subUpdated = {
  id: "evt_test_1",
  object: "event",
  type: "customer.subscription.updated",
  data: { object: { id: "sub_123", object: "subscription" } },
}

describe("POST /api/stripe/webhook", () => {
  beforeEach(() => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_unit")
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", SECRET)
    vi.clearAllMocks()
    store.claimStripeEvent.mockResolvedValue("claimed")
    billing.processStripeEvent.mockResolvedValue({ at: "2026-10-21T00:00:00Z", type: "customer.subscription.updated", eventId: "evt_test_1", email: "a@example.com", plan: "pro", amount: null, tax: null, status: "active", state: null })
  })

  async function post(req: Request) {
    const { POST } = await import("@/app/api/stripe/webhook/route")
    // NextRequest is a Request subclass; the route only uses text() and headers.
    return POST(req as never)
  }

  it("rejects a bad signature with 400 and touches nothing", async () => {
    const res = await post(signedRequest(subUpdated, "whsec_wrong"))
    expect(res.status).toBe(400)
    expect(store.claimStripeEvent).not.toHaveBeenCalled()
    expect(billing.processStripeEvent).not.toHaveBeenCalled()
  })

  it("rejects a missing signature with 400", async () => {
    const res = await post(new Request("http://localhost/api/stripe/webhook", { method: "POST", body: "{}" }))
    expect(res.status).toBe(400)
  })

  it("applies a verified event once, logs its summary, and marks it done", async () => {
    const res = await post(signedRequest(subUpdated))
    expect(res.status).toBe(200)
    expect(billing.processStripeEvent).toHaveBeenCalledWith(expect.objectContaining({ id: "evt_test_1", type: "customer.subscription.updated" }))
    expect(store.appendBillingEvent).toHaveBeenCalledWith(expect.objectContaining({ email: "a@example.com", status: "active" }))
    expect(store.completeStripeEvent).toHaveBeenCalledWith("evt_test_1")
  })

  it("skips a duplicate delivery without re-applying it", async () => {
    store.claimStripeEvent.mockResolvedValue("done")
    const res = await post(signedRequest(subUpdated))
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ duplicate: true })
    expect(billing.processStripeEvent).not.toHaveBeenCalled()
  })

  it("asks Stripe to retry when the same event is mid-flight elsewhere", async () => {
    store.claimStripeEvent.mockResolvedValue("in_progress")
    const res = await post(signedRequest(subUpdated))
    expect(res.status).toBe(409)
    expect(billing.processStripeEvent).not.toHaveBeenCalled()
  })

  it("releases the claim when the handler fails, so Stripe's retry is processed", async () => {
    billing.processStripeEvent.mockRejectedValue(new Error("stripe down"))
    const res = await post(signedRequest(subUpdated))
    expect(res.status).toBe(500)
    expect(store.releaseStripeEvent).toHaveBeenCalledWith("evt_test_1")
    expect(store.completeStripeEvent).not.toHaveBeenCalled()
  })

  it("acknowledges event types it doesn't handle", async () => {
    billing.processStripeEvent.mockResolvedValue(null)
    const res = await post(signedRequest({ id: "evt_other", object: "event", type: "customer.created", data: { object: {} } }))
    expect(res.status).toBe(200)
    expect(store.appendBillingEvent).not.toHaveBeenCalled()
    expect(store.completeStripeEvent).toHaveBeenCalledWith("evt_other")
  })
})
