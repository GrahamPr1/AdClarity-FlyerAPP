import type Stripe from "stripe"
import { renewalDisclosure } from "./plans"
import { isCheckoutEnabled } from "./checkout-switch"
import { getStripe, isEntitledStatus, planForPriceId, priceIdFor, subscriptionPeriod, type PaidPlanId } from "./stripe"
import {
  appendBillingEvent,
  countBillingEvent,
  getClient,
  getEmailForStripeCustomer,
  getMemberBilling,
  getDispute,
  getOrCreateClient,
  markWaitlistConverted,
  recordDispute,
  resetBillingCounter,
  setClientPaused,
  setClientPlan,
  setClientStripeCustomerId,
  setMemberBillingFieldIfUnset,
  updateMemberBilling,
} from "./store"
import type { BillingEventSummary, BillingInterval, ClientRecord, DisputeRecord, MemberBilling, PlanId } from "./types"
import { CLOSED_DISPUTE_STATUSES } from "./types"

// ---------------------------------------------------------------------------
// Self-serve billing: Stripe Checkout in, Stripe webhook back.
//
// The rule this file exists to keep: a paid plan is granted or taken away
// ONLY by syncSubscription, and syncSubscription only ever acts on a
// subscription it has just fetched from Stripe. Never on the event payload
// (events can arrive late and out of order, so a stale "updated" landing after
// a "deleted" must not resurrect a plan), and never on the success redirect
// (anyone can type that URL).
//
// Everything else here (payments, refunds, disputes) only records facts on
// the member's billing record for the admin pages. None of it changes a plan.
//
// Handled events (the Stripe endpoint must subscribe to all nine):
// checkout.session.completed, customer.subscription.created / updated /
// deleted, invoice.paid, invoice.payment_failed, charge.refunded,
// charge.dispute.created, charge.dispute.closed.
// ---------------------------------------------------------------------------

/** Metadata key linking Stripe objects back to the account. */
const EMAIL_METADATA_KEY = "oneflyer_email"

/** The account's Stripe Customer, creating it on first checkout. */
export async function getOrCreateStripeCustomer(client: ClientRecord): Promise<string> {
  const stripe = getStripe()
  if (client.stripeCustomerId) {
    const existing = await stripe.customers.retrieve(client.stripeCustomerId)
    if (!("deleted" in existing && existing.deleted)) return existing.id
    // Deleted in the Stripe dashboard — fall through and make a fresh one
    // rather than failing every future checkout.
  }
  const customer = await stripe.customers.create(
    { email: client.email, metadata: { [EMAIL_METADATA_KEY]: client.email } },
    // A double-click on the pricing card must not create two customers.
    { idempotencyKey: `oneflyer-customer-${client.email}-${client.stripeCustomerId ?? "new"}` },
  )
  await setClientStripeCustomerId(client.email, customer.id)
  return customer.id
}

export type CheckoutResult = { kind: "checkout"; url: string } | { kind: "already_subscribed" } | { kind: "unavailable" }

/**
 * A subscription-mode Checkout Session for one paid plan.
 *
 * Someone who already has a live subscription is NOT sent through checkout
 * again — that would create a second subscription and bill them twice. They
 * change plans in the Customer Portal instead.
 */
