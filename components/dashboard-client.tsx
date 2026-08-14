"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import useSWR from "swr"
import type {
  Deliverables,
  FlyerDeliverable,
  FlyerStatus,
  RepurposedFlyerContent,
} from "@/lib/types"
import { FormFillSection } from "@/components/form-fill-section"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

/* ----------------------------- Status badge ------------------------------ */
export function StatusBadge({ status }: { status: FlyerStatus | string }) {
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

/* --------------------------- Flyer thumbnail ------------------------------
 * A real preview of the generated flyer, rendered before download — not a
 * generic icon. Sized close to a standard letter page (most flyer requests
 * land near there) and then shrunk hard as a whole via a CSS transform.
 * That transform is also the "zoomed out" anti-theft measure the client
 * asked for: at this scale body copy isn't legible enough to substitute for
 * the real download — only the layout and colors read — and pointer-events
 * plus a full sandbox keep it from being clicked, selected, or copied out of
 * the card. This is a practical deterrent for casual copying, not DRM — a
 * technical user could still inspect the underlying data URL.
 */
const THUMB_SCALE = 0.14
const THUMB_IFRAME_WIDTH = 850
const THUMB_IFRAME_HEIGHT = 1100

function FlyerThumbnail({
  downloadUrl,
  title,
  iframeWidth = THUMB_IFRAME_WIDTH,
  iframeHeight = THUMB_IFRAME_HEIGHT,
  scale = THUMB_SCALE,
}: {
  downloadUrl: string
  title: string
  iframeWidth?: number
  iframeHeight?: number
  scale?: number
}) {
  return (
    <div
      className="overflow-hidden rounded-md bg-white shadow-inner"
      style={{ width: iframeWidth * scale, height: iframeHeight * scale }}
    >
      <iframe
        src={downloadUrl}
        title={`${title} preview`}
        tabIndex={-1}
        sandbox=""
        aria-hidden="true"
        style={{
          width: iframeWidth,
          height: iframeHeight,
          border: "none",
          transform: `scale(${scale})`,
          transformOrigin: "top left",
          pointerEvents: "none",
        }}
      />
    </div>
  )
}

/* --------------------------- Repurposed content ---------------------------
 * Same headline/offer/CTA as the print flyer, reformatted per channel —
 * an Instagram-ready square post plus copy-paste text for a text blast and
 * a Nextdoor post. Collapsed by default so it doesn't crowd the card for
 * anyone who only wants the print flyer.
 */
function CopyableText({ label, text }: { label: string; text: string }) {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <button onClick={handleCopy}
          className="text-xs font-medium text-[var(--brand-teal-bright)] hover:text-[var(--brand-teal)] transition-colors">
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
      <p className="mt-1 text-sm whitespace-pre-wrap rounded-lg bg-white/[0.03] border border-white/10 p-3 leading-relaxed">{text}</p>
    </div>
  )
}

function RepurposedSection({ repurposed, title }: { repurposed: RepurposedFlyerContent; title: string }) {
  const [open, setOpen] = useState(false)

  return (
    <div className="mt-3 pt-3 border-t border-white/10">
      <button onClick={() => setOpen((v) => !v)}
        className="text-xs font-medium text-muted-foreground hover:text-foreground transition-colors">
        {open ? "Hide other formats ▲" : "Show other formats (Instagram, text, Nextdoor) ▼"}
      </button>
      {open && (
        <div className="mt-3 flex flex-col gap-4">
          <div>
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <p className="text-xs font-medium text-muted-foreground">Instagram post</p>
              <a href={repurposed.instagramDownloadUrl}
                download={`${title.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-instagram.html`}
                className="text-xs font-medium text-[var(--brand-teal-bright)] hover:text-[var(--brand-teal)] transition-colors">
                Download
              </a>
            </div>
            <FlyerThumbnail downloadUrl={repurposed.instagramDownloadUrl} title={`${title} Instagram`} iframeWidth={1080} iframeHeight={1080} scale={0.14} />
          </div>
          <CopyableText label="Instagram caption" text={repurposed.instagramCaption} />
          <CopyableText label="Text blast blurb" text={repurposed.textBlurb} />
          <CopyableText label="Nextdoor post" text={repurposed.nextdoorPost} />
        </div>
      )}
    </div>
  )
}

