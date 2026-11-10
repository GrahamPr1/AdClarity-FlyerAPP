import { Redis } from "@upstash/redis"
import type Stripe from "stripe"
import { getStripe, isEntitledStatus, subscriptionPeriod } from "@/lib/stripe"
import { getAgentTier, getAgentTierSource, setAgentTier } from "./store"

// Agent Pro billing ($40/month, tax-exclusive), entirely separate from SMB
// billing: its own Stripe price, customers, metadata key, webhook endpoint
// (/api/stripe/agent-webhook) and portal configuration. Nothing here reads
// or writes client.plan, member billing, or SMB's customer link, and agent
// checkouts never carry SMB's "oneflyer_email" or client_reference_id, so
// the SMB webhook finds no account for agent events and ignores them.
//
//   client:{email}:agent-billing       AgentBilling (below)
//   agent-billing:customer:{cus_…}     the agent account that customer belongs to
//   agent-stripe-event:{evt_…}         webhook idempotency ("processing" | "done")
//
// The tier is still client:{email}:agent-tier. Its source
// (client:{email}:agent-tier-source) says who set it: "stripe" (this file)
// or "admin". Stripe only ever moves a tier it set itself: an admin-set Pro
// or Leader (e.g. an organization paying for its agents) is never changed by
// a payment event, and Stripe's Pro ends only Stripe's Pro.

const redis = Redis.fromEnv()

export const AGENT_EMAIL_METADATA_KEY = "oneflyer_agent_email"
const billingKey = (email: string) => `client:${email}:agent-billing`
const customerKey = (customerId: string) => `agent-billing:customer:${customerId}`
const eventKey = (id: string) => `agent-stripe-event:${id}`

export interface AgentBilling {
  customerId: string | null
  subscriptionId: string | null
  /** Stripe's subscription status, as last synced. */
  status: Stripe.Subscription.Status | null
  /** End of the paid period (ISO). Pro lasts until then after a cancellation. */
  currentPeriodEnd: string | null
  cancelAtPeriodEnd: boolean
  /** Failed renewal payments since the last successful one. */
  failedPayments: number
  lastPaymentAt: string | null
  syncedAt: string
}

/** Whether the portal offers "Upgrade to Pro": an active roster agent on Basic, with agent billing configured. */
export function canBuyPro(ctx: { tier: string; active: boolean }): boolean {
  return ctx.tier === "basic" && ctx.active && !!agentProPriceId()
}

/** The agent Pro price, from env (sandbox and live differ). Null: agent billing is off. */
export function agentProPriceId(): string | null {
  return process.env.STRIPE_PRICE_AGENT_PRO_MONTHLY || null
}

export async function getAgentBilling(email: string): Promise<AgentBilling | null> {
  return (await redis.get<AgentBilling>(billingKey(email))) ?? null
}

async function saveAgentBilling(email: string, patch: Partial<AgentBilling>): Promise<AgentBilling> {
  const prev = await getAgentBilling(email)
  const next: AgentBilling = {
    customerId: null, subscriptionId: null, status: null, currentPeriodEnd: null, cancelAtPeriodEnd: false, failedPayments: 0, lastPaymentAt: null,
    ...prev, ...patch, syncedAt: new Date().toISOString(),
  }
  await redis.set(billingKey(email), next)
  return next
}

async function emailForAgentCustomer(customerId: string): Promise<string | null> {
  const v = await redis.get(customerKey(customerId))
  return v == null ? null : String(v)
}

/** The agent's own Stripe customer (never an SMB one), created on first checkout. */
async function agentCustomerId(email: string): Promise<string> {
  const existing = (await getAgentBilling(email))?.customerId
  if (existing) return existing
  const customer = await getStripe().customers.create({ email, metadata: { [AGENT_EMAIL_METADATA_KEY]: email } })
  await redis.set(customerKey(customer.id), email)
  await saveAgentBilling(email, { customerId: customer.id })
  return customer.id
}

/** Test harness only (test clocks): use a customer made elsewhere for this agent. */
export async function linkAgentCustomer(email: string, customerId: string): Promise<void> {
  await redis.set(customerKey(customerId), email)
  await saveAgentBilling(email, { customerId })
}