export async function createCheckoutSession(
  email: string,
  plan: PaidPlanId,
  interval: BillingInterval,
  origin: string,
): Promise<CheckoutResult> {
  const client = await getOrCreateClient(email)
  if (client.billing?.status && isEntitledStatus(client.billing.status as Stripe.Subscription.Status)) {
    return { kind: "already_subscribed" }
  }
  // Kill switch (lib/checkout-switch.ts). Checked AFTER the subscriber check
  // on purpose: an existing subscriber is still sent to the Portal to manage
  // their plan. Only creating a NEW session is refused — before any Stripe
  // customer is created.
  if (!isCheckoutEnabled()) return { kind: "unavailable" }

  const customer = await getOrCreateStripeCustomer(client)
  const session = await getStripe().checkout.sessions.create({
    mode: "subscription",
    customer,
    client_reference_id: email,
    line_items: [{ price: priceIdFor(plan, interval), quantity: 1 }],
    // Prices are tax-exclusive; Stripe Tax adds tax where the account is
    // registered. It calculates from the billing address, hence "required",
    // and customer_update saves that address back onto the Customer so
    // renewals are taxed the same way.
    automatic_tax: { enabled: true },
    billing_address_collection: "required",
    customer_update: { address: "auto", name: "auto" },
    subscription_data: { metadata: { [EMAIL_METADATA_KEY]: email, oneflyer_plan: plan } },
    // The auto-renewal disclosure, shown right above the Subscribe button —
    // the same sentence as under the pricing CTAs.
    custom_text: { submit: { message: renewalDisclosure(interval) } },
    metadata: { [EMAIL_METADATA_KEY]: email, oneflyer_plan: plan, oneflyer_interval: interval },
    success_url: `${origin}/dashboard?checkout=success`,
    cancel_url: `${origin}/#pricing`,
  })
  if (!session.url) throw new Error(`Checkout session ${session.id} has no URL`)
  return { kind: "checkout", url: session.url }
}

/** Customer Portal: update card, switch plan, cancel, invoices. */
export async function createPortalSession(customerId: string, returnUrl: string): Promise<string> {
  const session = await getStripe().billingPortal.sessions.create({
    customer: customerId,
    return_url: returnUrl,
    ...(process.env.STRIPE_PORTAL_CONFIGURATION_ID ? { configuration: process.env.STRIPE_PORTAL_CONFIGURATION_ID } : {}),
  })
  return session.url
}

/**
 * Pauses or resumes BILLING on the account's subscription, if it has one.
 *
 * behavior "void": invoices that come due while paused are voided, so
 * pausing genuinely means not being charged — which is what the pause screen
 * and the refund policy promise ("Billing stops"). The plan itself is kept,
 * like everything else a pause keeps.
 *
 * Returns false when there is no live subscription to pause (a free-trial
 * account) — the pause is then account state only, as it always was.
 */
export async function setSubscriptionCollectionPaused(client: ClientRecord, paused: boolean): Promise<boolean> {
  const billing = client.billing
  if (!billing?.stripeSubscriptionId || !billing.status || !isEntitledStatus(billing.status as Stripe.Subscription.Status)) {
    return false
  }
  const updated = await getStripe().subscriptions.update(billing.stripeSubscriptionId, {
    pause_collection: paused ? { behavior: "void" } : "",
  })
  // Mirror what Stripe just confirmed, so the webhook that follows sees no
  // change to make and the UI is right before it arrives.
  await updateMemberBilling(client.email, { collectionPaused: !!updated.pause_collection, status: updated.status })
  return true
}

// ---- Who is this event about? ---------------------------------------------

type CustomerRef = string | Stripe.Customer | Stripe.DeletedCustomer | null | undefined

/** The account behind a Stripe customer: our own link first, then the customer's metadata. Never matched on the customer's free-text email. */
async function emailForCustomer(ref: CustomerRef): Promise<string | null> {
  if (!ref) return null
  const id = typeof ref === "string" ? ref : ref.id
  const linked = await getEmailForStripeCustomer(id)
  if (linked) return linked
  const customer = typeof ref === "string" ? await getStripe().customers.retrieve(id) : ref
  if ("deleted" in customer && customer.deleted) return null
  return (customer as Stripe.Customer).metadata?.[EMAIL_METADATA_KEY] ?? null
}

async function emailForSubscription(sub: Stripe.Subscription): Promise<string | null> {
  return sub.metadata?.[EMAIL_METADATA_KEY] ?? emailForCustomer(sub.customer)
}

/** Two-letter US state, and nothing else from the address. */
function stateOf(address: Stripe.Address | null | undefined): string | null {
  if (!address?.state) return null
  return address.country === "US" || !address.country ? address.state.toUpperCase() : null
}

const iso = (unixSeconds: number | null | undefined) => (unixSeconds ? new Date(unixSeconds * 1000).toISOString() : null)

// ---- Subscription sync ------------------------------------------------------