/* ------------------------------ Flyer card ------------------------------- */
export function FlyerCard({
  flyer,
  onRetry,
  onDelete,
}: {
  flyer: FlyerDeliverable
  onRetry: (flyerId: string) => Promise<{ ok: boolean; error?: string }>
  onDelete?: (flyerId: string) => Promise<{ ok: boolean; error?: string }>
}) {
  const ready = flyer.status === "Ready"
  const failed = flyer.status === "Failed"
  const [retrying, setRetrying] = useState(false)
  const [retryError, setRetryError] = useState("")
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState("")

  async function handleRetry() {
    setRetrying(true)
    setRetryError("")
    // Always reset `retrying` when this settles, success or failure — it
    // used to stay stuck saying "Retrying…" forever on any failure (an
    // expired session, a network error, anything), silently, with no
    // indication anything had gone wrong and nothing actually retried.
    const result = await onRetry(flyer.id)
    setRetrying(false)
    if (!result.ok) setRetryError(result.error ?? "Could not start retry — please try again.")
  }

  async function handleDelete() {
    if (!onDelete) return
    if (!confirmingDelete) {
      setConfirmingDelete(true)
      return
    }
    setDeleting(true)
    setDeleteError("")
    const result = await onDelete(flyer.id)
    if (!result.ok) {
      setDeleting(false)
      setConfirmingDelete(false)
      setDeleteError(result.error ?? "Could not delete — please try again.")
    }
    // On success the card unmounts once the list refreshes, so no need to
    // reset `deleting`/`confirmingDelete` here.
  }

  return (
    <div className="rounded-xl border border-white/10 bg-card overflow-hidden flex flex-col">
      <div className="aspect-[4/3] bg-[var(--brand-navy-deep)] flex items-center justify-center">
        {ready && flyer.downloadUrl ? (
          <FlyerThumbnail downloadUrl={flyer.downloadUrl} title={flyer.title} />
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
          {retryError && <p className="mt-1.5 text-xs text-amber-300 leading-snug">{retryError}</p>}
          {deleteError && <p className="mt-1.5 text-xs text-amber-300 leading-snug">{deleteError}</p>}
        </div>
        <div className="shrink-0 flex items-center gap-2">
          {ready && flyer.downloadUrl && (
            <a href={flyer.downloadUrl}
              download={`${flyer.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.html`}
              className="text-xs font-medium px-3 py-1.5 rounded-lg bg-[var(--brand-teal-bright)] text-white hover:bg-[var(--brand-teal)] transition-colors">
              Download
            </a>
          )}
          {failed && (
            <button onClick={handleRetry} disabled={retrying}
              className="text-xs font-medium px-3 py-1.5 rounded-lg border border-white/12 hover:bg-white/[0.05] disabled:opacity-60 transition-colors">
              {retrying ? "Retrying…" : "Retry"}
            </button>
          )}
          {onDelete && (
            <button onClick={handleDelete} onBlur={() => setConfirmingDelete(false)} disabled={deleting}
              className={`text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors disabled:opacity-60 ${
                confirmingDelete
                  ? "border-red-500/40 bg-red-500/10 text-red-400 hover:bg-red-500/20"
                  : "border-white/12 hover:bg-white/[0.05]"
              }`}>
              {deleting ? "Deleting…" : confirmingDelete ? "Confirm?" : "Delete"}
            </button>
          )}
        </div>
      </div>
      {ready && flyer.repurposed && (
        <div className="px-4 pb-4">
          <RepurposedSection repurposed={flyer.repurposed} title={flyer.title} />
        </div>
      )}
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

  async function handleRetry(flyerId: string): Promise<{ ok: boolean; error?: string }> {
    let res: Response
    try {
      res = await fetch("/api/deliverables/retry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ flyerId }),
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
      const data = await res.json().catch(() => ({}) as { message?: string; error?: string })
      return { ok: false, error: data.message ?? data.error ?? "Could not start retry — please try again." }
    }

    return { ok: true }
  }

  async function handleDelete(flyerId: string): Promise<{ ok: boolean; error?: string }> {
    let res: Response
    try {
      res = await fetch("/api/deliverables/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ flyerId }),
      })
    } catch {
      return { ok: false, error: "Couldn't reach the server — check your connection and try again." }
    }

    if (res.status === 401) {
      router.push("/login")
      return { ok: false, error: "Your session expired — signing you back in." }
    }

    if (!res.ok) {
      const data = await res.json().catch(() => ({}) as { error?: string })
      return { ok: false, error: data.error ?? "Could not delete — please try again." }
    }

    mutate()
    return { ok: true }
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
                {data.flyersCreated} / {data.flyersLimit}
              </p>
              {data.flyersCreated >= data.flyersLimit ? (
                <a href="/#pricing" className="mt-1.5 inline-block text-xs text-amber-300 hover:text-amber-200 transition-colors">
                  Limit reached — resets {new Date(data.flyersResetAt).toLocaleDateString()} →
                </a>
              ) : (
                <p className="mt-1.5 text-xs text-muted-foreground">Resets {new Date(data.flyersResetAt).toLocaleDateString()}</p>
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
              <FlyerCard key={f.id} flyer={f} onRetry={handleRetry} onDelete={handleDelete} />
            ))}
          </div>

          {data.planId === "pro" && <FormFillSection />}
        </>
      )}

      {showUpsell && <UpsellModal onClose={() => setShowUpsell(false)} />}
    </div>
  )
}