export type AgentCheckoutResult = { kind: "checkout"; url: string } | { kind: "already_subscribed" } | { kind: "unavailable" }

/** Stripe Checkout for agent Pro. The caller has already checked the agent may buy (active, Basic). */
export async function createAgentCheckout(email: string, origin: string): Promise<AgentCheckoutResult> {
  const price = agentProPriceId()
  if (!price) return { kind: "unavailable" }
  const billing = await getAgentBilling(email)
  if (billing?.status && isEntitledStatus(billing.status)) return { kind: "already_subscribed" }
  const customer = await agentCustomerId(email)
  const session = await getStripe().checkout.sessions.create({
    mode: "subscription",
    customer,
    line_items: [{ price, quantity: 1 }],
    // Card only (Apple Pay and Google Pay are cards and still show). Set on
    // this session alone: the account's payment-method settings, which SMB
    // checkout uses, are untouched.
    payment_method_types: ["card"],
    // Tax-exclusive, like SMB: Stripe Tax adds tax where the account is registered.
    automatic_tax: { enabled: true },
    billing_address_collection: "required",
    customer_update: { address: "auto", name: "auto" },
    subscription_data: { metadata: { [AGENT_EMAIL_METADATA_KEY]: email, oneflyer_product: "agent_pro" } },
    metadata: { [AGENT_EMAIL_METADATA_KEY]: email, oneflyer_product: "agent_pro" },
    success_url: `${origin}/agent?billing=success`,
    cancel_url: `${origin}/agent?billing=cancelled`,
  })
  if (!session.url) throw new Error(`Checkout session ${session.id} has no URL`)
  return { kind: "checkout", url: session.url }
}

/** The agent Customer Portal: card, invoices, cancel at period end. No plan switching. */
export async function createAgentPortal(email: string, returnUrl: string): Promise<string | null> {
  const customerId = (await getAgentBilling(email))?.customerId
  if (!customerId) return null
  const session = await getStripe().billingPortal.sessions.create({
    customer: customerId,
    return_url: returnUrl,
    ...(process.env.STRIPE_AGENT_PORTAL_CONFIGURATION_ID ? { configuration: process.env.STRIPE_AGENT_PORTAL_CONFIGURATION_ID } : {}),
  })
  return session.url
}

export type AgentSyncOutcome = { applied: true; email: string; tier: string; status: string } | { applied: false; reason: string }

/**
 * Makes the agent's tier match their subscription as Stripe has it NOW
 * (re-fetched, never from the event payload), so replays and out-of-order
 * events land in the same place. Entitled (active, trialing, past_due while
 * Stripe retries): Pro. Anything else (canceled at period end, unpaid after
 * the last retry, incomplete_expired): back to Basic, if Stripe gave the Pro.
 */
export async function syncAgentSubscription(subscriptionId: string): Promise<AgentSyncOutcome> {
  const sub = await getStripe().subscriptions.retrieve(subscriptionId)
  const price = agentProPriceId()
  if (!price || sub.items.data[0]?.price.id !== price) return { applied: false, reason: "not an agent Pro subscription" }
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id
  const email = sub.metadata?.[AGENT_EMAIL_METADATA_KEY] ?? (await emailForAgentCustomer(customerId))
  if (!email) return { applied: false, reason: `no agent linked to ${sub.id}` }

  const prev = await getAgentBilling(email)
  const entitled = isEntitledStatus(sub.status)
  // An old subscription ending must not end a newer live one (re-subscribed).
  if (prev?.subscriptionId && prev.subscriptionId !== sub.id && prev.status && isEntitledStatus(prev.status) && !entitled) {
    return { applied: false, reason: `${sub.id} is ${sub.status}, but ${prev.subscriptionId} is the live subscription` }
  }
  const period = subscriptionPeriod(sub)
  await redis.set(customerKey(customerId), email)
  await saveAgentBilling(email, {
    customerId,
    subscriptionId: sub.id,
    status: sub.status,
    currentPeriodEnd: new Date(period.end).toISOString(),
    cancelAtPeriodEnd: sub.cancel_at_period_end,
  })

  const [tier, source] = await Promise.all([getAgentTier(email), getAgentTierSource(email)])
  const adminSet = source === "admin" && tier !== "basic"
  if (!adminSet) {
    if (entitled && tier === "basic") await setAgentTier(email, "pro", "stripe")
    if (!entitled && tier === "pro" && source === "stripe") await setAgentTier(email, "basic", "stripe")
  }
  return { applied: true, email, tier: await getAgentTier(email), status: sub.status }
}