/** The subscription half of the member record, from an EXPANDED subscription (customer + latest_invoice). */
function subscriptionFields(sub: Stripe.Subscription): Partial<MemberBilling> {
  const item = sub.items.data[0]
  const priceId = item?.price.id ?? null
  const mapped = planForPriceId(priceId)
  const period = subscriptionPeriod(sub)
  const latestInvoice = typeof sub.latest_invoice === "object" ? sub.latest_invoice : null
  const customer = typeof sub.customer === "object" && !("deleted" in sub.customer && sub.customer.deleted) ? (sub.customer as Stripe.Customer) : null
  const details = sub.cancellation_details
  return {
    stripeSubscriptionId: sub.id,
    priceId,
    plan: mapped?.plan ?? null,
    interval: mapped?.interval ?? null,
    unitAmount: item?.price.unit_amount ?? null,
    status: sub.status,
    currentPeriodStart: period.start,
    currentPeriodEnd: period.end,
    cancelAtPeriodEnd: sub.cancel_at_period_end,
    collectionPaused: !!sub.pause_collection,
    // The invoice that opened this period. Not paid yet → the new period's
    // usage allowance waits (lib/usage-window.ts).
    currentPeriodPaid: latestInvoice ? latestInvoice.status === "paid" : true,
    ...(customer && stateOf(customer.address) ? { billingState: stateOf(customer.address) } : {}),
    cancellationReason: details?.reason ?? null,
    cancellationFeedback: details?.feedback ?? null,
    canceledAt: iso(sub.canceled_at),
    endedAt: iso(sub.ended_at),
    syncedAt: new Date().toISOString(),
  }
}

export type SyncOutcome =
  | { applied: true; email: string; plan: PlanId; status: string }
  | { applied: false; email: string | null; reason: string }

/**
 * Re-fetches a subscription from Stripe and makes the account match it.
 * Idempotent by construction: it writes the state Stripe has now, so running
 * it twice for the same event (or for three events about one change) lands
 * in the same place.
 */
export async function syncSubscription(subscriptionId: string): Promise<SyncOutcome> {
  const sub = await getStripe().subscriptions.retrieve(subscriptionId, { expand: ["customer", "latest_invoice"] })
  const email = await emailForSubscription(sub)
  if (!email) return { applied: false, email: null, reason: `no account linked to ${sub.id}` }

  const prev = await getMemberBilling(email)
  const prevEntitled = !!prev?.status && isEntitledStatus(prev.status as Stripe.Subscription.Status)
  const entitled = isEntitledStatus(sub.status)

  // An old subscription ending must not revoke a newer live one (e.g. a
  // duplicate subscription created in the dashboard and then cancelled).
  if (prev?.stripeSubscriptionId && prev.stripeSubscriptionId !== sub.id && prevEntitled && !entitled) {
    return { applied: false, email, reason: `${sub.id} is ${sub.status}, but ${prev.stripeSubscriptionId} is the live subscription` }
  }

  const fields = subscriptionFields(sub)
  if (entitled && !fields.plan) {
    // A price this app doesn't sell. Granting nothing is safer than guessing;
    // the error is loud so the env price IDs get fixed.
    throw new Error(`Subscription ${sub.id} uses unknown price ${fields.priceId} — check STRIPE_PRICE_* env vars`)
  }

  // The plan moves on the way IN (every entitled sync re-applies what Stripe
  // says) and on the way OUT (the first sync that sees it ended). A replay
  // about a subscription already recorded as ended changes nothing — so a
  // late event can't undo an admin override made after the cancellation.
  const alreadyEnded = !entitled && prev?.stripeSubscriptionId === sub.id && !prevEntitled
  const before = await getClient(email)
  let plan: PlanId = before?.plan ?? "trial"
  if (entitled || !alreadyEnded) {
    plan = entitled ? fields.plan! : "trial"
    fields.planSource = "stripe"
  }
  await updateMemberBilling(email, fields)
  if (before?.plan !== plan) await setClientPlan(email, plan)

  // Pause made in Stripe (dashboard, API) shows in the app too. Only while
  // the subscription is live — a cancelled subscription says nothing about
  // whether the person wants their account paused. Resuming only clears a
  // pause that came with paused billing, so an in-app pause on an account
  // whose billing wasn't paused is never undone by an unrelated event.
  if (entitled && before) {
    if (fields.collectionPaused && !before.pausedAt) await setClientPaused(email, true)
    if (!fields.collectionPaused && before.pausedAt && prev?.collectionPaused) await setClientPaused(email, false)
  }

  return { applied: true, email, plan, status: sub.status }
}

