import { NextRequest, NextResponse } from "next/server"
import { getSessionIdentity, ADMIN_SUB } from "@/lib/auth"
import { createCheckoutSession, createPortalSession } from "@/lib/billing"
import { isPaidPlanId } from "@/lib/stripe"
import { getClient } from "@/lib/store"
import { BEGIN_CHECKOUT_COOKIE, checkoutParams, type PendingBeginCheckout } from "@/lib/checkout-tracking"

// GET /checkout?plan=basic|pro&interval=monthly|annual
//
// Where the paid pricing CTAs go. Signed-in clients only: middleware.ts sends
// anyone else to /login with ?next= pointing back here, so a new visitor signs
// up and lands straight in Stripe Checkout for the plan they picked.
//
// A GET, so it works as a plain link and survives the login round-trip. All
// it can do is send the signed-in person to a checkout page for their own
// account — nothing is charged until they complete it on Stripe, and nothing
// is granted until the webhook confirms the subscription.
export async function GET(request: NextRequest) {
  const session = await getSessionIdentity(request)
  if (!session) {
    const login = new URL("/login", request.url)
    login.searchParams.set("next", request.nextUrl.pathname + request.nextUrl.search)
    return NextResponse.redirect(login)
  }
  // The site-owner login has no client record of its own to bill.
  if (session.sub === ADMIN_SUB) return NextResponse.redirect(new URL("/dashboard", request.url))

  const plan = request.nextUrl.searchParams.get("plan")
  const interval = request.nextUrl.searchParams.get("interval") ?? "monthly"
  if (!isPaidPlanId(plan) || (interval !== "monthly" && interval !== "annual")) {
    return NextResponse.redirect(new URL("/#pricing", request.url))
  }

  const origin = request.nextUrl.origin
  try {
    const result = await createCheckoutSession(session.sub, plan, interval, origin)
    if (result.kind === "checkout") {
      const res = NextResponse.redirect(result.url, 303)
      // The begin_checkout conversion. This page leaves for Stripe at once,
      // which would lose GA4's batched hit, so it's handed to the next
      // OneFlyer page (Stripe's success or cancel URL) to send; see
      // flushBeginCheckout in lib/analytics.ts. Only a real Checkout Session
      // gets here: already-subscribed and kill-switch redirects never count.
      const pending: PendingBeginCheckout = { id: result.id, params: checkoutParams(plan, interval) }
      res.cookies.set(BEGIN_CHECKOUT_COOKIE, JSON.stringify(pending), {
        httpOnly: false, // read by the browser, which sends the event
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 60 * 60 * 24,
        path: "/",
      })
      return res
    }
    // CHECKOUT_ENABLED is off: back to pricing, where the CTAs say why.
    if (result.kind === "unavailable") return NextResponse.redirect(new URL("/#pricing", request.url))

    // Already subscribed: switching plans happens in the portal, never via a
    // second checkout (which would bill them twice).
    const client = await getClient(session.sub)
    if (!client?.stripeCustomerId) return NextResponse.redirect(new URL("/profile", request.url))
    return NextResponse.redirect(await createPortalSession(client.stripeCustomerId, `${origin}/profile`), 303)
  } catch (err) {
    console.error("[checkout] failed:", err)
    const back = new URL("/profile", request.url)
    back.searchParams.set("billing", "error")
    return NextResponse.redirect(back)
  }
}
