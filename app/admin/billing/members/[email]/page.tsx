"use client"

import { useParams } from "next/navigation"
import useSWR from "swr"
import type { BillingEventSummary, MemberBilling, PlanId } from "@/lib/types"
import { BillingNav, PLAN_LABELS, StatusText, date, fetcher, money } from "@/components/admin/billing-ui"

interface MemberDetail {
  email: string
  businessName: string | null
  plan: PlanId
  status: string
  flyersCreated: number
  flyersLimit: number
  periodStart: string
  periodEnd: string
  lifetimeFlyersCreated: number
  campaignsCreated: number
  pausedAt: string | null
  createdAt: string | null
  stripeCustomerId: string | null
  stripeUrl: string | null
  billing: MemberBilling | null
  convertedFromWaitlist: boolean
  recentEvents: BillingEventSummary[]
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 border-b border-border py-2 text-sm last:border-0">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right break-all">{children ?? "—"}</dd>
    </div>
  )
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <h2 className="text-xs uppercase tracking-widest text-muted-foreground/70">{title}</h2>
      <dl className="mt-2">{children}</dl>
    </section>
  )
}

export default function BillingMemberDetailPage() {
  const params = useParams<{ email: string }>()
  const email = decodeURIComponent(params.email)
  const { data, error, isLoading } = useSWR<MemberDetail>(`/api/admin/billing/members/${encodeURIComponent(email)}`, fetcher)
  const b = data?.billing

  return (
    <div className="mx-auto max-w-5xl px-6 py-10 md:px-10">
      <BillingNav />
      {isLoading && <p className="mt-6 text-muted-foreground">Loading…</p>}
      {error && <p className="mt-6 text-red-400">Couldn&apos;t load this member.</p>}
      {data && (
        <>
          <div className="mt-6 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl tracking-tight break-all">{data.email}</h1>
              <p className="text-sm text-muted-foreground">
                {data.businessName ?? "No business name"} · {PLAN_LABELS[data.plan]} · <StatusText status={data.status} />
              </p>
            </div>
            {data.stripeUrl && (
              <a href={data.stripeUrl} target="_blank" rel="noreferrer" className="rounded-lg border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-[var(--surface-sunken)]">
                View in Stripe ↗
              </a>
            )}
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <Card title="Subscription">
              <Field label="Plan">{b?.plan ? PLAN_LABELS[b.plan] : null}</Field>
              <Field label="Interval"><span className="capitalize">{b?.interval}</span></Field>
              <Field label="Stripe status">{b?.status}</Field>
              <Field label="Billing paused">{b ? (b.collectionPaused ? "Yes" : "No") : null}</Field>
              <Field label="Current period">{b?.currentPeriodStart ? `${date(new Date(b.currentPeriodStart).toISOString())} → ${date(new Date(b.currentPeriodEnd!).toISOString())}` : null}</Field>
              <Field label="Period paid">{b ? (b.currentPeriodPaid ? "Yes" : "No — awaiting payment") : null}</Field>
              <Field label="Cancels at period end">{b ? (b.cancelAtPeriodEnd ? "Yes" : "No") : null}</Field>
              <Field label="Price (pre-tax)">{b?.unitAmount != null ? `${money(b.unitAmount)} / ${b.interval === "annual" ? "year" : "month"}` : null}</Field>
              <Field label="Stripe customer">{data.stripeCustomerId}</Field>
              <Field label="Subscription ID">{b?.stripeSubscriptionId}</Field>
            </Card>

            <Card title="Payments">
              <Field label="Paid since">{date(b?.paidSince)}</Field>
              <Field label="Last payment">{b?.lastPaymentDate ? `${money(b.lastPaymentAmount)} on ${date(b.lastPaymentDate)}` : null}</Field>
              <Field label="Tax in last payment">{b?.lastPaymentTax != null ? money(b.lastPaymentTax) : null}</Field>
              <Field label="Billing state">{b?.billingState}</Field>
              <Field label="Failed payments (since last success)">{b?.failedPaymentCount ?? 0}</Field>
              <Field label="Refunds">{b?.refundCount ?? 0}</Field>
              <Field label="Disputes">{b?.disputeCount ? `${b.disputeCount} (last ${date(b.lastDisputeAt)})` : 0}</Field>
            </Card>

            <Card title="Cancellation">
              <Field label="Reason">{b?.cancellationReason?.replace(/_/g, " ")}</Field>
              <Field label="Feedback">{b?.cancellationFeedback?.replace(/_/g, " ")}</Field>
              <Field label="Cancellation requested">{date(b?.canceledAt)}</Field>
              <Field label="Ended">{date(b?.endedAt)}</Field>
            </Card>

            <Card title="Plan source & usage">
              <Field label="Plan source">{b?.planSource === "admin_override" ? `Admin override → ${b.overridePlan} by ${b.overrideBy} on ${new Date(b.overrideAt!).toLocaleString()}` : b?.planSource}</Field>
              <Field label="Usage this period">{data.flyersCreated} / {data.flyersLimit} (resets {date(data.periodEnd)})</Field>
              <Field label="Campaigns created">{data.campaignsCreated}</Field>
              <Field label="Flyers created, all time">{data.lifetimeFlyersCreated}</Field>
              <Field label="From the waitlist">{data.convertedFromWaitlist ? "Yes" : "No"}</Field>
              <Field label="Account paused">{data.pausedAt ? `Since ${date(data.pausedAt)}` : "No"}</Field>
              <Field label="Signed up">{date(data.createdAt)}</Field>
            </Card>
          </div>

          <h2 className="mt-8 text-sm font-semibold">Recent billing events</h2>
          <p className="text-xs text-muted-foreground">Summaries from the activity log. Invoices and receipts live in Stripe.</p>
          {data.recentEvents.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">None logged.</p>
          ) : (
            <ul className="mt-2 divide-y divide-border rounded-xl border border-border text-sm">
              {data.recentEvents.map((e, i) => (
                <li key={e.eventId ?? i} className="flex flex-wrap gap-x-3 px-4 py-2">
                  <span className="text-muted-foreground">{new Date(e.at).toLocaleString()}</span>
                  <span className="font-medium">{e.type}</span>
                  {e.amount != null && <span>{money(e.amount)}</span>}
                  {e.tax ? <span className="text-muted-foreground">tax {money(e.tax)}</span> : null}
                  {e.status && <span className="text-muted-foreground">{e.status}</span>}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  )
}