/** Under basil an invoice reaches its subscription via parent.subscription_details. */
export function subscriptionIdForInvoice(invoice: Stripe.Invoice): string | null {
  const sub = invoice.parent?.subscription_details?.subscription
  if (!sub) return null
  return typeof sub === "string" ? sub : sub.id
}

/**
 * What paid an invoice: its PaymentIntent, or a bare Charge for payments
 * without one. Under basil an invoice no longer carries `charge` itself — the
 * link is the InvoicePayment.
 */
async function paymentRefForInvoice(invoiceId: string): Promise<string | null> {
  const payments = await getStripe().invoicePayments.list({ invoice: invoiceId, limit: 10 })
  const paid = payments.data.find((p) => p.status === "paid") ?? payments.data[0]
  const ref = paid?.payment.payment_intent ?? paid?.payment.charge
  if (!ref) return null
  return typeof ref === "string" ? ref : ref.id
}

const invoiceTax = (invoice: Stripe.Invoice) => (invoice.total_taxes ?? []).reduce((sum, t) => sum + t.amount, 0)

// ---- Event processing ---------------------------------------------------------

/**
 * Applies one verified Stripe event and returns the line for the admin
 * activity log. Throws on failure so the webhook releases its idempotency
 * claim and Stripe retries.
 */
export async function processStripeEvent(event: Stripe.Event): Promise<BillingEventSummary | null> {
  const base = { at: iso(event.created) ?? new Date().toISOString(), type: event.type, eventId: event.id }

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object
      if (session.mode !== "subscription" || !session.subscription) return null
      const email = session.client_reference_id ?? session.metadata?.[EMAIL_METADATA_KEY] ?? null
      const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id
      if (email && customerId) await setClientStripeCustomerId(email, customerId)
      const state = stateOf(session.customer_details?.address)
      if (email && state) await updateMemberBilling(email, { billingState: state })

      const outcome = await syncSubscription(typeof session.subscription === "string" ? session.subscription : session.subscription.id)
      if (outcome.applied && outcome.plan !== "trial") await markWaitlistConverted(outcome.email)
      return {
        ...base,
        email: outcome.email ?? email,
        plan: outcome.applied ? outcome.plan : null,
        amount: session.amount_total,
        tax: session.total_details?.amount_tax ?? null,
        status: session.payment_status,
        state,
      }
    }

    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const outcome = await syncSubscription(event.data.object.id)
      return {
        ...base,
        email: outcome.email,
        plan: outcome.applied ? outcome.plan : null,
        amount: null,
        tax: null,
        status: outcome.applied ? outcome.status : `ignored: ${outcome.reason}`,
        state: null,
      }
    }

    case "invoice.paid":
    case "invoice.payment_failed": {
      // paid: a renewal moved the billing period on (which, once paid, is
      // what resets the usage window) or a past_due subscription recovered.
      // payment_failed: the subscription goes past_due and KEEPS its plan
      // while Stripe retries — see ENTITLED_STATUSES in lib/stripe.ts.
      const invoice = event.data.object
      const email = await emailForCustomer(invoice.customer)
      const state = stateOf(invoice.customer_address)
      const tax = invoiceTax(invoice)
      if (email) {
        if (event.type === "invoice.paid") {
          if (invoice.amount_paid > 0) {
            const paidAt = iso(invoice.status_transitions?.paid_at) ?? base.at
            await setMemberBillingFieldIfUnset(email, "paidSince", paidAt)
            await updateMemberBilling(email, {
              lastPaymentDate: paidAt,
              lastPaymentAmount: invoice.amount_paid,
              lastPaymentTax: tax,
              // A new payment: remember what paid it, and that it hasn't been
              // refunded — the "Annual refund due" flag keys off both.
              lastPaymentRef: await paymentRefForInvoice(invoice.id!),
              lastPaymentRefundedAt: null,
              ...(state ? { billingState: state } : {}),
            })
            await resetBillingCounter(email, "failedPaymentCount")
          }
        } else {
          await countBillingEvent(email, "failedPaymentCount", event.id)
        }
      }
      const subscriptionId = subscriptionIdForInvoice(invoice)
      const outcome = subscriptionId ? await syncSubscription(subscriptionId) : null
      return {
        ...base,
        email,
        plan: outcome?.applied ? outcome.plan : null,
        amount: event.type === "invoice.paid" ? invoice.amount_paid : invoice.amount_due,
        tax,
        status: invoice.status,
        state,
      }
    }

    case "charge.refunded": {
      const charge = event.data.object
      const email = await emailForCustomer(charge.customer)
      if (email) {
        await countBillingEvent(email, "refundCount", event.id)
        // A FULL refund of the member's latest payment clears "Annual refund
        // due". A partial refund doesn't: the policy promises the full year.
        const billing = await getMemberBilling(email)
        const pi = typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent?.id
        if (charge.refunded && billing?.lastPaymentRef && (billing.lastPaymentRef === charge.id || billing.lastPaymentRef === pi)) {
          await updateMemberBilling(email, { lastPaymentRefundedAt: base.at })
        }
      }
      return {
        ...base,
        email,
        plan: null,
        amount: charge.amount_refunded,
        tax: null,
        status: charge.refunded ? "refunded in full" : "partially refunded",
        state: null,
      }
    }

    case "charge.dispute.created":
    case "charge.dispute.closed": {
      const dispute = event.data.object
      const record = await upsertDispute(dispute, event.type === "charge.dispute.closed" ? base.at : null)
      if (record.email && event.type === "charge.dispute.created") {
        await countBillingEvent(record.email, "disputeCount", dispute.id)
        await updateMemberBilling(record.email, { lastDisputeAt: record.createdAt })
      }
      return { ...base, email: record.email, plan: null, amount: dispute.amount, tax: null, status: `${record.status} (${dispute.reason})`, state: null }
    }

    default:
      return null
  }
}

