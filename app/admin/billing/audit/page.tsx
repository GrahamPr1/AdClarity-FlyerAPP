"use client"

import Link from "next/link"
import useSWR from "swr"
import type { BillingMemberRow } from "@/lib/billing-admin"
import { BillingNav, PLAN_LABELS, date, fetcher } from "@/components/admin/billing-ui"

export default function FreeProAuditPage() {
  const { data, error, isLoading } = useSWR<{ accounts: BillingMemberRow[] }>("/api/admin/billing/audit", fetcher)

  return (
    <div className="mx-auto max-w-5xl px-6 py-10 md:px-10">
      <BillingNav />
      <h1 className="mt-6 text-2xl md:text-3xl tracking-tight">Free-Pro audit</h1>
      <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
        Accounts on Basic or Pro with no live Stripe subscription and no logged admin override. Before billing went
        live, visiting <code>/onboarding?plan=pro</code> granted the plan for free; accounts that came in that way
        (or were set with the dev scripts) show up here. This list is read-only — to change an account, use the
        admin plan override, which is then logged.
      </p>

      {isLoading && <p className="mt-8 text-sm text-muted-foreground">Loading…</p>}
      {error && <p className="mt-8 text-sm text-red-400">Couldn&apos;t load the audit.</p>}

      {data && (data.accounts.length === 0 ? (
        <p className="mt-8 rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">No unexplained paid plans.</p>
      ) : (
        <div className="mt-8 overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[36rem] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground/70">
                <th className="px-4 py-3 font-medium">Email</th>
                <th className="px-4 py-3 font-medium">Plan</th>
                <th className="px-4 py-3 font-medium">Stripe status</th>
                <th className="px-4 py-3 font-medium">Usage</th>
                <th className="px-4 py-3 font-medium">Signed up</th>
              </tr>
            </thead>
            <tbody>
              {data.accounts.map((a) => (
                <tr key={a.email} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 break-all">
                    <Link href={`/admin/billing/members/${encodeURIComponent(a.email)}`} className="hover:text-[var(--brand-teal-bright)]">{a.email}</Link>
                  </td>
                  <td className="px-4 py-3">{PLAN_LABELS[a.plan]}</td>
                  <td className="px-4 py-3 text-muted-foreground">{a.status.replace(/_/g, " ")}</td>
                  <td className="px-4 py-3">{a.flyersCreated} / {a.flyersLimit}</td>
                  <td className="px-4 py-3">{date(a.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
      {data && <p className="mt-3 text-sm text-muted-foreground">{data.accounts.length} account(s).</p>}
    </div>
  )
}
