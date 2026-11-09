import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { NextRequest } from "next/server"

/**
 * Agent Pro billing ($40/month): its own price, customers, metadata and
 * webhook, separate from SMB. The tier follows the subscription as Stripe has
 * it now; Stripe only ever moves a tier it set itself (an admin-set Pro or
 * Leader is never touched); only an active Basic agent can buy, and never
 * while an admin views their portal.
 */

const AGENT_PRICE = "price_agent_test"
const r = vi.hoisted(() => ({
  kv: new Map<string, unknown>(),
  subs: new Map<string, Record<string, unknown>>(),
  sessions: [] as Record<string, unknown>[],
  customers: [] as Record<string, unknown>[],
  ctx: { email: "agent@x.test", tier: "basic", active: true } as Record<string, unknown> | null,
  viewingAs: false,
}))
vi.mock("@upstash/redis", () => {
  const fake = {
    get: async (k: string) => r.kv.get(k) ?? null,
    set: async (k: string, v: unknown, o?: { nx?: boolean }) => { if (o?.nx && r.kv.has(k)) return null; r.kv.set(k, v); return "OK" },
    del: async (k: string) => (r.kv.delete(k) ? 1 : 0),
  }
  return { Redis: { fromEnv: () => fake } }
})
vi.mock("@/lib/stripe", async (orig) => ({
  ...(await orig<typeof import("@/lib/stripe")>()),
  getStripe: () => ({
    subscriptions: { retrieve: async (id: string) => r.subs.get(id) },
    customers: { create: async (p: Record<string, unknown>) => (r.customers.push(p), { id: `cus_${r.customers.length}` }) },
    checkout: { sessions: { create: async (p: Record<string, unknown>) => (r.sessions.push(p), { id: "cs_1", url: "https://checkout.stripe.com/c/cs_1" }) } },
    billingPortal: { sessions: { create: async () => ({ url: "https://billing.stripe.com/p/1" }) } },
    webhooks: { constructEvent: (body: string, sig: string) => { if (sig !== "good") throw new Error("bad signature"); return JSON.parse(body) } },
  }),
}))
vi.mock("@/lib/enterprise/portal/api", () => ({
  requireAgentFeature: async () => (r.ctx ? { viewer: {}, ctx: r.ctx } : { response: Response.json({ error: "not_an_agent" }, { status: 404 }) }),
}))
vi.mock("@/lib/enterprise/portal/view-as", () => ({
  rejectWhileViewingAs: () => (r.viewingAs ? Response.json({ error: "read_only" }, { status: 403 }) : null),
}))

const sub = (id: string, status: string, over: Record<string, unknown> = {}) => {
  const s = {
    id, status, customer: "cus_1", cancel_at_period_end: false, metadata: { oneflyer_agent_email: "agent@x.test" },
    items: { data: [{ price: { id: AGENT_PRICE }, current_period_start: 1_800_000_000, current_period_end: 1_802_592_000 }] }, ...over,
  }
  r.subs.set(id, s)
  return s
}
const lib = () => import("@/lib/enterprise/portal/agent-billing")
const store = () => import("@/lib/enterprise/portal/store")

beforeEach(() => {
  vi.stubEnv("STRIPE_PRICE_AGENT_PRO_MONTHLY", AGENT_PRICE)
  vi.stubEnv("STRIPE_AGENT_WEBHOOK_SECRET", "whsec_test")
  r.kv.clear(); r.subs.clear(); r.sessions.length = 0; r.customers.length = 0
  r.ctx = { email: "agent@x.test", tier: "basic", active: true }
  r.viewingAs = false
})
afterEach(() => vi.unstubAllEnvs())