/** Invoice bookkeeping (payment date, failed-payment count), then the subscription sync. */
export async function recordAgentInvoice(invoice: Stripe.Invoice, paid: boolean): Promise<AgentSyncOutcome> {
  const subRef = invoice.parent?.subscription_details?.subscription
  const subscriptionId = typeof subRef === "string" ? subRef : subRef?.id
  if (!subscriptionId) return { applied: false, reason: "invoice without a subscription" }
  const outcome = await syncAgentSubscription(subscriptionId)
  if (!outcome.applied) return outcome
  const prev = await getAgentBilling(outcome.email)
  if (paid && invoice.amount_paid > 0) {
    const at = invoice.status_transitions?.paid_at ? new Date(invoice.status_transitions.paid_at * 1000).toISOString() : new Date().toISOString()
    await saveAgentBilling(outcome.email, { lastPaymentAt: at, failedPayments: 0 })
  } else if (!paid) {
    await saveAgentBilling(outcome.email, { failedPayments: (prev?.failedPayments ?? 0) + 1 })
  }
  return outcome
}

/**
 * True for an event about an agent Pro checkout, subscription or its
 * invoice: what agent checkouts stamp (oneflyer_product=agent_pro). Pure (no
 * Stripe or Redis call), so the SMB webhook can skip these at no cost.
 */
export function isAgentProEvent(event: Stripe.Event): boolean {
  const o = event.data.object as { metadata?: Record<string, string> | null; parent?: { subscription_details?: { metadata?: Record<string, string> | null } | null } | null }
  return o.metadata?.oneflyer_product === "agent_pro" || o.parent?.subscription_details?.metadata?.oneflyer_product === "agent_pro"
}

