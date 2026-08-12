"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import useSWR from "swr"
import type {
  Deliverables,
  FlyerDeliverable,
  FlyerStatus,
} from "@/lib/types"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

/* ----------------------------- Status badge ------------------------------ */
function StatusBadge({ status }: { status: FlyerStatus | string }) {
  const map: Record<string, string> = {
    Ready: "bg-[var(--brand-teal-tint)] text-[var(--brand-teal-bright)] border-[var(--brand-teal)]/40",
    "In Progress": "bg-amber-400/10 text-amber-300 border-amber-400/30",
    Pending: "bg-white/[0.05] text-muted-foreground border-white/12",
    Failed: "bg-red-500/10 text-red-400 border-red-500/30",
  }
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${map[status] ?? map.Pending}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-current" />
      {status}
    </span>
  )
}

/* ------------------------------ Flyer card ------------------------------- */
function FlyerCard({ flyer, onRetry }: { flyer: FlyerDeliverable; onRetry: (flyerId: string) => void }) {
  const ready = flyer.status === "Ready"
  const failed = flyer.status === "Failed"
  const [retrying, setRetrying] = useState(false)

  async function handleRetry() {
    setRetrying(true)
    await onRetry(flyer.id)
  }

  return (
    <div className="rounded-xl border border-white/10 bg-card overflow-hidden flex flex-col">
      <div className="aspect-[4/3] bg-[var(--brand-navy-deep)] flex items-center justify-center">
        {ready && flyer.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={flyer.thumbnailUrl || "/placeholder.svg"} alt={`${flyer.title} preview`} className="w-full h-full object-cover" />
        ) : failed ? (
          <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" className="text-red-400/60">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 8v5M12 16h.01" />
          </svg>
        ) : (
          <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" className="text-white/15">
            <rect x="4" y="3" width="16" height="18" rx="2" />
            <path d="M8 8h8M8 12h8M8 16h5" />
          </svg>
        )}
      </div>
      <div className="p-4 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium truncate">{flyer.title}</p>
          <div className="mt-1.5"><StatusBadge status={flyer.status} /></div>
          {failed && flyer.error && <p className="mt-1.5 text-xs text-red-400/80 leading-snug">{flyer.error}</p>}
        </div>
        {ready && flyer.downloadUrl && (
          <a href={flyer.downloadUrl}
            download={`${flyer.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.html`}
            className="shrink-0 text-xs font-medium px-3 py-1.5 rounded-lg bg-[var(--brand-teal-bright)] text-white hover:bg-[var(--brand-teal)] transition-colors">
            Download
          </a>
        )}
        {failed && (
          <button onClick={handleRetry} disabled={retrying}
            className="shrink-0 text-xs font-medium px-3 py-1.5 rounded-lg border border-white/12 hover:bg-white/[0.05] disabled:opacity-60 transition-colors">
            {retrying ? "Retrying…" : "Retry"}
          </button>
        )}
      </div>
    </div>
  )
}

/* ------------------------------- Upsell modal ---------------------------- */
function UpsellModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/60" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-card p-7" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-semibold">Request more collateral</h3>
        <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
          Need additional flyers, sheets, or one-pagers? Tell us what you need and we&apos;ll get it into your build queue — larger or specialty campaigns are simply scoped and quoted.
        </p>
        <textarea rows={3} placeholder="What should the new pieces cover?"
          className="mt-4 w-full rounded-lg bg-white/[0.04] border border-white/12 px-3.5 py-2.5 text-sm focus:outline-none focus:border-[var(--brand-teal-bright)] focus:ring-1 focus:ring-[var(--brand-teal-bright)]" />
        <div className="mt-5 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 rounded-lg border border-white/12 text-sm hover:bg-white/[0.05] transition-colors">
            Cancel
          </button>
          <button onClick={onClose} className="px-4 py-2 rounded-lg bg-[var(--brand-teal-bright)] text-white text-sm font-semibold hover:bg-[var(--brand-teal)] transition-colors">
            Send request
          </button>
        </div>
      </div>
    </div>
  )
}