describe("the tier follows the subscription", () => {
  it.each([
    ["active", "pro", "paid_pro"],
    ["trialing", "pro", "paid_pro"],
    ["past_due", "pro", "past_due"],
    ["unpaid", "basic", "cancelled"],
    ["canceled", "basic", "cancelled"],
    ["incomplete_expired", "basic", "cancelled"],
  ])("%s -> %s (%s)", async (status, tier, label) => {
    const { syncAgentSubscription, getAgentBilling, agentBillingLabel } = await lib()
    const { getAgentTier, getAgentTierSource } = await store()
    sub("sub_1", "active")
    await syncAgentSubscription("sub_1")
    sub("sub_1", status)
    await syncAgentSubscription("sub_1")
    expect(await getAgentTier("agent@x.test")).toBe(tier)
    expect(agentBillingLabel(await getAgentTier("agent@x.test"), await getAgentTierSource("agent@x.test"), await getAgentBilling("agent@x.test"))).toBe(label)
  })

  it("cancel at period end: still Pro until Stripe ends it, labeled as cancelling", async () => {
    const { syncAgentSubscription, getAgentBilling, agentBillingLabel } = await lib()
    const { getAgentTier, getAgentTierSource } = await store()
    sub("sub_1", "active", { cancel_at_period_end: true })
    await syncAgentSubscription("sub_1")
    expect(await getAgentTier("agent@x.test")).toBe("pro")
    expect(agentBillingLabel("pro", await getAgentTierSource("agent@x.test"), await getAgentBilling("agent@x.test"))).toBe("cancels")
  })

  it("an admin-set Pro or Leader is never changed by billing, and is labeled admin-set", async () => {
    const { syncAgentSubscription, getAgentBilling, agentBillingLabel } = await lib()
    const { setAgentTier, getAgentTier, getAgentTierSource } = await store()
    for (const tier of ["pro", "leader"] as const) {
      await setAgentTier("agent@x.test", tier)
      sub("sub_1", "canceled")
      await syncAgentSubscription("sub_1")
      expect(await getAgentTier("agent@x.test")).toBe(tier)
      expect(agentBillingLabel(tier, await getAgentTierSource("agent@x.test"), await getAgentBilling("agent@x.test"))).toBe("admin_set")
    }
  })

  it("an old subscription ending doesn't end a newer live one (re-subscribed)", async () => {
    const { syncAgentSubscription } = await lib()
    const { getAgentTier } = await store()
    sub("sub_old", "active"); await syncAgentSubscription("sub_old")
    sub("sub_new", "active"); await syncAgentSubscription("sub_new")
    sub("sub_old", "canceled")
    expect(await syncAgentSubscription("sub_old")).toMatchObject({ applied: false })
    expect(await getAgentTier("agent@x.test")).toBe("pro")
  })

  it("an SMB subscription (another price) is ignored entirely", async () => {
    const { syncAgentSubscription } = await lib()
    sub("sub_smb", "active", { items: { data: [{ price: { id: "price_smb_pro" }, current_period_start: 1, current_period_end: 2 }] } })
    expect(await syncAgentSubscription("sub_smb")).toMatchObject({ applied: false, reason: "not an agent Pro subscription" })
    expect(r.kv.has("client:agent@x.test:agent-tier")).toBe(false)
  })

  it("checkout.session.completed acts only on agent Pro sessions", async () => {
    const { processAgentStripeEvent } = await lib()
    sub("sub_1", "active")
    const event = (metadata: Record<string, string>) => ({ type: "checkout.session.completed", data: { object: { mode: "subscription", subscription: "sub_1", customer: "cus_1", metadata } } })
    expect(await processAgentStripeEvent(event({ oneflyer_email: "smb@x.test" }) as never)).toBeNull()
    expect(await processAgentStripeEvent(event({ oneflyer_product: "agent_pro", oneflyer_agent_email: "agent@x.test" }) as never)).toMatchObject({ applied: true, tier: "pro" })
  })

  it("failed renewals are counted and reset by the next payment", async () => {
    const { recordAgentInvoice, getAgentBilling } = await lib()
    sub("sub_1", "past_due")
    const inv = (paid: boolean) => ({ parent: { subscription_details: { subscription: "sub_1" } }, amount_paid: paid ? 4000 : 0, status_transitions: { paid_at: 1_800_000_100 } })
    await recordAgentInvoice(inv(false) as never, false)
    await recordAgentInvoice(inv(false) as never, false)
    expect((await getAgentBilling("agent@x.test"))?.failedPayments).toBe(2)
    sub("sub_1", "active")
    await recordAgentInvoice(inv(true) as never, true)
    expect(await getAgentBilling("agent@x.test")).toMatchObject({ failedPayments: 0, status: "active" })
  })
})

describe("who can buy", () => {
  const checkout = async () => {
    const { POST } = await import("@/app/api/enterprise/agent/billing/checkout/route")
    const res = await POST(new NextRequest("http://x/api", { method: "POST" }))
    return { status: res.status, json: await res.json() }
  }

  it("an active Basic agent gets Checkout for the agent price, with nothing SMB's webhook would act on", async () => {
    const res = await checkout()
    expect(res).toEqual({ status: 200, json: { url: "https://checkout.stripe.com/c/cs_1" } })
    const s = r.sessions[0]
    expect(s).toMatchObject({ mode: "subscription", line_items: [{ price: AGENT_PRICE, quantity: 1 }], automatic_tax: { enabled: true }, payment_method_types: ["card"] })
    expect(s.client_reference_id).toBeUndefined()
    expect(JSON.stringify(s)).not.toContain('"oneflyer_email"')
    expect(r.customers[0]).toEqual({ email: "agent@x.test", metadata: { oneflyer_agent_email: "agent@x.test" } })
  })

  it("pending/suspended (not active), already Pro, or an admin viewing: refused, no Checkout", async () => {
    r.ctx = { email: "agent@x.test", tier: "basic", active: false }
    expect((await checkout()).status).toBe(403)
    r.ctx = { email: "agent@x.test", tier: "pro", active: true }
    expect((await checkout()).status).toBe(409)
    r.ctx = { email: "agent@x.test", tier: "basic", active: true }
    r.viewingAs = true
    expect((await checkout()).status).toBe(403)
    r.viewingAs = false
    r.ctx = null
    expect((await checkout()).status).toBe(404)
    expect(r.sessions).toEqual([])
  })

  it("no agent price configured: unavailable", async () => {
    vi.stubEnv("STRIPE_PRICE_AGENT_PRO_MONTHLY", "")
    expect((await checkout()).status).toBe(503)
    const { canBuyPro } = await lib()
    expect(canBuyPro({ tier: "basic", active: true })).toBe(false)
  })
})

describe("webhook", () => {
  const post = async (body: unknown, sig = "good") => {
    const { POST } = await import("@/app/api/stripe/agent-webhook/route")
    const res = await POST(new NextRequest("http://x/api", { method: "POST", headers: { "stripe-signature": sig }, body: JSON.stringify(body) }))
    return { status: res.status, json: await res.json() }
  }
  const event = { id: "evt_1", type: "customer.subscription.updated", data: { object: { id: "sub_1" } } }

  it("refuses a bad signature before doing anything", async () => {
    sub("sub_1", "active")
    expect((await post(event, "bad")).status).toBe(400)
    expect(r.kv.has("client:agent@x.test:agent-tier")).toBe(false)
  })

  it("applies an event once; a redelivery is skipped", async () => {
    sub("sub_1", "active")
    expect(await post(event)).toEqual({ status: 200, json: { received: true } })
    sub("sub_1", "canceled")
    expect(await post(event)).toEqual({ status: 200, json: { received: true, duplicate: true } })
    const { getAgentTier } = await store()
    expect(await getAgentTier("agent@x.test")).toBe("pro")
  })
})
