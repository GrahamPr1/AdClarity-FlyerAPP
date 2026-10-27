import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { NextRequest } from "next/server"
import { BEGIN_CHECKOUT_COOKIE, checkoutParams } from "@/lib/checkout-tracking"

/**
 * begin_checkout and purchase: sent once, with the plan, price and (for the
 * purchase) the Stripe subscription id, and the purchase only after the server
 * has confirmed a real, new subscription with Stripe.
 */

const stripeFake = vi.hoisted(() => ({ checkout: { sessions: { retrieve: vi.fn() } } }))
const claimed = vi.hoisted(() => new Set<string>())
const session = vi.hoisted(() => ({ sub: "buyer@example.com" as string | null }))
vi.mock("@/lib/stripe", async (importActual) => ({ ...(await importActual<typeof import("@/lib/stripe")>()), getStripe: () => stripeFake }))
vi.mock("@/lib/store", () => ({
  claimPurchaseReport: async (id: string) => (claimed.has(id) ? false : (claimed.add(id), true)),
}))
vi.mock("@/lib/auth", () => ({ getSessionIdentity: async () => (session.sub ? { sub: session.sub } : null) }))

const completed = (over: Record<string, unknown> = {}) => ({
  id: "cs_test_abc",
  mode: "subscription",
  status: "complete",
  payment_status: "paid",
  client_reference_id: "buyer@example.com",
  amount_subtotal: 1900,
  metadata: { oneflyer_plan: "basic", oneflyer_interval: "monthly" },
  subscription: { id: "sub_123", status: "active" },
  ...over,
})
const ask = async (id = "cs_test_abc") => {
  const { GET } = await import("@/app/api/billing/checkout-result/route")
  return (await GET(new NextRequest(`http://x/api/billing/checkout-result?session_id=${id}`))).json()
}

describe("the purchase is confirmed by the server, once", () => {
  beforeEach(() => {
    claimed.clear()
    session.sub = "buyer@example.com"
    stripeFake.checkout.sessions.retrieve.mockReset().mockResolvedValue(completed())
  })

  it("a paid, complete checkout with a live subscription: plan, value, USD, subscription id", async () => {
    expect((await ask()).purchase).toEqual({
      currency: "USD",
      value: 19,
      plan: "basic",
      interval: "monthly",
      items: [{ item_id: "basic", item_name: "Basic", item_variant: "monthly", price: 19, quantity: 1 }],
      transaction_id: "sub_123",
    })
    expect(stripeFake.checkout.sessions.retrieve).toHaveBeenCalledWith("cs_test_abc", { expand: ["subscription"] })
  })

  it("a reload (or another device) gets nothing the second time", async () => {
    expect((await ask()).purchase).not.toBeNull()
    expect(await ask()).toEqual({ purchase: null, reason: "already_reported" })
  })

  it("nothing for an unpaid, open or canceled-before-payment checkout", async () => {
    for (const over of [{ status: "open", payment_status: "unpaid", subscription: null }, { payment_status: "unpaid" }, { subscription: { id: "sub_9", status: "incomplete" } }]) {
      stripeFake.checkout.sessions.retrieve.mockResolvedValueOnce(completed(over))
      expect((await ask()).purchase).toBeNull()
    }
    expect(claimed.size).toBe(0) // nothing claimed, so a later real confirmation still counts
  })

  it("nothing for someone else's session, a made-up id, or no sign-in", async () => {
    stripeFake.checkout.sessions.retrieve.mockResolvedValueOnce(completed({ client_reference_id: "other@example.com" }))
    expect((await ask()).purchase).toBeNull()
    expect((await ask("not-a-session")).purchase).toBeNull()
    session.sub = null
    expect((await ask()).purchase).toBeUndefined()
  })
})

describe("/checkout queues begin_checkout only for a real Checkout Session", () => {
  it("sets the cookie with the plan's price and the session id", async () => {
    vi.resetModules()
    vi.doMock("@/lib/auth", () => ({ getSessionIdentity: async () => ({ sub: "buyer@example.com" }), ADMIN_SUB: "admin" }))
    vi.doMock("@/lib/billing", () => ({ createCheckoutSession: async () => ({ kind: "checkout", url: "https://checkout.stripe.com/c/pay/cs_test_abc", id: "cs_test_abc" }), createPortalSession: vi.fn() }))
    vi.doMock("@/lib/store", () => ({ getClient: vi.fn() }))
    const { GET } = await import("@/app/checkout/route")
    const res = await GET(new NextRequest("http://x/checkout?plan=pro&interval=annual"))
    expect(res.status).toBe(303)
    const cookie = res.cookies.get(BEGIN_CHECKOUT_COOKIE)
    expect(JSON.parse(cookie!.value)).toEqual({ id: "cs_test_abc", params: checkoutParams("pro", "annual") })
    expect(checkoutParams("pro", "annual").value).toBe(360)
    expect(cookie!.httpOnly).toBe(false)
  })

  it("no cookie when the account is sent to the portal or back to pricing", async () => {
    vi.resetModules()
    vi.doMock("@/lib/auth", () => ({ getSessionIdentity: async () => ({ sub: "buyer@example.com" }), ADMIN_SUB: "admin" }))
    vi.doMock("@/lib/billing", () => ({ createCheckoutSession: async () => ({ kind: "unavailable" }), createPortalSession: vi.fn() }))
    vi.doMock("@/lib/store", () => ({ getClient: vi.fn() }))
    const { GET } = await import("@/app/checkout/route")
    const res = await GET(new NextRequest("http://x/checkout?plan=pro&interval=monthly"))
    expect(res.cookies.get(BEGIN_CHECKOUT_COOKIE)).toBeUndefined()
  })
})

describe("the browser sends each one once, with a single call", () => {
  const gtagCalls: unknown[][] = []
  let cookie = ""
  beforeEach(() => {
    vi.resetModules()
    vi.doUnmock("@/lib/store")
    gtagCalls.length = 0
    const data = new Map<string, string>()
    const storage = { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), removeItem: (k: string) => void data.delete(k) }
    const win = { dataLayer: [] as unknown[], gtag: (...a: unknown[]) => void gtagCalls.push(a), localStorage: storage, sessionStorage: storage }
    vi.stubGlobal("window", win)
    vi.stubGlobal("document", {
      get cookie() {
        return cookie
      },
      set cookie(v: string) {
        if (/Max-Age=0/.test(v)) cookie = ""
      },
    })
  })
  afterEach(() => vi.unstubAllGlobals())

  it("begin_checkout from the cookie, once, and the cookie is cleared", async () => {
    const pending = { id: "cs_test_abc", params: checkoutParams("basic", "monthly") }
    cookie = `other=1; ${BEGIN_CHECKOUT_COOKIE}=${encodeURIComponent(JSON.stringify(pending))}`
    const { flushBeginCheckout } = await import("@/lib/analytics")
    flushBeginCheckout()
    flushBeginCheckout()
    expect(cookie).toBe("")
    expect(gtagCalls).toEqual([["event", "begin_checkout", pending.params]])
    cookie = `${BEGIN_CHECKOUT_COOKIE}=${encodeURIComponent(JSON.stringify(pending))}` // the same checkout again, e.g. a restored cookie
    flushBeginCheckout()
    expect(gtagCalls).toHaveLength(1)
  })

  it("purchase once per subscription id", async () => {
    const { trackPurchase } = await import("@/lib/analytics")
    const p = { ...checkoutParams("pro", "monthly"), transaction_id: "sub_123" }
    trackPurchase(p)
    trackPurchase(p)
    expect(gtagCalls).toEqual([["event", "purchase", p]])
  })
})