/**
 * Writes the dispute's admin record, created or closed. Recorded even when no
 * member matches — a dispute is money at risk either way, and Needs-attention
 * shows unmatched ones too.
 *
 * Order-safe: if "closed" is processed before "created" (Stripe doesn't
 * guarantee order), the late "created" must not reopen it.
 */
async function upsertDispute(dispute: Stripe.Dispute, closedAt: string | null): Promise<DisputeRecord> {
  const existing = await getDispute(dispute.id)
  const chargeId = typeof dispute.charge === "string" ? dispute.charge : dispute.charge.id
  let email = existing?.email ?? null
  if (!existing) {
    const charge = typeof dispute.charge === "string" ? await getStripe().charges.retrieve(chargeId) : dispute.charge
    email = await emailForCustomer(charge.customer)
  }
  const alreadyClosed = !!existing?.closedAt
  const record: DisputeRecord = {
    id: dispute.id,
    email,
    chargeId,
    amount: dispute.amount,
    reason: dispute.reason,
    status: alreadyClosed ? existing!.status : dispute.status,
    createdAt: existing?.createdAt ?? iso(dispute.created) ?? new Date().toISOString(),
    closedAt: existing?.closedAt ?? closedAt ?? (CLOSED_DISPUTE_STATUSES.has(dispute.status) ? new Date().toISOString() : null),
  }
  await recordDispute(record)
  return record
}

/** Logs an admin plan override on the member record and in the activity log. */
export async function recordAdminOverride(email: string, plan: PlanId, by: string): Promise<void> {
  const at = new Date().toISOString()
  await updateMemberBilling(email, { planSource: "admin_override", overrideBy: by, overrideAt: at, overridePlan: plan })
  await appendBillingEvent({ at, type: "admin.set_plan", eventId: null, email, plan, amount: null, tax: null, status: `override by ${by}`, state: null })
}
