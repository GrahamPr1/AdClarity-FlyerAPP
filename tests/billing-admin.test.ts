import { describe, it, expect } from "vitest"
import { PLANS } from "@/lib/plans"
import { computeOverview, freePaidPlanAudit, memberStatus, membersCsv, needsAttention, stripeCustomerUrl, toMemberRow } from "@/lib/billing-admin"
import type { BillingEventSummary, ClientRecord, MemberBilling, PlanId } from "@/lib/types"

const NOW = Date.parse("2026-10-21T12:00:00Z")

function billing(over: Partial<MemberBilling> = {}): MemberBilling {
  return {
    stripeSubscriptionId: "sub_x",
    priceId: "price_x",
    plan: "basic",
    interval: "monthly",
    unitAmount: 1900,
    status: "active",
    currentPeriodStart: Date.parse("2026-10-05T00:00:00Z"),
    currentPeriodEnd: Date.parse("2026-11-05T00:00:00Z"),
    cancelAtPeriodEnd: false,
    collectionPaused: false,
    currentPeriodPaid: true,
    paidSince: "2026-10-05T00:00:00Z",
    lastPaymentDate: null,
    lastPaymentAmount: null,
    lastPaymentTax: null,
    billingState: "KY",
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
    syncedAt: "2026-10-05T00:00:00Z",
    ...over,
  }
}

function client(email: string, plan: PlanId, b: MemberBilling | null): ClientRecord {
  return {
    email,
    plan,
    flyersCreated: 2,
    periodStart: NOW,
    periodEnd: NOW,
    businessCategory: "Other",
    isRealEstate: false,
    isAdmin: false,
    businessName: null,
    createdAt: "2026-09-01T00:00:00Z",
    lifetimeFlyersCreated: 2,
    lastCampaignAt: null,
    pausedAt: null,
    stripeCustomerId: b ? `cus_${email}` : null,
    billing: b,
  }
}

const members = [
  client("basic-monthly@x", "basic", billing()), // 1900
  client("pro-monthly@x", "pro", billing({ plan: "pro", unitAmount: 3900 })), // 3900
  client("basic-annual@x", "basic", billing({ interval: "annual", unitAmount: 18240 })), // 1520
  client("pro-annual-pastdue@x", "pro", billing({ plan: "pro", interval: "annual", unitAmount: 37440, status: "past_due", failedPaymentCount: 1 })), // 3120
  client("paused@x", "pro", billing({ plan: "pro", unitAmount: 3900, collectionPaused: true })), // excluded from MRR
  client("canceled-recent@x", "trial", billing({ status: "canceled", endedAt: "2026-10-10T00:00:00Z" })),
  client("canceled-old@x", "trial", billing({ status: "canceled", endedAt: "2026-08-01T00:00:00Z" })),
  client("trial@x", "trial", null),
  client("override@x", "pro", billing({ stripeSubscriptionId: null, status: null, planSource: "admin_override", overrideBy: "admin", overrideAt: "2026-10-20T00:00:00Z", overridePlan: "pro" })),
  client("free-pro@x", "pro", null),
]

describe("annual pricing display", () => {
  it("shows the exact monthly equivalent — $15.20 and $31.20, not rounded", () => {
    expect(PLANS.find((p) => p.id === "basic")!.annualMonthlyFee).toBe(15.2)
    expect(PLANS.find((p) => p.id === "pro")!.annualMonthlyFee).toBe(31.2)
  })

  it("× 12 equals exactly what the annual Stripe price charges", () => {
    expect(Math.round(PLANS.find((p) => p.id === "basic")!.annualMonthlyFee * 12 * 100)).toBe(18240)
    expect(Math.round(PLANS.find((p) => p.id === "pro")!.annualMonthlyFee * 12 * 100)).toBe(37440)
  })
})

