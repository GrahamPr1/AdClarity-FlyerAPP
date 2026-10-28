import { NextRequest, NextResponse } from "next/server"
import type Stripe from "stripe"
import { getSessionIdentity } from "@/lib/auth"
import { getStripe, isEntitledStatus } from "@/lib/stripe"
import { claimPurchaseReport } from "@/lib/store"
import { checkoutParams, type PurchaseParams } from "@/lib/checkout-tracking"
import type { BillingInterval } from "@/lib/types"

// GET /api/billing/checkout-result?session_id=cs_...
//
// Whether the success page may send the purchase conversion. Stripe's
// success_url carries the Checkout Session id, but anyone can type that URL,
// so this asks Stripe: the session must belong to the signed-in account, be
// complete and paid, and have created a live subscription. Then it claims the
// report for that subscription id (claimPurchaseReport), so the answer is
// "send it" exactly once: a reload, another tab or another device gets
// { purchase: null }. Renewals never reach a success page at all.
//
// Grants nothing. The plan itself still arrives only via the webhook.
export async function GET(request: NextRequest) {
  const session = await getSessionIdentity(request)
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

  const id = request.nextUrl.searchParams.get("session_id") ?? ""
  if (!/^cs_(test|live)_[A-Za-z0-9]+$/.test(id)) return NextResponse.json({ purchase: null, reason: "bad_session_id" }, { status: 400 })

  let checkout: Stripe.Checkout.Session
  try {
    checkout = await getStripe().checkout.sessions.retrieve(id, { expand: ["subscription"] })
  } catch {
    return NextResponse.json({ purchase: null, reason: "not_found" }, { status: 404 })
  }

  // Someone else's session id tells this account nothing, and isn't a purchase of theirs.
  if (checkout.client_reference_id !== session.sub) return NextResponse.json({ purchase: null, reason: "not_yours" }, { status: 404 })

  const sub = typeof checkout.subscription === "object" ? checkout.subscription : null
  const paid = checkout.payment_status === "paid" || checkout.payment_status === "no_payment_required"
  if (checkout.mode !== "subscription" || checkout.status !== "complete" || !paid || !sub || !isEntitledStatus(sub.status)) {
    return NextResponse.json({ purchase: null, reason: "not_confirmed" })
  }

  const plan = checkout.metadata?.oneflyer_plan
  const interval = checkout.metadata?.oneflyer_interval as BillingInterval | undefined
  if (!plan || (interval !== "monthly" && interval !== "annual")) return NextResponse.json({ purchase: null, reason: "not_confirmed" })

  if (!(await claimPurchaseReport(sub.id))) return NextResponse.json({ purchase: null, reason: "already_reported" })

  // What they actually agreed to pay, before tax (after any discount).
  const value = (checkout.amount_subtotal ?? 0) / 100
  const purchase: PurchaseParams = { ...checkoutParams(plan, interval, value), transaction_id: sub.id }
  return NextResponse.json({ purchase })
}
