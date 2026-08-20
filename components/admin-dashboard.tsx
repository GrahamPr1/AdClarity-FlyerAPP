"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import useSWR from "swr"
import type { BusinessCategory, Deliverables, PlanId } from "@/lib/types"
import { BUSINESS_CATEGORIES } from "@/lib/types"
import { StatusBadge, FlyerCard } from "@/components/dashboard-client"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

const PLAN_OPTIONS: PlanId[] = ["trial", "basic", "pro"]
const CATEGORY_FILTER_OPTIONS = ["All", ...BUSINESS_CATEGORIES] as const

// Counts every client once by their real businessCategory (always a real
// value — see ClientRecord.businessCategory in lib/types.ts, never null) so
// every category in BUSINESS_CATEGORIES gets a row even at zero, rather
// than only showing categories that happen to have at least one client.
function categoryCounts(clients: Deliverables[]): Record<BusinessCategory, number> {
  const counts = Object.fromEntries(BUSINESS_CATEGORIES.map((c) => [c, 0])) as Record<BusinessCategory, number>
  for (const client of clients) counts[client.businessCategory]++
  return counts
}

function CategorySummary({ clients }: { clients: Deliverables[] }) {
  const counts = useMemo(() => categoryCounts(clients), [clients])
  return (
    <div className="mt-8 rounded-2xl border border-white/10 bg-card p-6">
      <p className="text-xs uppercase tracking-widest text-muted-foreground/70">Clients by business category</p>
      <div className="mt-4 grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {BUSINESS_CATEGORIES.map((category) => (
          <div key={category} className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.02] px-4 py-2.5">
            <span className="text-sm">{category}</span>
            <span className="text-sm font-semibold text-[var(--brand-teal-bright)]">{counts[category]}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function ClientRow({ client, onRetry, onDelete, onPlanChange, onUpdatePrintStatus }: {
  client: Deliverables
  onRetry: (email: string, flyerId: string) => Promise<{ ok: boolean; error?: string }>
  onDelete: (email: string, flyerId: string) => Promise<{ ok: boolean; error?: string }>
  onPlanChange: (email: string, plan: PlanId) => Promise<void>
  onUpdatePrintStatus: (email: string, requestId: string, status: "Fulfilled" | "Cancelled") => Promise<void>
}) {
  const [changingPlan, setChangingPlan] = useState(false)
  const email = client.email ?? "(unknown)"

  async function handlePlanChange(e: React.ChangeEvent<HTMLSelectElement>) {
    setChangingPlan(true)
    await onPlanChange(email, e.target.value as PlanId)
    setChangingPlan(false)
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-card p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <p className="font-medium">{email}</p>
            <span className="text-xs px-2 py-0.5 rounded-full border border-white/12 text-muted-foreground">{client.businessCategory}</span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {client.flyersCreated} / {client.flyersLimit} flyers used · resets {new Date(client.flyersResetAt).toLocaleDateString()}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <StatusBadge status={client.billingStatus === "Active" ? "Ready" : "Pending"} />
          <select value={client.planId} onChange={handlePlanChange} disabled={changingPlan}
            className="rounded-lg bg-white/[0.04] border border-white/12 px-3 py-1.5 text-sm disabled:opacity-60">
            {PLAN_OPTIONS.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </div>
      </div>

      {client.flyers.length > 0 && (
        <div className="mt-5 grid grid-cols-2 md:grid-cols-4 gap-4">
          {client.flyers.map((f) => (
            <FlyerCard key={f.id} flyer={f} ownerEmail={email} onRetry={(flyerId) => onRetry(email, flyerId)} onDelete={(flyerId) => onDelete(email, flyerId)} />
          ))}
        </div>
      )}

      {client.printRequests.length > 0 && (
        <div className="mt-5 flex flex-col gap-2.5">
          <p className="text-xs uppercase tracking-widest text-muted-foreground/70">Print requests</p>
          {client.printRequests.map((r) => (
            <div key={r.id} className="rounded-xl border border-white/10 bg-white/[0.02] p-3 flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm">{r.quantity}× {r.flyerTitle}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{r.shippingName} — {r.shippingAddress}{r.notes ? ` · ${r.notes}` : ""}</p>
              </div>
              <div className="shrink-0 flex items-center gap-2">
                <StatusBadge status={r.status} />
                {r.status === "Requested" && (
                  <>
                    <button onClick={() => onUpdatePrintStatus(email, r.id, "Fulfilled")}
                      className="text-xs font-medium px-3 py-1.5 rounded-lg border border-white/12 hover:bg-white/[0.05] transition-colors">
                      Mark Fulfilled
                    </button>
                    <button onClick={() => onUpdatePrintStatus(email, r.id, "Cancelled")}
                      className="text-xs font-medium px-3 py-1.5 rounded-lg border border-white/12 hover:bg-white/[0.05] transition-colors">
                      Cancel
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function AdminDashboard() {
  const router = useRouter()
  const [categoryFilter, setCategoryFilter] = useState<(typeof CATEGORY_FILTER_OPTIONS)[number]>("All")
  const { data, isLoading, mutate } = useSWR<{ clients: Deliverables[] }>("/api/admin/clients", fetcher, {
    refreshInterval: 5000,
  })

  const filteredClients = useMemo(() => {
    if (!data) return []
    return categoryFilter === "All" ? data.clients : data.clients.filter((c) => c.businessCategory === categoryFilter)
  }, [data, categoryFilter])

  async function handleRetry(email: string, flyerId: string): Promise<{ ok: boolean; error?: string }> {
    let res: Response
    try {
      res = await fetch("/api/deliverables/retry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ flyerId, email }),
      })
    } catch {
      return { ok: false, error: "Couldn't reach the server — check your connection and try again." }
    }

    if (res.status === 401) {
      router.push("/login")
      return { ok: false, error: "Your session expired — signing you back in." }
    }

    mutate()

    if (!res.ok) {
      const body = await res.json().catch(() => ({}) as { message?: string; error?: string })
      return { ok: false, error: body.message ?? body.error ?? "Could not start retry — please try again." }
    }

    return { ok: true }
  }

  async function handleDelete(email: string, flyerId: string): Promise<{ ok: boolean; error?: string }> {
    let res: Response
    try {
      res = await fetch("/api/deliverables/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ flyerId, email }),
      })
    } catch {
      return { ok: false, error: "Couldn't reach the server — check your connection and try again." }
    }

    if (res.status === 401) {
      router.push("/login")
      return { ok: false, error: "Your session expired — signing you back in." }
    }

    if (!res.ok) {
      const body = await res.json().catch(() => ({}) as { error?: string })
      return { ok: false, error: body.error ?? "Could not delete — please try again." }
    }

    mutate()
    return { ok: true }
  }

  async function handleUpdatePrintStatus(email: string, requestId: string, status: "Fulfilled" | "Cancelled") {
    await fetch("/api/print-requests/status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, requestId, status }),
    })
    mutate()
  }

  async function handlePlanChange(email: string, plan: PlanId) {
    await fetch("/api/admin/set-plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, plan }),
    })
    mutate()
  }

  async function handleSignOut() {
    await fetch("/api/auth/logout", { method: "POST" })
    router.push("/login")
    router.refresh()
  }

  return (
    <div className="px-6 md:px-10 lg:px-16 py-10 max-w-6xl mx-auto">
      <div className="flex items-center justify-between">
        <a href="/" className="flex items-center gap-2 font-semibold">
          <span className="inline-block w-2 h-2 rounded-full bg-[var(--brand-teal-bright)]" />
          OneFlyer Admin
        </a>
        <div className="flex items-center gap-4">
          <a href="/admin" className="text-sm text-[var(--brand-teal-bright)] hover:text-[var(--brand-teal)] transition-colors">
            Admin Portal
          </a>
          <button onClick={handleSignOut} className="text-sm text-muted-foreground hover:text-foreground transition-colors">
            Sign out
          </button>
        </div>
      </div>

      <h1 className="mt-8 text-2xl md:text-3xl font-semibold tracking-tight">All Clients</h1>
      <p className="mt-1.5 text-sm text-muted-foreground">Every client's plan, usage, and flyers — this view only ever exists for the admin session.</p>

      {isLoading || !data ? (
        <p className="mt-8 text-muted-foreground">Loading clients…</p>
      ) : data.clients.length === 0 ? (
        <p className="mt-8 text-muted-foreground">No clients yet.</p>
      ) : (
        <>
          <CategorySummary clients={data.clients} />

          <div className="mt-8 flex items-center gap-3">
            <label htmlFor="categoryFilter" className="text-sm text-muted-foreground">Filter by category</label>
            <select id="categoryFilter" value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value as (typeof CATEGORY_FILTER_OPTIONS)[number])}
              className="rounded-lg bg-white/[0.04] border border-white/12 px-3 py-1.5 text-sm">
              {CATEGORY_FILTER_OPTIONS.map((c) => (
                <option key={c} value={c} className="bg-card">{c}</option>
              ))}
            </select>
          </div>

          <div className="mt-5 flex flex-col gap-5">
            {filteredClients.length === 0 ? (
              <p className="text-muted-foreground">No clients in this category.</p>
            ) : (
              filteredClients.map((c) => (
                <ClientRow key={c.email} client={c} onRetry={handleRetry} onDelete={handleDelete} onPlanChange={handlePlanChange} onUpdatePrintStatus={handleUpdatePrintStatus} />
              ))
            )}
          </div>
        </>
      )}
    </div>
  )
}