/** The webhook's handler. Null: not an agent event (an SMB one, or a type this ignores). */
export async function processAgentStripeEvent(event: Stripe.Event): Promise<AgentSyncOutcome | null> {
  switch (event.type) {
    case "checkout.session.completed": {
      const s = event.data.object
      if (s.mode !== "subscription" || !s.subscription || s.metadata?.oneflyer_product !== "agent_pro") return null
      const email = s.metadata[AGENT_EMAIL_METADATA_KEY]
      const customerId = typeof s.customer === "string" ? s.customer : s.customer?.id
      if (email && customerId) await redis.set(customerKey(customerId), email)
      return syncAgentSubscription(typeof s.subscription === "string" ? s.subscription : s.subscription.id)
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
      return syncAgentSubscription(event.data.object.id)
    case "invoice.paid":
    case "invoice.payment_failed":
      return recordAgentInvoice(event.data.object, event.type === "invoice.paid")
    default:
      return null
  }
}

// ---- Webhook idempotency (its own keys: SMB's endpoint gets the same event ids) ----

export async function claimAgentStripeEvent(id: string): Promise<"claimed" | "done" | "in_progress"> {
  if ((await redis.set(eventKey(id), "processing", { nx: true, ex: 300 })) === "OK") return "claimed"
  return (await redis.get<string>(eventKey(id))) === "done" ? "done" : "in_progress"
}
export async function completeAgentStripeEvent(id: string): Promise<void> {
  await redis.set(eventKey(id), "done", { ex: 30 * 86400 })
}
export async function releaseAgentStripeEvent(id: string): Promise<void> {
  await redis.del(eventKey(id))
}

// ---- What the admin page shows -------------------------------------------------

export type AgentBillingLabel = "paid_pro" | "admin_set" | "cancels" | "past_due" | "cancelled" | "none"

export function agentBillingLabel(tier: string, source: "admin" | "stripe" | null, billing: AgentBilling | null): AgentBillingLabel {
  if (source === "admin" && tier !== "basic") return "admin_set"
  if (billing?.status === "past_due") return "past_due"
  if (billing?.status && isEntitledStatus(billing.status)) return billing.cancelAtPeriodEnd ? "cancels" : "paid_pro"
  if (billing?.subscriptionId) return "cancelled"
  return "none"
}

// ---- Removed from the program ---------------------------------------------------

export interface RemovalBillingOutcome {
  /** A paid Pro subscription was cancelled (immediately). */
  cancelled: boolean
  subscriptionId: string | null
  /** The prorated refund of the unused part of the current period, in cents (0 when nothing to refund). */
  refunded: number
  currency: string | null
  /** Set when Stripe refused something: the removal itself still stands; finish it in Stripe. */
  error?: string
}

/**
 * When an admin removes an agent from the program: a paid Pro subscription
 * ends RIGHT AWAY (not at period end) and the unused part of the current
 * period is refunded, prorated by time, on the payment that paid for it.
 * Pro goes back to Basic at once (the webhook confirms it). An admin-set Pro
 * has no subscription and is left alone. Undo does not restart billing.
 * Idempotency keys make a retry safe: the same subscription is cancelled and
 * the same invoice refunded at most once.
 */
export async function endAgentProOnRemoval(email: string, now = new Date()): Promise<RemovalBillingOutcome> {
  const billing = await getAgentBilling(email)
  const none: RemovalBillingOutcome = { cancelled: false, subscriptionId: null, refunded: 0, currency: null }
  if (!billing?.subscriptionId || !billing.status || !isEntitledStatus(billing.status)) return none
  const stripe = getStripe()
  const subscriptionId = billing.subscriptionId
  try {
    const sub = await stripe.subscriptions.retrieve(subscriptionId)
    if (!isEntitledStatus(sub.status)) return { ...none, subscriptionId }
    const period = subscriptionPeriod(sub)
    // The invoice that paid for the current period, and what paid it.
    const invoices = await stripe.invoices.list({ subscription: subscriptionId, status: "paid", limit: 1 })
    const invoice = invoices.data[0]
    let refundable = 0
    let paymentRef: { payment_intent: string } | { charge: string } | null = null
    if (invoice && invoice.amount_paid > 0) {
      const unused = Math.max(0, Math.min(1, (period.end - now.getTime()) / (period.end - period.start)))
      refundable = Math.floor(invoice.amount_paid * unused)
      const payments = await stripe.invoicePayments.list({ invoice: invoice.id!, limit: 10 })
      const paid = payments.data.find((p) => p.status === "paid") ?? payments.data[0]
      const pi = paid?.payment.payment_intent, ch = paid?.payment.charge
      paymentRef = pi ? { payment_intent: typeof pi === "string" ? pi : pi.id } : ch ? { charge: typeof ch === "string" ? ch : ch.id } : null
    }
    await stripe.subscriptions.cancel(subscriptionId, { prorate: false, invoice_now: false }, { idempotencyKey: `agent-removal-cancel-${subscriptionId}` })
    if (refundable > 0 && paymentRef && invoice) {
      await stripe.refunds.create(
        { ...paymentRef, amount: refundable, reason: "requested_by_customer", metadata: { oneflyer_product: "agent_pro", oneflyer_reason: "removed_from_program" } },
        { idempotencyKey: `agent-removal-refund-${invoice.id}` },
      )
    }
    // Basic now; the subscription.deleted webhook lands on the same.
    if ((await getAgentTierSource(email)) === "stripe") await setAgentTier(email, "basic", "stripe")
    await saveAgentBilling(email, { status: "canceled", cancelAtPeriodEnd: false })
    return { cancelled: true, subscriptionId, refunded: refundable && paymentRef ? refundable : 0, currency: invoice?.currency ?? null }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[agent billing] removal: cancelling/refunding ${subscriptionId} failed:`, message)
    return { ...none, subscriptionId, error: message }
  }
}
