import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

/**
 * The SMB webhook handler (lib/billing.ts processStripeEvent) and agent Pro
 * billing share one Stripe account, so the SMB endpoint receives agent events
 * too. The one-line guard skips them (no Stripe call, no store write, no
 * activity-log line); SMB events still go through exactly the same calls as
 * before.
 */

const s = vi.hoisted(() => ({ calls: [] as string[], stripeCalls: [] as string[] }))
vi.mock("@/lib/store", () => {
  const track = (name: string, value: unknown = undefined) => async (...args: unknown[]) => (s.calls.push(`${name}(${args.map((a) => (typeof a === "object" ? JSON.stringify(a) : a)).join(",")})`), value)
  return {
    appendBillingEvent: track("appendBillingEvent"),
    countBillingEvent: track("countBillingEvent"),
    getClient: track("getClient", { email: "smb@x.test", plan: "trial", pausedAt: null }),
    getEmailForStripeCustomer: track("getEmailForStripeCustomer", "smb@x.test"),
    getMemberBilling: track("getMemberBilling", null),
    getDispute: track("getDispute", null),
    getOrCreateClient: track("getOrCreateClient"),
    markWaitlistConverted: track("markWaitlistConverted"),
    recordDispute: track("recordDispute"),
    resetBillingCounter: track("resetBillingCounter"),
    setClientPaused: track("setClientPaused"),
    setClientPlan: track("setClientPlan"),
    setClientStripeCustomerId: track("setClientStripeCustomerId"),
    setMemberBillingFieldIfUnset: track("setMemberBillingFieldIfUnset"),
    updateMemberBilling: track("updateMemberBilling"),
  }
})
vi.mock("@/lib/stripe", async (orig) => ({
  ...(await orig<typeof import("@/lib/stripe")>()),
  getStripe: () => ({
    subscriptions: {
      retrieve: async (id: string) => (s.stripeCalls.push(`subscriptions.retrieve(${id})`), {
        id, status: "active", customer: { id: "cus_smb", address: { state: "KY", country: "US" } }, metadata: { oneflyer_email: "smb@x.test", oneflyer_plan: "pro" },
        items: { data: [{ price: { id: "price_smb_pro", unit_amount: 3900 }, current_period_start: 1_800_000_000, current_period_end: 1_802_592_000 }] },
        latest_invoice: { status: "paid" }, cancel_at_period_end: false, pause_collection: null, cancellation_details: null, canceled_at: null, ended_at: null,
      }),
    },
    customers: { retrieve: async (id: string) => (s.stripeCalls.push(`customers.retrieve(${id})`), { id, metadata: {} }) },
    invoicePayments: { list: async () => (s.stripeCalls.push("invoicePayments.list"), { data: [] }) },
  }),
}))

beforeEach(() => {
  s.calls.length = 0
  s.stripeCalls.length = 0
  vi.stubEnv("STRIPE_PRICE_PRO_MONTHLY", "price_smb_pro")
  vi.stubEnv("STRIPE_PRICE_PRO_ANNUAL", "price_smb_pro_y")
  vi.stubEnv("STRIPE_PRICE_BASIC_MONTHLY", "price_smb_basic")
  vi.stubEnv("STRIPE_PRICE_BASIC_ANNUAL", "price_smb_basic_y")
})
afterEach(() => vi.unstubAllEnvs())

const ev = (type: string, object: Record<string, unknown>) => ({ id: "evt_1", created: 1_800_000_000, type, data: { object } }) as never

describe("SMB webhook handler and agent events", () => {
  it("an SMB subscription update is synced exactly as before: plan set, billing written, summary returned", async () => {
    const { processStripeEvent } = await import("@/lib/billing")
    const summary = await processStripeEvent(ev("customer.subscription.updated", { id: "sub_smb", metadata: { oneflyer_email: "smb@x.test" } }))
    expect(s.stripeCalls).toEqual(["subscriptions.retrieve(sub_smb)"])
    expect(s.calls.some((c) => c.startsWith("updateMemberBilling(smb@x.test"))).toBe(true)
    expect(s.calls).toContain("setClientPlan(smb@x.test,pro)")
    expect(summary).toMatchObject({ type: "customer.subscription.updated", email: "smb@x.test", plan: "pro", status: "active" })
  })

  it("an SMB checkout links the customer and syncs, as before", async () => {
    const { processStripeEvent } = await import("@/lib/billing")
    const summary = await processStripeEvent(ev("checkout.session.completed", {
      mode: "subscription", subscription: "sub_smb", customer: "cus_smb", client_reference_id: "smb@x.test",
      metadata: { oneflyer_email: "smb@x.test", oneflyer_plan: "pro" }, customer_details: { address: { state: "KY", country: "US" } }, amount_total: 3900, total_details: { amount_tax: 0 }, payment_status: "paid",
    }))
    expect(s.calls).toContain("setClientStripeCustomerId(smb@x.test,cus_smb)")
    expect(summary).toMatchObject({ email: "smb@x.test", plan: "pro" })
  })

  it.each([
    ["checkout.session.completed", { mode: "subscription", subscription: "sub_agent", customer: "cus_agent", metadata: { oneflyer_product: "agent_pro", oneflyer_agent_email: "agent@x.test" } }],
    ["customer.subscription.updated", { id: "sub_agent", metadata: { oneflyer_product: "agent_pro" } }],
    ["customer.subscription.deleted", { id: "sub_agent", metadata: { oneflyer_product: "agent_pro" } }],
    ["invoice.paid", { id: "in_agent", customer: "cus_agent", amount_paid: 4240, parent: { subscription_details: { subscription: "sub_agent", metadata: { oneflyer_product: "agent_pro" } } } }],
    ["invoice.payment_failed", { id: "in_agent", customer: "cus_agent", amount_due: 4240, parent: { subscription_details: { subscription: "sub_agent", metadata: { oneflyer_product: "agent_pro" } } } }],
  ])("an agent %s is skipped: no Stripe call, no store write, no activity line", async (type, object) => {
    const { processStripeEvent } = await import("@/lib/billing")
    expect(await processStripeEvent(ev(type, object))).toBeNull()
    expect(s.stripeCalls).toEqual([])
    expect(s.calls).toEqual([])
  })
})
