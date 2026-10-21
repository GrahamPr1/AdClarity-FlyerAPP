"use client"

import Link from "next/link"
import useSWR from "swr"
import type { AttentionItem, BillingOverview as Overview } from "@/lib/billing-admin"
import { BillingNav, StatCard, date, fetcher, money, pct } from "./billing-ui"

const KIND_LABELS: Record<AttentionItem["kind"], string> = {
  past_due: "Past due",
  payment_failed: "Payment failed",
  annual_refund_due: "Annual refund due",
  dispute: "Dispute",
  admin_override: "Admin override",
}

/** Top of /admin: billing at a glance, and what needs a human. */
export function BillingOverview() {
  const { data, error, isLoading } = useSWR<{ overview: Overview; needsAttention: AttentionItem[] }>("/api/admin/billing", fetcher, {
    refreshInterval: 30000,
  })

  return (
    <section aria-labelledby="billing-heading" className="mt-8">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 id="billing-heading" className="text-xl">Billing</h2>
        <BillingNav />
      </div>

      {isLoading && <p className="mt-4 text-sm text-muted-foreground">Loading billing…</p>}
      {error && <p className="mt-4 text-sm text-red-400">Couldn&apos;t load billing.</p>}

      {data && (
        <>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard label="Active Basic" value={data.overview.activeBasic} />
            <StatCard label="Active Pro" value={data.overview.activePro} />
            <StatCard label="Monthly / annual" value={`${data.overview.monthly} / ${data.overview.annual}`} />
            <StatCard label="Free trial" value={data.overview.freeTrial} />
            <StatCard label="Past due" value={data.overview.pastDue} />
            <StatCard label="Paused" value={data.overview.paused} />
            <StatCard label="Canceled (30 days)" value={data.overview.canceledLast30Days} />
            <StatCard label="Paid members" value={data.overview.paidMembers} />
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Estimated MRR"
              value={money(data.overview.estimatedMrrCents)}
              note="Estimate, pre-tax, annual ÷ 12. Includes members cancelling at period end; paused excluded. Stripe Dashboard is the source of truth."
            />
            <StatCard
              label="Kentucky tax this month"
              value={money(data.overview.kentuckyTaxThisMonthCents)}
              note="Estimate from the activity log — use Stripe Tax reports for filing."
            />
            <StatCard
              label="Trial → paid"
              value={pct(data.overview.trialToPaidRate)}
              note={`${data.overview.paidMembers} paid of ${data.overview.totalSignups} signups`}
            />
            <StatCard
              label="Waitlist → paid"
              value={pct(data.overview.waitlistToPaidRate)}
              note={`${data.overview.paidFromWaitlist} paid of ${data.overview.waitlistPeople} people (${data.overview.waitlistEntries} entries)`}
            />
          </div>

          <h3 className="mt-8 text-sm font-semibold">Needs attention</h3>
          {data.needsAttention.length === 0 ? (
            <p className="mt-2 rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">Nothing right now.</p>
          ) : (
            <ul className="mt-2 divide-y divide-border rounded-xl border border-border">
              {data.needsAttention.map((item, i) => (
                <li key={`${item.kind}-${item.email}-${i}`} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-3 text-sm">
                  <span className="font-medium">{KIND_LABELS[item.kind]}</span>
                  {item.email ? (
                    <Link href={`/admin/billing/members/${encodeURIComponent(item.email)}`} className="break-all text-[var(--brand-teal-bright)] hover:underline">
                      {item.email}
                    </Link>
                  ) : (
                    <span className="text-muted-foreground">no matching member</span>
                  )}
                  <span className="text-muted-foreground">{item.detail}</span>
                  <span className="ml-auto text-xs text-muted-foreground">{date(item.at)}</span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  )
}
