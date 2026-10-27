import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { isCheckoutEnabled } from "@/lib/checkout-switch"
import type { ClientRecord, MemberBilling } from "@/lib/types"

describe("CHECKOUT_ENABLED parsing", () => {
  it("is ON when unset — forgetting the var can never block payments", () => {
    expect(isCheckoutEnabled(undefined)).toBe(true)
  })

  it("is ON for true-ish or unrecognised values", () => {
    for (const v of ["true", "TRUE", "1", "on", "yes", "", "anything"]) expect(isCheckoutEnabled(v)).toBe(true)
  })

  it("is OFF for false / 0 / off / no, in any case and with whitespace", () => {
    for (const v of ["false", "FALSE", "0", "off", "Off", " no ", "No"]) expect(isCheckoutEnabled(v)).toBe(false)
  })
})

// ---- createCheckoutSession honours the switch ----------------------------

const stripeFake = vi.hoisted(() => ({
  customers: { create: vi.fn(), retrieve: vi.fn() },
  checkout: { sessions: { create: vi.fn() } },
}))
const storeFake = vi.hoisted(() => ({
  getOrCreateClient: vi.fn(),
  setClientStripeCustomerId: vi.fn(),
}))

vi.mock("@/lib/stripe", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/stripe")>()),
  getStripe: () => stripeFake,
}))
vi.mock("@/lib/store", () => storeFake)

function client(billing: Partial<MemberBilling> | null = null): ClientRecord {
  return {
    email: "buyer@example.com",
    plan: billing ? "pro" : "trial",
    flyersCreated: 0,
    periodStart: 0,
    periodEnd: 0,
    businessCategory: "Other",
    isRealEstate: false,
    isAdmin: false,
    businessName: null,
    createdAt: null,
    lifetimeFlyersCreated: 0,
    lastCampaignAt: null,
    pausedAt: null,
    stripeCustomerId: billing ? "cus_existing" : null,
    billing: billing as MemberBilling | null,
  }
}

describe("createCheckoutSession with the kill switch", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_unit")
    vi.stubEnv("STRIPE_PRICE_PRO_MONTHLY", "price_pm")
    storeFake.getOrCreateClient.mockResolvedValue(client())
    stripeFake.customers.create.mockResolvedValue({ id: "cus_new" })
    stripeFake.checkout.sessions.create.mockResolvedValue({ id: "cs_1", url: "https://checkout.stripe.com/c/pay/cs_1" })
  })
  afterEach(() => vi.unstubAllEnvs())

  it("ON (unset): creates a Checkout Session as normal", async () => {
    vi.stubEnv("CHECKOUT_ENABLED", undefined as unknown as string)
    const { createCheckoutSession } = await import("@/lib/billing")
    const result = await createCheckoutSession("buyer@example.com", "pro", "monthly", "https://oneflyer.org")
    expect(result).toEqual({ kind: "checkout", url: "https://checkout.stripe.com/c/pay/cs_1", id: "cs_1" })
    expect(stripeFake.checkout.sessions.create).toHaveBeenCalledTimes(1)
    expect(stripeFake.checkout.sessions.create.mock.calls[0][0]).toMatchObject({ mode: "subscription", automatic_tax: { enabled: true } })
  })

  it("OFF: refuses — no session, and no Stripe customer created either", async () => {
    vi.stubEnv("CHECKOUT_ENABLED", "false")
    const { createCheckoutSession } = await import("@/lib/billing")
    const result = await createCheckoutSession("buyer@example.com", "pro", "monthly", "https://oneflyer.org")
    expect(result).toEqual({ kind: "unavailable" })
    expect(stripeFake.checkout.sessions.create).not.toHaveBeenCalled()
    expect(stripeFake.customers.create).not.toHaveBeenCalled()
  })

  it("OFF: an existing subscriber is still routed to manage their plan (the Portal path)", async () => {
    vi.stubEnv("CHECKOUT_ENABLED", "false")
    storeFake.getOrCreateClient.mockResolvedValue(client({ status: "active", stripeSubscriptionId: "sub_1" }))
    const { createCheckoutSession } = await import("@/lib/billing")
    const result = await createCheckoutSession("buyer@example.com", "pro", "monthly", "https://oneflyer.org")
    expect(result).toEqual({ kind: "already_subscribed" })
    expect(stripeFake.checkout.sessions.create).not.toHaveBeenCalled()
  })
})
