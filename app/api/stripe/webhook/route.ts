import { NextRequest, NextResponse } from "next/server"
import type Stripe from "stripe"
import { getStripe } from "@/lib/stripe"
import { processStripeEvent } from "@/lib/billing"
import { appendBillingEvent, claimStripeEvent, completeStripeEvent, releaseStripeEvent } from "@/lib/store"

// POST /api/stripe/webhook
//
// The ONLY path that grants or removes a paid plan (admin overrides aside —
// see /api/admin/set-plan). Unauthenticated by session, authenticated by
// Stripe's signature instead: the raw body is verified against
// STRIPE_WEBHOOK_SECRET before anything is parsed or trusted.
//
// Every handler re-fetches the subscription from Stripe rather than trusting
// the event payload (see lib/billing.ts), and each event ID is claimed in
// Redis first so a redelivery is skipped. Each processed event also leaves a
// one-line summary in the admin activity log (/admin/billing/activity).
//
// Handled: checkout.session.completed, customer.subscription.created /
// updated / deleted, invoice.paid, invoice.payment_failed, charge.refunded,
// charge.dispute.created, charge.dispute.closed. The Stripe endpoint must
// subscribe to all nine.
export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(request: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET
  if (!secret) {
    console.error("[stripe webhook] STRIPE_WEBHOOK_SECRET is not set")
    return NextResponse.json({ error: "Webhook not configured" }, { status: 500 })
  }

  // Raw text, byte for byte — the signature is over the exact payload, so it
  // must not be parsed and re-serialised first.
  const body = await request.text()
  const signature = request.headers.get("stripe-signature")
  if (!signature) return NextResponse.json({ error: "Missing stripe-signature header" }, { status: 400 })

  let event: Stripe.Event
  try {
    event = getStripe().webhooks.constructEvent(body, signature, secret)
  } catch (err) {
    console.warn("[stripe webhook] signature verification failed:", err instanceof Error ? err.message : err)
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 })
  }

  const claim = await claimStripeEvent(event.id)
  if (claim === "done") {
    return NextResponse.json({ received: true, duplicate: true })
  }
  if (claim === "in_progress") {
    // Another delivery of this event is mid-handler. A non-2xx makes Stripe
    // retry later, by which point it has either finished or its claim expired.
    return NextResponse.json({ error: "Event is already being processed" }, { status: 409 })
  }

  try {
    const summary = await processStripeEvent(event)
    if (summary) await appendBillingEvent(summary)
    await completeStripeEvent(event.id)
    // No member email or other customer data in logs — the admin activity log
    // (/admin/billing/activity) is where an event is matched to a person.
    console.log(
      `[stripe webhook] ${event.type} ${event.id}:`,
      summary ? `${summary.email ? "member" : "no member"} plan=${summary.plan ?? "-"} status=${summary.status ?? "-"}` : "ignored",
    )
    return NextResponse.json({ received: true })
  } catch (err) {
    await releaseStripeEvent(event.id)
    console.error(`[stripe webhook] ${event.type} ${event.id} failed:`, err)
    return NextResponse.json({ error: "Handler failed" }, { status: 500 })
  }
}
