import type { BillingEventSummary, BillingInterval, ClientRecord, DisputeRecord, MemberBilling, PlanId } from "./types"
import { CLOSED_DISPUTE_STATUSES, PLAN_LIMITS } from "./types"

// ---------------------------------------------------------------------------
// What the admin billing pages show, computed from what's already in Redis.
//
// Pure functions over plain data (no Redis, no Stripe) so every number on
// the overview can be unit-tested against a hand calculation. The loader that
// feeds them lives in the API routes.
//
// Nothing here is authoritative for money. MRR and tax collected are labelled
// estimates on the page: the Stripe Dashboard and Stripe Tax reports are the
// source of truth for revenue and for filing.
// ---------------------------------------------------------------------------

const DAY_MS = 24 * 60 * 60 * 1000
const ENTITLED = new Set(["active", "trialing", "past_due"])

/** What a member's billing looks like at a glance. */
export type MemberStatus = "active" | "past_due" | "paused" | "canceled" | "free" | "no_subscription" | (string & {})

export function memberStatus(plan: PlanId, billing: MemberBilling | null): MemberStatus {
  const status = billing?.status
  if (!status) return plan === "trial" ? "free" : "no_subscription"
  if (ENTITLED.has(status) && billing.collectionPaused) return "paused"
  return status
}

function hasLiveSubscription(billing: MemberBilling | null): boolean {
  return !!billing?.stripeSubscriptionId && !!billing.status && ENTITLED.has(billing.status)
}

export interface BillingMemberRow {
  email: string
  businessName: string | null
  plan: PlanId
  interval: BillingInterval | null
  status: MemberStatus
  billingState: string | null
  /** ISO. Next renewal — or, when cancelling at period end, the date it stops. Null with no live subscription. */
  renewalDate: string | null
  cancelAtPeriodEnd: boolean
  flyersCreated: number
  flyersLimit: number
  paidSince: string | null
  failedPaymentCount: number
  refundCount: number
  disputeCount: number
  planSource: MemberBilling["planSource"]
  convertedFromWaitlist: boolean
  stripeCustomerId: string | null
  createdAt: string | null
}

export function toMemberRow(client: ClientRecord, waitlistEmails: Set<string>): BillingMemberRow {
  const b = client.billing
  const live = hasLiveSubscription(b)
  return {
    email: client.email,
    businessName: client.businessName,
    plan: client.plan,
    interval: live ? (b?.interval ?? null) : null,
    status: memberStatus(client.plan, b),
    billingState: b?.billingState ?? null,
    renewalDate: live && b?.currentPeriodEnd ? new Date(b.currentPeriodEnd).toISOString() : null,
    cancelAtPeriodEnd: live && !!b?.cancelAtPeriodEnd,
    flyersCreated: client.flyersCreated,
    flyersLimit: PLAN_LIMITS[client.plan],
    paidSince: b?.paidSince ?? null,
    failedPaymentCount: b?.failedPaymentCount ?? 0,
    refundCount: b?.refundCount ?? 0,
    disputeCount: b?.disputeCount ?? 0,
    planSource: b?.planSource ?? null,
    convertedFromWaitlist: waitlistEmails.has(client.email.toLowerCase()),
    stripeCustomerId: client.stripeCustomerId,
    createdAt: client.createdAt,
  }
}

// ---- Overview ---------------------------------------------------------------

export interface BillingOverview {
  activeBasic: number
  activePro: number
  monthly: number
  annual: number
  pastDue: number
  paused: number
  canceledLast30Days: number
  freeTrial: number
  /** Cents per month, pre-tax. Active + past_due subscriptions, INCLUDING ones cancelling at period end (still billed until then); annual ÷ 12; paused excluded (nothing is being billed). */
  estimatedMrrCents: number
  /** Cents. Sum of tax on invoice.paid events with a KY billing state, this calendar month (UTC), from the capped activity log. */
  kentuckyTaxThisMonthCents: number
  paidMembers: number
  totalSignups: number
  /** paidMembers ÷ totalSignups, 0–1. Null with no signups. */
  trialToPaidRate: number | null
  waitlistPeople: number
  waitlistEntries: number
  paidFromWaitlist: number
  /** paidFromWaitlist ÷ waitlistPeople, 0–1. Null with an empty waitlist. */
  waitlistToPaidRate: number | null
}

