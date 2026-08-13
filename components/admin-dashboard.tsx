"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import useSWR from "swr"
import type { Deliverables, PlanId } from "@/lib/types"
import { StatusBadge, FlyerCard } from "@/components/dashboard-client"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

const PLAN_OPTIONS: PlanId[] = ["trial", "basic", "pro"]

function ClientRow({ client, onRetry, onPlanChange }: {
  client: Deliverables
  onRetry: (email: string, flyerId: string) => Promise<{ ok: boolean; error?: string }>
  onPlanChange: (email: string, plan: PlanId) => Promise<void>
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
          <p className="font-medium">{email}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {client.flyersCreated} / {client.flyersLimit} flyers used
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
            <FlyerCard key={f.id} flyer={f} onRetry={(flyerId) => onRetry(email, flyerId)} />
          ))}
        </div>
      )}
    </div>
  )
}

export function AdminDashboard() {
  const router = useRouter()
  const { data, isLoading, mutate } = useSWR<{ clients: Deliverables[] }>("/api/admin/clients", fetcher, {
    refreshInterval: 5000,
  })

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
        <button onClick={handleSignOut} className="text-sm text-muted-foreground hover:text-foreground transition-colors">
          Sign out
        </button>
      </div>

      <h1 className="mt-8 text-2xl md:text-3xl font-semibold tracking-tight">All Clients</h1>
      <p className="mt-1.5 text-sm text-muted-foreground">Every client's plan, usage, and flyers — this view only ever exists for the admin session.</p>

      {isLoading || !data ? (
        <p className="mt-8 text-muted-foreground">Loading clients…</p>
      ) : data.clients.length === 0 ? (
        <p className="mt-8 text-muted-foreground">No clients yet.</p>
      ) : (
        <div className="mt-8 flex flex-col gap-5">
          {data.clients.map((c) => (
            <ClientRow key={c.email} client={c} onRetry={handleRetry} onPlanChange={handlePlanChange} />
          ))}
        </div>
      )}
    </div>
  )
}
