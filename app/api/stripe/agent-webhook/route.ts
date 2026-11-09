import { NextRequest, NextResponse } from "next/server"
import type Stripe from "stripe"
import { getStripe } from "@/lib/stripe"
import { claimAgentStripeEvent, completeAgentStripeEvent, processAgentStripeEvent, releaseAgentStripeEvent } from "@/lib/enterprise/portal/agent-billing"

// POST /api/stripe/agent-webhook
//
// Agent Pro billing only (lib/enterprise/portal/agent-billing.ts). Its own
// Stripe endpoint and signing secret (STRIPE_AGENT_WEBHOOK_SECRET); the SMB
// endpoint /api/stripe/webhook is untouched. Stripe sends every account
// event to both endpoints: this one acts only on agent Pro subscriptions and
// answers 200 to everything else.
//
// Same standard as SMB: the raw body is verified against the secret before
// anything is parsed, each event id is claimed first (its own keys, since the
// SMB endpoint sees the same ids) so a redelivery is skipped, and every
// handler re-fetches the subscription from Stripe instead of trusting the
// payload. Subscribe the endpoint to: checkout.session.completed,
// customer.subscription.created / updated / deleted, invoice.paid,
// invoice.payment_failed.
export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(request: NextRequest) {
  const secret = process.env.STRIPE_AGENT_WEBHOOK_SECRET
  if (!secret) {
    console.error("[agent webhook] STRIPE_AGENT_WEBHOOK_SECRET is not set")
    return NextResponse.json({ error: "Webhook not configured" }, { status: 500 })
  }
  const body = await request.text()
  const signature = request.headers.get("stripe-signature")
  if (!signature) return NextResponse.json({ error: "Missing stripe-signature header" }, { status: 400 })

  let event: Stripe.Event
  try {
    event = getStripe().webhooks.constructEvent(body, signature, secret)
  } catch (err) {
    console.warn("[agent webhook] signature verification failed:", err instanceof Error ? err.message : err)
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 })
  }

  const claim = await claimAgentStripeEvent(event.id)
  if (claim === "done") return NextResponse.json({ received: true, duplicate: true })
  if (claim === "in_progress") return NextResponse.json({ error: "Event is already being processed" }, { status: 409 })

  try {
    const outcome = await processAgentStripeEvent(event)
    await completeAgentStripeEvent(event.id)
    // No agent email in logs.
    console.log(`[agent webhook] ${event.type} ${event.id}:`, !outcome ? "not an agent event" : outcome.applied ? `tier=${outcome.tier} status=${outcome.status}` : `ignored: ${outcome.reason.replace(/\S+@\S+/g, "(email)")}`)
    return NextResponse.json({ received: true })
  } catch (err) {
    await releaseAgentStripeEvent(event.id)
    console.error(`[agent webhook] ${event.type} ${event.id} failed:`, err)
    return NextResponse.json({ error: "Handler failed" }, { status: 500 })
  }
}