export function computeOverview(input: {
  clients: ClientRecord[]
  totalSignups: number
  waitlistEmails: Set<string>
  waitlistEntries: number
  events: BillingEventSummary[]
  now: number
}): BillingOverview {
  const { clients, now } = input
  let activeBasic = 0, activePro = 0, monthly = 0, annual = 0, pastDue = 0, paused = 0, canceledLast30Days = 0, freeTrial = 0
  let mrr = 0, paidMembers = 0, paidFromWaitlist = 0

  for (const c of clients) {
    const b = c.billing
    if (c.plan === "trial") freeTrial++
    const status = memberStatus(c.plan, b)
    if (status === "canceled" && b?.endedAt && now - Date.parse(b.endedAt) <= 30 * DAY_MS) canceledLast30Days++
    if (!hasLiveSubscription(b)) continue

    paidMembers++
    if (input.waitlistEmails.has(c.email.toLowerCase())) paidFromWaitlist++
    if (b!.interval === "annual") annual++
    else if (b!.interval === "monthly") monthly++

    if (status === "paused") {
      paused++
      continue
    }
    if (status === "past_due") pastDue++
    if (status === "active" && b!.plan === "basic") activeBasic++
    if (status === "active" && b!.plan === "pro") activePro++
    if (b!.unitAmount) mrr += b!.interval === "annual" ? b!.unitAmount / 12 : b!.unitAmount
  }

  const month = new Date(now).toISOString().slice(0, 7)
  const kentuckyTaxThisMonthCents = input.events
    .filter((e) => e.type === "invoice.paid" && e.state === "KY" && e.at.slice(0, 7) === month)
    .reduce((sum, e) => sum + (e.tax ?? 0), 0)

  return {
    activeBasic,
    activePro,
    monthly,
    annual,
    pastDue,
    paused,
    canceledLast30Days,
    freeTrial,
    estimatedMrrCents: Math.round(mrr),
    kentuckyTaxThisMonthCents,
    paidMembers,
    totalSignups: input.totalSignups,
    trialToPaidRate: input.totalSignups ? paidMembers / input.totalSignups : null,
    waitlistPeople: input.waitlistEmails.size,
    waitlistEntries: input.waitlistEntries,
    paidFromWaitlist,
    waitlistToPaidRate: input.waitlistEmails.size ? paidFromWaitlist / input.waitlistEmails.size : null,
  }
}

// ---- Needs attention ----------------------------------------------------------

export interface AttentionItem {
  kind: "past_due" | "payment_failed" | "dispute" | "admin_override"
  email: string | null
  detail: string
  at: string | null
}

export function needsAttention(clients: ClientRecord[], disputes: DisputeRecord[]): AttentionItem[] {
  const items: AttentionItem[] = []
  for (const c of clients) {
    const b = c.billing
    if (!b) continue
    if (b.status === "past_due" || b.status === "unpaid") {
      items.push({ kind: "past_due", email: c.email, detail: `Subscription ${b.status}; ${b.failedPaymentCount} failed payment(s)`, at: b.syncedAt })
    } else if (b.failedPaymentCount > 0) {
      // A failed charge that hasn't (yet) made the subscription past_due —
      // e.g. a one-off invoice, or the first failure before Stripe's status
      // catches up. Worth a look; not the same as past_due.
      items.push({ kind: "payment_failed", email: c.email, detail: `${b.failedPaymentCount} failed payment(s) since the last successful one`, at: b.syncedAt })
    }
    if (b.planSource === "admin_override") {
      items.push({ kind: "admin_override", email: c.email, detail: `Plan set to ${b.overridePlan ?? c.plan} by ${b.overrideBy ?? "admin"}`, at: b.overrideAt })
    }
  }
  // Closed disputes (won, lost, warning closed) need nothing more and drop off.
  for (const d of disputes.filter((d) => !d.closedAt && !CLOSED_DISPUTE_STATUSES.has(d.status))) {
    items.push({
      kind: "dispute",
      email: d.email,
      detail: `Dispute ${d.id}: $${(d.amount / 100).toFixed(2)}, ${d.reason}, ${d.status.replace(/_/g, " ")} — respond in Stripe`,
      at: d.createdAt,
    })
  }
  return items.sort((a, b) => (b.at ?? "").localeCompare(a.at ?? ""))
}

// ---- Free-Pro audit -------------------------------------------------------------

/**
 * Accounts holding a paid plan with neither a live Stripe subscription nor a
 * logged admin override. Before billing, /onboarding?plan=pro granted Pro to
 * anyone who visited it; this is where any such account shows up. Read-only.
 */
export function freePaidPlanAudit(clients: ClientRecord[]): ClientRecord[] {
  return clients.filter((c) => c.plan !== "trial" && !hasLiveSubscription(c.billing) && c.billing?.planSource !== "admin_override")
}

// ---- CSV ----------------------------------------------------------------------

const CSV_COLUMNS: (keyof BillingMemberRow)[] = [
  "email", "plan", "interval", "status", "billingState", "renewalDate", "cancelAtPeriodEnd", "flyersCreated", "flyersLimit",
  "paidSince", "failedPaymentCount", "refundCount", "disputeCount", "planSource", "convertedFromWaitlist",
]

export function membersCsv(rows: BillingMemberRow[]): string {
  // Leading = + - @ would make a spreadsheet evaluate the cell; prefix them.
  const esc = (v: unknown) => {
    let s = v === null || v === undefined ? "" : String(v)
    if (/^[=+\-@]/.test(s)) s = `'${s}`
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return [CSV_COLUMNS.join(","), ...rows.map((r) => CSV_COLUMNS.map((c) => esc(r[c])).join(","))].join("\n")
}

/** Dashboard link for a customer — the /test/ path whenever the key isn't live. */
export function stripeCustomerUrl(customerId: string, liveMode: boolean): string {
  return `https://dashboard.stripe.com/${liveMode ? "" : "test/"}customers/${customerId}`
}
