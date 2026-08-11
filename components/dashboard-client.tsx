"use client"

import { useState } from "react"
import useSWR from "swr"
import type {
  Deliverables,
  FlyerDeliverable,
  FlyerStatus,
  WebsiteStatus,
} from "@/lib/types"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

/* ------------------------- Placeholder auth gate ------------------------- */
// NOTE: This is a placeholder auth stub only — NOT production-grade. Replace
// with real authentication (email/password or magic link) before launch.
function LoginGate({ onLogin }: { onLogin: () => void }) {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")

  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2 font-semibold mb-8 justify-center">
          <span className="inline-block w-2 h-2 rounded-full bg-[var(--brand-teal-bright)]" />
          AdClarity
        </div>
        <div className="rounded-2xl border border-white/10 bg-card p-7">
          <h1 className="text-xl font-semibold">Client Login</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">Sign in to view your deliverables.</p>
          <form
            className="mt-6 flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault()
              // Placeholder — no real auth. Just reveal the dashboard.
              onLogin()
            }}
          >
            <div>
              <label htmlFor="email" className="block text-sm font-medium mb-1.5">Email</label>
              <input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg bg-white/[0.04] border border-white/12 px-3.5 py-2.5 text-sm focus:outline-none focus:border-[var(--brand-teal-bright)] focus:ring-1 focus:ring-[var(--brand-teal-bright)]"
                placeholder="you@business.com" />
            </div>
            <div>
              <label htmlFor="password" className="block text-sm font-medium mb-1.5">Password</label>
              <input id="password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg bg-white/[0.04] border border-white/12 px-3.5 py-2.5 text-sm focus:outline-none focus:border-[var(--brand-teal-bright)] focus:ring-1 focus:ring-[var(--brand-teal-bright)]"
                placeholder="••••••••" />
            </div>
            <button type="submit"
              className="mt-2 w-full py-2.5 rounded-lg bg-[var(--brand-teal-bright)] text-white text-sm font-semibold hover:bg-[var(--brand-teal)] transition-colors">
              Sign in
            </button>
          </form>
          <p className="mt-4 text-xs text-muted-foreground/70 text-center">
            Placeholder login — any values work for the demo.
          </p>
        </div>
      </div>
    </div>
  )
}

/* ----------------------------- Status badge ------------------------------ */
function StatusBadge({ status }: { status: FlyerStatus | WebsiteStatus | string }) {
  const map: Record<string, string> = {
    Ready: "bg-[var(--brand-teal-tint)] text-[var(--brand-teal-bright)] border-[var(--brand-teal)]/40",
    Live: "bg-[var(--brand-teal-tint)] text-[var(--brand-teal-bright)] border-[var(--brand-teal)]/40",
    "In Progress": "bg-amber-400/10 text-amber-300 border-amber-400/30",
    Pending: "bg-white/[0.05] text-muted-foreground border-white/12",
  }
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${map[status] ?? map.Pending}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-current" />
      {status}
    </span>
  )
}

/* ------------------------------ Flyer card ------------------------------- */
function FlyerCard({ flyer }: { flyer: FlyerDeliverable }) {
  const ready = flyer.status === "Ready"
  return (
    <div className="rounded-xl border border-white/10 bg-card overflow-hidden flex flex-col">
      <div className="aspect-[4/3] bg-[var(--brand-navy-deep)] flex items-center justify-center">
        {ready && flyer.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={flyer.thumbnailUrl || "/placeholder.svg"} alt={`${flyer.title} preview`} className="w-full h-full object-cover" />
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
        </div>
        {ready && flyer.downloadUrl && (
          <a href={flyer.downloadUrl}
            className="shrink-0 text-xs font-medium px-3 py-1.5 rounded-lg bg-[var(--brand-teal-bright)] text-white hover:bg-[var(--brand-teal)] transition-colors">
            Download
          </a>
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
  const [authed, setAuthed] = useState(false)
  const [showUpsell, setShowUpsell] = useState(false)
  const { data, isLoading } = useSWR<Deliverables>(authed ? "/api/deliverables" : null, fetcher)

  if (!authed) return <LoginGate onLogin={() => setAuthed(true)} />

  return (
    <div className="px-6 md:px-10 lg:px-16 py-10 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <a href="/" className="flex items-center gap-2 font-semibold">
          <span className="inline-block w-2 h-2 rounded-full bg-[var(--brand-teal-bright)]" />
          AdClarity
        </a>
        <button onClick={() => setAuthed(false)} className="text-sm text-muted-foreground hover:text-foreground transition-colors">
          Sign out
        </button>
      </div>

      <h1 className="mt-8 text-2xl md:text-3xl font-semibold tracking-tight">Your Dashboard</h1>

      {isLoading || !data ? (
        <p className="mt-8 text-muted-foreground">Loading your deliverables…</p>
      ) : (
        <>
          {/* Plan + status summary */}
          <div className="mt-6 grid sm:grid-cols-3 gap-4">
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
              <p className="mt-1.5 text-xs text-muted-foreground">Website: {data.website.status}</p>
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
              <FlyerCard key={f.id} flyer={f} />
            ))}
          </div>

          {/* Website / Landing Page */}
          <h2 className="mt-12 text-lg font-semibold">Website / Landing Page</h2>
          <div className="mt-5 rounded-xl border border-white/10 bg-card p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium">Your generated website</p>
              <div className="mt-2"><StatusBadge status={data.website.status} /></div>
              {data.website.status === "Live" && data.website.url && (
                <p className="mt-2 text-sm text-muted-foreground">{data.website.url}</p>
              )}
            </div>
            {data.website.status === "Live" && data.website.url ? (
              <a href={data.website.url} target="_blank" rel="noreferrer"
                className="px-5 py-2.5 rounded-lg bg-[var(--brand-teal-bright)] text-white text-sm font-semibold hover:bg-[var(--brand-teal)] transition-colors">
                Visit Site
              </a>
            ) : (
              <span className="text-sm text-muted-foreground">Your site is being built — we&apos;ll notify you when it&apos;s live.</span>
            )}
          </div>
        </>
      )}

      {showUpsell && <UpsellModal onClose={() => setShowUpsell(false)} />}
    </div>
  )
}
