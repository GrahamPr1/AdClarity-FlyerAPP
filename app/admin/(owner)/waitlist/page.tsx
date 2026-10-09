"use client"

import Link from "next/link"
import useSWR from "swr"
import type { WaitlistEntry } from "@/lib/types"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

type Summary = { total: number; basic: number; pro: number; monthly: number; annual: number; notNotified: number }

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-xs uppercase tracking-widest text-muted-foreground/70">{label}</p>
      <p className="mt-1.5 text-2xl font-semibold">{value}</p>
    </div>
  )
}

export default function WaitlistAdminPage() {
  const { data, isLoading, error } = useSWR<{ entries: WaitlistEntry[]; summary: Summary }>(
    "/api/admin/waitlist",
    fetcher,
    { revalidateOnFocus: false },
  )

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <Link href="/admin" className="text-sm text-muted-foreground transition-colors hover:text-foreground">
        ← Admin
      </Link>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl">Early Access waitlist</h1>
        {/* A plain link, not fetch+blob: the browser's own download handles
            the Content-Disposition the API already sets, and it still carries
            the admin session cookie. */}
        <a
          href="/api/admin/waitlist?format=csv"
          className="rounded-lg border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-[var(--surface-sunken)]"
        >
          Export CSV
        </a>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">
        People who asked to be told when billing goes live. Joining never changed their plan —
        everyone here is on whatever tier they already had.
      </p>

      {isLoading && <p className="mt-8 text-sm text-muted-foreground">Loading…</p>}
      {error && <p className="mt-8 text-sm text-red-400">Couldn&apos;t load the waitlist.</p>}

      {data && (
        <>
          <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <Stat label="Total" value={data.summary.total} />
            <Stat label="Basic" value={data.summary.basic} />
            <Stat label="Pro" value={data.summary.pro} />
            <Stat label="Monthly" value={data.summary.monthly} />
            <Stat label="Annual" value={data.summary.annual} />
            <Stat label="Not notified" value={data.summary.notNotified} />
          </div>

          {data.entries.length === 0 ? (
            <p className="mt-10 rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
              Nobody has joined yet.
            </p>
          ) : (
            <div className="mt-8 overflow-x-auto rounded-xl border border-border">
              <table className="w-full min-w-[40rem] text-sm">
                <thead className="bg-[var(--surface-soft)] text-left text-xs uppercase tracking-widest text-muted-foreground/70">
                  <tr>
                    <th className="px-4 py-3 font-medium">Email</th>
                    <th className="px-4 py-3 font-medium">Plan</th>
                    <th className="px-4 py-3 font-medium">Billing</th>
                    <th className="px-4 py-3 font-medium">Signed up</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.entries.map((e) => (
                    <tr key={e.id} className="border-t border-border">
                      <td className="px-4 py-3 break-all">{e.email}</td>
                      <td className="px-4 py-3 capitalize">{e.desiredPlan}</td>
                      <td className="px-4 py-3 capitalize">{e.billingInterval}</td>
                      <td className="px-4 py-3 text-muted-foreground">{new Date(e.createdAt).toLocaleDateString()}</td>
                      <td className="px-4 py-3">
                        {e.convertedAt ? (
                          <span className="text-emerald-300">Converted</span>
                        ) : e.notifiedAt ? (
                          <span className="text-[var(--brand-teal-bright)]">Notified</span>
                        ) : (
                          <span className="text-muted-foreground">Waiting</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  )
}