/* ------------------------------- Dashboard ------------------------------- */
export function DashboardClient() {
  const router = useRouter()
  const [showUpsell, setShowUpsell] = useState(false)
  // Poll while the agent pipeline still has flyer work in flight (none seeded
  // yet, or any not yet "Ready") so Pending -> In Progress -> Ready shows up
  // without a manual refresh. Stops once all seeded flyers are Ready.
  // Auth is enforced server-side by middleware.ts before this ever renders.
  const { data, isLoading, mutate } = useSWR<Deliverables>("/api/deliverables", fetcher, {
    refreshInterval: (latest) => {
      if (!latest) return 3000
      // Ready and Failed are both terminal — stop polling once nothing is
      // actively generating. A retry flips a flyer back to "In Progress"
      // server-side, so the explicit mutate() in handleRetry re-triggers
      // this check immediately rather than waiting on the next poll tick.
      const flyersDone = latest.flyers.length > 0 && latest.flyers.every((f) => f.status === "Ready" || f.status === "Failed")
      return flyersDone ? 0 : 3000
    },
  })

  async function handleRetry(flyerId: string) {
    await fetch("/api/deliverables/retry", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ flyerId }),
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
      {/* Header */}
      <div className="flex items-center justify-between">
        <a href="/" className="flex items-center gap-2 font-semibold">
          <span className="inline-block w-2 h-2 rounded-full bg-[var(--brand-teal-bright)]" />
          OneFlyer
        </a>
        <button onClick={handleSignOut} className="text-sm text-muted-foreground hover:text-foreground transition-colors">
          Sign out
        </button>
      </div>

      <h1 className="mt-8 text-2xl md:text-3xl font-semibold tracking-tight">Your Dashboard</h1>

      {isLoading || !data ? (
        <p className="mt-8 text-muted-foreground">Loading your deliverables…</p>
      ) : (
        <>
          {/* Plan + status summary */}
          <div className="mt-6 grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="rounded-xl border border-white/10 bg-card p-5">
              <p className="text-xs uppercase tracking-widest text-muted-foreground/70">Current plan</p>
              <p className="mt-2 text-lg font-semibold">{data.planName}</p>
              <div className="mt-2"><StatusBadge status={data.billingStatus === "Active" ? "Ready" : "Pending"} /></div>
              <p className="mt-1.5 text-xs text-muted-foreground">Billing: {data.billingStatus}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-card p-5">
              <p className="text-xs uppercase tracking-widest text-muted-foreground/70">Onboarding</p>
              <p className="mt-2 text-lg font-semibold">{data.intakeStatus}</p>
              {data.intakeStatus === "Not started" && (
                <a href="/onboarding" className="mt-2 inline-block text-sm text-[var(--brand-teal-bright)] hover:text-[var(--brand-teal)]">
                  Complete onboarding →
                </a>
              )}
            </div>
            <div className="rounded-xl border border-white/10 bg-card p-5">
              <p className="text-xs uppercase tracking-widest text-muted-foreground/70">Deliverables ready</p>
              <p className="mt-2 text-lg font-semibold">
                {data.flyers.filter((f) => f.status === "Ready").length} / {data.flyers.length} flyers
              </p>
            </div>
            <div className="rounded-xl border border-white/10 bg-card p-5">
              <p className="text-xs uppercase tracking-widest text-muted-foreground/70">Flyers used</p>
              <p className="mt-2 text-lg font-semibold">
                {data.flyersLimit === null ? `${data.flyersCreated} · Unlimited` : `${data.flyersCreated} / ${data.flyersLimit}`}
              </p>
              {data.flyersLimit !== null && data.flyersCreated >= data.flyersLimit && (
                <p className="mt-1.5 text-xs text-amber-300">Limit reached — upgrade for unlimited flyers.</p>
              )}
            </div>
          </div>

          {/* Flyers & Pages */}
          <div className="mt-12 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Flyers & Pages</h2>
            <button onClick={() => setShowUpsell(true)}
              className="text-sm font-medium px-4 py-2 rounded-lg border border-white/12 hover:bg-white/[0.05] transition-colors">
              Request more collateral
            </button>
          </div>
          <div className="mt-5 grid grid-cols-2 md:grid-cols-3 gap-4">
            {data.flyers.map((f) => (
              <FlyerCard key={f.id} flyer={f} onRetry={handleRetry} />
            ))}
          </div>

        </>
      )}

      {showUpsell && <UpsellModal onClose={() => setShowUpsell(false)} />}
    </div>
  )
}