describe("billing overview", () => {
  const events: BillingEventSummary[] = [
    { at: "2026-10-05T00:00:00Z", type: "invoice.paid", eventId: "e1", email: "a", plan: "basic", amount: 2014, tax: 114, status: "paid", state: "KY" },
    { at: "2026-10-06T00:00:00Z", type: "invoice.paid", eventId: "e2", email: "b", plan: "pro", amount: 4134, tax: 234, status: "paid", state: "KY" },
    { at: "2026-10-06T00:00:00Z", type: "checkout.session.completed", eventId: "e3", email: "b", plan: "pro", amount: 4134, tax: 234, status: "paid", state: "KY" }, // not double-counted
    { at: "2026-10-07T00:00:00Z", type: "invoice.paid", eventId: "e4", email: "c", plan: "basic", amount: 1900, tax: 0, status: "paid", state: "OH" },
    { at: "2026-09-30T00:00:00Z", type: "invoice.paid", eventId: "e5", email: "d", plan: "basic", amount: 2014, tax: 114, status: "paid", state: "KY" }, // last month
  ]
  const o = computeOverview({
    clients: members,
    totalSignups: 20,
    waitlistEmails: new Set(["basic-monthly@x", "someone-else@x"]),
    waitlistEntries: 3,
    events,
    now: NOW,
  })

  it("counts members by state", () => {
    expect(o.activeBasic).toBe(2)
    expect(o.activePro).toBe(1)
    expect(o.pastDue).toBe(1)
    expect(o.paused).toBe(1)
    expect(o.monthly).toBe(3) // basic-monthly, pro-monthly, paused
    expect(o.annual).toBe(2)
    expect(o.canceledLast30Days).toBe(1)
    expect(o.freeTrial).toBe(3)
    expect(o.paidMembers).toBe(5)
  })

  it("estimates MRR by hand: 1900 + 3900 + 18240/12 + 37440/12, paused excluded", () => {
    expect(o.estimatedMrrCents).toBe(1900 + 3900 + 1520 + 3120)
  })

  it("sums Kentucky tax from this month's invoice.paid events only", () => {
    expect(o.kentuckyTaxThisMonthCents).toBe(114 + 234)
  })

  it("computes both conversion rates", () => {
    expect(o.trialToPaidRate).toBeCloseTo(5 / 20)
    expect(o.paidFromWaitlist).toBe(1)
    expect(o.waitlistToPaidRate).toBeCloseTo(1 / 2)
  })
})

describe("needs attention", () => {
  const items = needsAttention(members, [
    { id: "dp_1", email: null, chargeId: "ch_1", amount: 2000, reason: "fraudulent", status: "needs_response", createdAt: "2026-10-21T00:00:00Z", closedAt: null },
    { id: "dp_won", email: "basic-monthly@x", chargeId: "ch_2", amount: 1900, reason: "fraudulent", status: "won", createdAt: "2026-10-01T00:00:00Z", closedAt: "2026-10-15T00:00:00Z" },
    { id: "dp_lost", email: "pro-monthly@x", chargeId: "ch_3", amount: 3900, reason: "general", status: "lost", createdAt: "2026-10-01T00:00:00Z", closedAt: "2026-10-15T00:00:00Z" },
    { id: "dp_inq", email: "pro-monthly@x", chargeId: "ch_4", amount: 3900, reason: "general", status: "warning_closed", createdAt: "2026-10-01T00:00:00Z", closedAt: null },
  ])
  it("lists past_due members, disputes (even unmatched) and admin overrides", () => {
    const kinds = items.map((i) => `${i.kind}:${i.email}`)
    expect(kinds).toContain("past_due:pro-annual-pastdue@x")
    expect(kinds).toContain("dispute:null")
    expect(kinds).toContain("admin_override:override@x")
    expect(kinds.filter((k) => k.startsWith("past_due"))).toHaveLength(1)
  })

  it("drops closed disputes (won, lost, warning_closed) and keeps open ones", () => {
    const disputes = items.filter((i) => i.kind === "dispute")
    expect(disputes).toHaveLength(1)
    expect(disputes[0].detail).toContain("dp_1")
  })

  it("keeps payment-failed members who aren't past due", () => {
    const failed = needsAttention([client("one-off-fail@x", "basic", billing({ failedPaymentCount: 1 }))], [])
    expect(failed.map((i) => i.kind)).toEqual(["payment_failed"])
  })
})

describe("free-Pro audit", () => {
  it("lists only paid plans with neither a live subscription nor a logged override", () => {
    expect(freePaidPlanAudit(members).map((c) => c.email)).toEqual(["free-pro@x"])
  })
})

describe("member rows", () => {
  it("derives a display status", () => {
    expect(memberStatus("pro", billing({ collectionPaused: true }))).toBe("paused")
    expect(memberStatus("trial", null)).toBe("free")
    expect(memberStatus("pro", null)).toBe("no_subscription")
    expect(memberStatus("basic", billing({ status: "past_due" }))).toBe("past_due")
  })

  it("shows renewal only for a live subscription", () => {
    expect(toMemberRow(members[0], new Set()).renewalDate).toBe("2026-11-05T00:00:00.000Z")
    expect(toMemberRow(members[5], new Set()).renewalDate).toBeNull()
  })

  it("CSV neutralises spreadsheet formulas and quotes commas", () => {
    const row = { ...toMemberRow(members[0], new Set()), email: "=HYPERLINK(1)", billingState: "K,Y" }
    const csv = membersCsv([row])
    expect(csv.split("\n")[1]).toMatch(/^'=HYPERLINK\(1\),/)
    expect(csv).toContain('"K,Y"')
  })

  it("links to the test dashboard unless live", () => {
    expect(stripeCustomerUrl("cus_1", false)).toBe("https://dashboard.stripe.com/test/customers/cus_1")
    expect(stripeCustomerUrl("cus_1", true)).toBe("https://dashboard.stripe.com/customers/cus_1")
  })
})
