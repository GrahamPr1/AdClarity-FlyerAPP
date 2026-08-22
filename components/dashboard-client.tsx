"use client"

import Link from "next/link"
import { useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import useSWR from "swr"
import type {
  BusinessCategory,
  Deliverables,
  FlyerDeliverable,
  FlyerStatus,
  RepurposedFlyerContent,
} from "@/lib/types"
import { BUSINESS_CATEGORIES } from "@/lib/types"
import { FormFillSection } from "@/components/form-fill-section"
import { LoadingSpinner } from "@/components/loading-spinner"
import { SUPPORT_EMAIL } from "@/lib/marketing"
import { trackEvent } from "@/lib/analytics"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

// Shown only for accounts that predate the Category onboarding step (see
// Deliverables.businessCategoryIsDefaulted) — non-blocking by design, per
// the product ask: a banner they can act on or dismiss, never a modal that
// gates the rest of the dashboard. Disappears for good the moment they pick
// something (including explicitly picking "Other"), since setting a real
// value is what businessCategoryIsDefaulted actually tracks.
function CategoryBanner({ onSaved }: { onSaved: () => void }) {
  const [dismissed, setDismissed] = useState(false)
  const [category, setCategory] = useState<BusinessCategory | "">("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  if (dismissed) return null

  async function handleSave() {
    if (!category) return
    setSaving(true)
    setError("")
    try {
      const res = await fetch("/api/business-category", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}) as { error?: string })
        throw new Error(data.error ?? "Could not save — please try again.")
      }
      onSaved()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save — please try again.")
      setSaving(false)
    }
  }

  return (
    <div className="mt-6 rounded-xl border border-[var(--brand-teal)]/40 bg-[var(--brand-teal-tint)] p-4 flex flex-wrap items-center gap-3">
      <p className="text-sm flex-1 min-w-[16rem]">What type of business are you? This helps us tailor templates to you.</p>
      <select value={category} onChange={(e) => setCategory(e.target.value as BusinessCategory)}
        className="rounded-lg bg-white/[0.06] border border-white/12 px-3 py-1.5 text-sm">
        <option value="" className="bg-card">Select one…</option>
        {BUSINESS_CATEGORIES.map((c) => (
          <option key={c} value={c} className="bg-card">{c}</option>
        ))}
      </select>
      <button onClick={handleSave} disabled={!category || saving}
        className="text-sm font-medium px-4 py-1.5 rounded-lg bg-[var(--brand-teal-bright)] text-white hover:bg-[var(--brand-teal)] disabled:opacity-60 transition-colors">
        {saving ? "Saving…" : "Save"}
      </button>
      <button onClick={() => setDismissed(true)} className="text-sm text-muted-foreground hover:text-foreground transition-colors">
        Not now
      </button>
      {error && <p role="alert" className="w-full text-sm text-red-400">{error}</p>}
    </div>
  )
}

/* ----------------------------- Status badge ------------------------------ */
export function StatusBadge({ status }: { status: FlyerStatus | string }) {
  const map: Record<string, string> = {
    Ready: "bg-[var(--brand-teal-tint)] text-[var(--brand-teal-bright)] border-[var(--brand-teal)]/40",
    Fulfilled: "bg-[var(--brand-teal-tint)] text-[var(--brand-teal-bright)] border-[var(--brand-teal)]/40",
    "In Progress": "bg-amber-400/10 text-amber-300 border-amber-400/30",
    Pending: "bg-white/[0.05] text-muted-foreground border-white/12",
    Requested: "bg-white/[0.05] text-muted-foreground border-white/12",
    Failed: "bg-red-500/10 text-red-400 border-red-500/30",
    Cancelled: "bg-red-500/10 text-red-400 border-red-500/30",
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
  viewUrl,
  title,
  iframeWidth = THUMB_IFRAME_WIDTH,
  iframeHeight = THUMB_IFRAME_HEIGHT,
  scale = THUMB_SCALE,
}: {
  /** data: URL — fine for the sandboxed preview iframe below. */
  downloadUrl: string
  /** Real same-origin URL for the new-tab link. Browsers block top-level navigation to data: URLs, so this cannot be downloadUrl. */
  viewUrl: string
  title: string
  iframeWidth?: number
  iframeHeight?: number
  scale?: number
}) {
  return (
    <div
      className="relative overflow-hidden rounded-md bg-white shadow-inner"
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
      {/* Sits above the inert preview iframe (pointerEvents none, sandboxed)
          so this is the one clickable thing on the thumbnail — opens the
          real flyer full-size in a new tab for anyone who just wants to
          look, not download.

          Points at /api/flyers/[id]/view, NOT at downloadUrl: top-level
          navigation to a data: URL fails in every engine tested (differently
          in each — see tests/browser/open-in-new-tab.spec.ts), so this button
          silently did nothing when it pointed at the data URL directly. */}
      <a
        href={viewUrl}
        target="_blank"
        rel="noopener noreferrer"
        title={`Open ${title} in a new tab`}
        aria-label={`Open ${title} in a new tab`}
        className="absolute top-1.5 right-1.5 flex items-center justify-center w-6 h-6 rounded-md bg-black/55 text-white hover:bg-black/75 transition-colors"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
          <path d="M15 3h6v6" />
          <path d="M10 14 21 3" />
        </svg>
      </a>
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
  const [copyFailed, setCopyFailed] = useState(false)

  async function handleCopy() {
    // navigator.clipboard is undefined on insecure origins and can reject if
    // permission is denied. Unguarded, that threw an unhandled rejection and
    // the button silently never changed to "Copied!" — leaving someone
    // repeatedly clicking a button that appears to do nothing.
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setCopyFailed(false)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopyFailed(true)
    }
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
      {copyFailed && (
        <p className="mt-1 text-xs text-amber-300">
          Your browser blocked copying — select the text below and copy it manually.
        </p>
      )}
      <p className="mt-1 text-sm whitespace-pre-wrap rounded-lg bg-white/[0.03] border border-white/10 p-3 leading-relaxed">{text}</p>
    </div>
  )
}

function RepurposedSection({ repurposed, title, viewUrl }: { repurposed: RepurposedFlyerContent; title: string; viewUrl: string }) {
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
            <FlyerThumbnail downloadUrl={repurposed.instagramDownloadUrl} viewUrl={`${viewUrl}&variant=instagram`} title={`${title} Instagram`} iframeWidth={1080} iframeHeight={1080} scale={0.14} />
          </div>
          <CopyableText label="Instagram caption" text={repurposed.instagramCaption} />
          <CopyableText label="Text blast blurb" text={repurposed.textBlurb} />
          <CopyableText label="Nextdoor post" text={repurposed.nextdoorPost} />
        </div>
      )}
    </div>
  )
}

/* ---------------------------- Print order form -----------------------------
 * Requests printed copies of this flyer — NOT a real order. No print API
 * call, no charge happens here; it just queues a request the admin sees and
 * fulfills/invoices manually outside the app (no Stripe billing exists yet
 * to charge anyone automatically).
 */
function PrintOrderSection({ flyerId, onSubmit }: { flyerId: string; onSubmit: (payload: {
  flyerId: string
  quantity: number
  shippingName: string
  shippingAddress: string
  notes: string
}) => Promise<{ ok: boolean; error?: string }> }) {
  const [open, setOpen] = useState(false)
  const [quantity, setQuantity] = useState("25")
  const [shippingName, setShippingName] = useState("")
  const [shippingAddress, setShippingAddress] = useState("")
  const [notes, setNotes] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")
  const [submitted, setSubmitted] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    const parsedQuantity = parseInt(quantity, 10)
    if (!Number.isInteger(parsedQuantity) || parsedQuantity < 1) {
      setError("Enter a valid quantity.")
      return
    }
    if (!shippingName.trim() || !shippingAddress.trim()) {
      setError("Provide a name and shipping address.")
      return
    }
    setSubmitting(true)
    const result = await onSubmit({ flyerId, quantity: parsedQuantity, shippingName: shippingName.trim(), shippingAddress: shippingAddress.trim(), notes: notes.trim() })
    setSubmitting(false)
    if (!result.ok) {
      setError(result.error ?? "Could not submit your request — please try again.")
      return
    }
    setSubmitted(true)
    setOpen(false)
  }

  return (
    <div className="mt-3 pt-3 border-t border-white/10">
      <button onClick={() => setOpen((v) => !v)}
        className="text-xs font-medium text-muted-foreground hover:text-foreground transition-colors">
        {open ? "Cancel print request ▲" : "Order printed copies ▼"}
      </button>
      {submitted && !open && <p className="mt-2 text-xs text-[var(--brand-teal-bright)]">Request submitted — we&apos;ll follow up to confirm and arrange payment.</p>}
      {open && (
        <form onSubmit={handleSubmit} className="mt-3 flex flex-col gap-2.5">
          <div>
            <label className="block text-xs font-medium mb-1">Quantity</label>
            <input type="number" min={1} max={500} value={quantity} onChange={(e) => setQuantity(e.target.value)}
              className="w-24 rounded-lg bg-white/[0.04] border border-white/12 px-3 py-1.5 text-sm focus:outline-none focus:border-[var(--brand-teal-bright)]" />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Name</label>
            <input type="text" value={shippingName} onChange={(e) => setShippingName(e.target.value)}
              className="w-full rounded-lg bg-white/[0.04] border border-white/12 px-3 py-1.5 text-sm focus:outline-none focus:border-[var(--brand-teal-bright)]" />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Shipping address</label>
            <textarea rows={2} value={shippingAddress} onChange={(e) => setShippingAddress(e.target.value)}
              className="w-full rounded-lg bg-white/[0.04] border border-white/12 px-3 py-1.5 text-sm focus:outline-none focus:border-[var(--brand-teal-bright)]" />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Notes (optional)</label>
            <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)}
              placeholder="Paper stock, deadline, anything else"
              className="w-full rounded-lg bg-white/[0.04] border border-white/12 px-3 py-1.5 text-sm focus:outline-none focus:border-[var(--brand-teal-bright)]" />
          </div>
          {error && <p role="alert" className="text-xs text-red-400">{error}</p>}
          <button type="submit" disabled={submitting}
            className="self-start mt-1 px-4 py-2 rounded-lg bg-[var(--brand-teal-bright)] text-white text-xs font-semibold hover:bg-[var(--brand-teal)] disabled:opacity-60 transition-colors">
            {submitting ? "Submitting…" : "Submit request"}
          </button>
        </form>
      )}
    </div>
  )
}

/* ------------------------------ Flyer card ------------------------------- */
export function FlyerCard({
  flyer,
  onRetry,
  onDelete,
  onOrderPrint,
  showUpgradeHint,
  ownerEmail,
}: {
  flyer: FlyerDeliverable
  onRetry: (flyerId: string) => Promise<{ ok: boolean; error?: string }>
  onDelete?: (flyerId: string) => Promise<{ ok: boolean; error?: string }>
  onOrderPrint?: (payload: { flyerId: string; quantity: number; shippingName: string; shippingAddress: string; notes: string }) => Promise<{ ok: boolean; error?: string }>
  /** True when this flyer's client is on Trial — QR tracking, repurposing, and print requests aren't generated/available at all (real, server-side gate), so this shows why instead of silently having nothing. */
  showUpgradeHint?: boolean
  /** Only set by the admin roster view, which renders other clients' flyers. Threaded into the view URL so admin can open them; ignored for a client's own dashboard. */
  ownerEmail?: string
}) {
  const ready = flyer.status === "Ready"
  const failed = flyer.status === "Failed"
  const [retrying, setRetrying] = useState(false)
  const [retryError, setRetryError] = useState("")
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState("")

  // Refreshes periodically so a scan/click from a few minutes ago shows up
  // without a manual reload — cheap enough (one small GET) to poll while
  // the card is mounted rather than needing a push mechanism.
  const { data: statsData } = useSWR<{ stats: { scans: number; clicks: number } }>(
    ready && flyer.trackingCode ? `/api/tracking/${flyer.trackingCode}` : null,
    fetcher,
    { refreshInterval: 15000 },
  )

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

  // Real same-origin URL for "open in new tab" — a data: URL cannot be used
  // for top-level navigation (browsers block it). ownerEmail is passed only
  // by the admin roster, which views other clients' flyers; a client's own
  // dashboard omits it and the route falls back to their session identity.
  const viewUrl = `/api/flyers/${flyer.id}/view?v=1${ownerEmail ? `&email=${encodeURIComponent(ownerEmail)}` : ""}`

  return (
    <div className="rounded-xl border border-white/10 bg-card overflow-hidden flex flex-col">
      <div className="aspect-[4/3] bg-[var(--brand-navy-deep)] flex items-center justify-center">
        {ready && flyer.downloadUrl ? (
          <FlyerThumbnail downloadUrl={flyer.downloadUrl} viewUrl={viewUrl} title={flyer.title} />
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
      {/* Stacked, not a single row: the title+stats column and the button
          group used to sit side by side, and at real card width the
          "N scanned · N clicked" text ran straight into the Download
          button. */}
      <div className="p-4 flex flex-col gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium truncate">{flyer.title}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1.5">
            <StatusBadge status={flyer.status} />
            {statsData?.stats && (
              <span className="text-xs text-muted-foreground" title="QR scans / CTA clicks">
                {statsData.stats.scans} scanned · {statsData.stats.clicks} clicked
              </span>
            )}
          </div>
          {failed && flyer.error && <p className="mt-1.5 text-xs text-red-400/80 leading-snug">{flyer.error}</p>}
          {retryError && <p className="mt-1.5 text-xs text-amber-300 leading-snug">{retryError}</p>}
          {deleteError && <p className="mt-1.5 text-xs text-amber-300 leading-snug">{deleteError}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
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
          <RepurposedSection repurposed={flyer.repurposed} title={flyer.title} viewUrl={viewUrl} />
        </div>
      )}
      {ready && onOrderPrint && (
        <div className="px-4 pb-4">
          <PrintOrderSection flyerId={flyer.id} onSubmit={onOrderPrint} />
        </div>
      )}
      {ready && showUpgradeHint && (
        <div className="px-4 pb-4 pt-3 border-t border-white/10">
          <Link href="/#pricing" className="text-xs text-[var(--brand-teal-bright)] hover:text-[var(--brand-teal)] transition-colors">
            Upgrade to Basic to unlock scan tracking, Instagram/text/Nextdoor versions, and print requests →
          </Link>
        </div>
      )}
    </div>
  )
}

/* ------------------------------ Profile nudge -----------------------------
 * Where the optional half of the old six-step onboarding now surfaces.
 *
 * Those fields (brand colors, voice, style, website, address, socials) were
 * removed from the first-campaign path because none of them are required to
 * generate one — they only made a new signup page through ~15 inputs before
 * seeing any result. They're worth collecting eventually, so they're offered
 * here instead: after a campaign exists, once the product has proven itself.
 *
 * Hidden entirely once saved, and dismissible before that. Deliberately not a
 * modal and not repeated — it's an offer, not a demand.
 */
function ProfileNudge() {
  const [dismissed, setDismissed] = useState(false)
  const { data } = useSWR<{ defaults: unknown | null }>("/api/campaign-defaults", fetcher)

  // Render nothing until we know — flashing a "finish your profile" prompt at
  // someone who already finished it is worse than showing it a moment late.
  if (!data || data.defaults || dismissed) return null

  return (
    <div className="mt-6 flex flex-wrap items-center gap-3 rounded-xl border border-white/10 bg-card p-4">
      <div className="min-w-[16rem] flex-1">
        <p className="text-sm font-medium">Want your next campaign more on-brand?</p>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Add your colors, tone, and contact details once — every future campaign uses them
          automatically. Takes a minute, entirely optional.
        </p>
      </div>
      <Link href="/profile"
        className="rounded-lg bg-[var(--brand-teal-bright)] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[var(--brand-teal)]"
      >
        Add brand details
      </Link>
      <button
        onClick={() => setDismissed(true)}
        className="text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        Not now
      </button>
    </div>
  )
}

/* ------------------------------- Upsell modal ----------------------------
 * "Send request" used to be a lie: the textarea wasn't bound to any state
 * and the button only called onClose(), so a client could type out exactly
 * what they needed, hit send, watch the modal close, and never hear back —
 * because nothing was ever sent anywhere.
 *
 * There's no collateral-request API (and inventing one plus an admin queue
 * for it is a bigger change than this pass warrants), so this now composes a
 * real prefilled email instead. That genuinely delivers the message, and the
 * copy no longer promises a "build queue" that doesn't exist.
 */
function UpsellModal({ onClose }: { onClose: () => void }) {
  const [details, setDetails] = useState("")
  const [sent, setSent] = useState(false)

  function handleSend() {
    const body = encodeURIComponent(
      `Hi — I'd like to request additional marketing materials.\n\nWhat I need:\n${details.trim() || "(describe here)"}\n`,
    )
    const subject = encodeURIComponent("OneFlyer — request for more collateral")
    window.location.href = `mailto:${SUPPORT_EMAIL}?subject=${subject}&body=${body}`
    setSent(true)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/60" onClick={onClose} role="presentation">
      <div
        className="w-full max-w-md rounded-2xl border border-white/10 bg-card p-7"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="upsell-title"
      >
        <h3 id="upsell-title" className="text-lg font-semibold">Request more collateral</h3>
        <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
          Need something beyond your plan — a specialty piece, a bigger batch, a custom
          format? Describe it and we&apos;ll email you back to scope it.
        </p>
        <label htmlFor="collateral-details" className="mt-4 block text-sm font-medium">
          What do you need?
        </label>
        <textarea
          id="collateral-details"
          rows={3}
          value={details}
          onChange={(e) => setDetails(e.target.value)}
          placeholder="e.g. 500 door hangers for a spring roof promotion"
          className="mt-1.5 w-full rounded-lg bg-white/[0.04] border border-white/12 px-3.5 py-2.5 text-sm focus:outline-none focus:border-[var(--brand-teal-bright)] focus:ring-1 focus:ring-[var(--brand-teal-bright)]"
        />
        {sent ? (
          <p className="mt-3 text-sm text-[var(--brand-teal-bright)]">
            Your email app should have opened with the message ready to send. If it
            didn&apos;t, email us at{" "}
            <a href={`mailto:${SUPPORT_EMAIL}`} className="underline">{SUPPORT_EMAIL}</a>.
          </p>
        ) : (
          <p className="mt-2 text-xs text-muted-foreground">
            This opens your email app with the message drafted — nothing is sent until you
            hit send there.
          </p>
        )}
        <div className="mt-5 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 rounded-lg border border-white/12 text-sm hover:bg-white/[0.05] transition-colors">
            {sent ? "Close" : "Cancel"}
          </button>
          {!sent && (
            <button
              onClick={handleSend}
              disabled={!details.trim()}
              className="px-4 py-2 rounded-lg bg-[var(--brand-teal-bright)] text-white text-sm font-semibold hover:bg-[var(--brand-teal)] disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
            >
              Compose email
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

/* ------------------------------- Dashboard ------------------------------- */
export function DashboardClient() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [showUpsell, setShowUpsell] = useState(false)
  // /api/intake redirects here with ?onboarded=1 after a successful submit.
  // Nothing read it before, which produced the worst moment in the product:
  // seeding happens in a background waitUntil AFTER the response, so the
  // first poll can legitimately return zero flyers — and the brand-new user
  // who just finished a six-step form was shown the "Let's make your first
  // flyer" empty state, as though their submission had vanished.
  const justOnboarded = searchParams.get("onboarded") === "1"
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

  async function handleOrderPrint(payload: { flyerId: string; quantity: number; shippingName: string; shippingAddress: string; notes: string }): Promise<{ ok: boolean; error?: string }> {
    let res: Response
    try {
      res = await fetch("/api/print-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
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
      return { ok: false, error: data.error ?? "Could not submit your request — please try again." }
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
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <span className="inline-block w-2 h-2 rounded-full bg-[var(--brand-teal-bright)]" />
          OneFlyer
        </Link>
        <div className="flex items-center gap-4">
          {data?.isAdmin && (
            <Link href="/admin" className="text-sm text-[var(--brand-teal-bright)] hover:text-[var(--brand-teal)] transition-colors">
              Admin Portal
            </Link>
          )}
          <button onClick={handleSignOut} className="text-sm text-muted-foreground hover:text-foreground transition-colors">
            Sign out
          </button>
        </div>
      </div>

      <h1 className="mt-8 text-2xl md:text-3xl font-semibold tracking-tight">Your Dashboard</h1>

      {isLoading || !data ? (
        <LoadingSpinner message="Loading your deliverables…" />
      ) : (
        <>
          {data.businessCategoryIsDefaulted && <CategoryBanner onSaved={mutate} />}

          {/* Plan limit reached. The backend already enforces this hard (see
              the limit_reached branch in /api/intake) — before this, the only
              way a client learned they were out was to fill in the entire
              onboarding form and get rejected at submit. This surfaces the
              same fact up front, where it can still be acted on.
              TODO(stripe): point this at Checkout once it exists; the
              /#pricing link is the honest interim since no self-serve
              upgrade path is wired up yet. */}
          {data.flyersCreated >= data.flyersLimit && (
            <div className="mt-6 flex flex-wrap items-center gap-3 rounded-xl border border-amber-400/30 bg-amber-400/10 p-4">
              <p className="min-w-[16rem] flex-1 text-sm">
                You&apos;ve used all {data.flyersLimit} campaigns on your {data.planName} plan.
                They reset on {new Date(data.flyersResetAt).toLocaleDateString()}.
              </p>
              <Link
                href="/#pricing"
                onClick={() => trackEvent("upgrade_clicked", { plan: data.planId, location: "dashboard_limit" })}
                className="rounded-lg bg-[var(--brand-teal-bright)] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[var(--brand-teal)]"
              >
                Upgrade to keep creating
              </Link>
            </div>
          )}

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
                <Link href="/onboarding" className="mt-2 inline-block text-sm text-[var(--brand-teal-bright)] hover:text-[var(--brand-teal)]">
                  Complete onboarding →
                </Link>
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
                <Link href="/#pricing" className="mt-1.5 inline-block text-xs text-amber-300 hover:text-amber-200 transition-colors">
                  Limit reached — resets {new Date(data.flyersResetAt).toLocaleDateString()} →
                </Link>
              ) : (
                <p className="mt-1.5 text-xs text-muted-foreground">Resets {new Date(data.flyersResetAt).toLocaleDateString()}</p>
              )}
            </div>
          </div>

          {/* Flyers & Pages */}
          {data.flyers.length === 0 && justOnboarded ? (
            // Someone who just submitted, whose flyers haven't been seeded
            // yet. Reassurance, not an empty state — their work is not lost.
            <div className="mt-12 rounded-2xl border border-[var(--brand-teal)]/40 bg-[var(--brand-teal-tint)] p-10 text-center">
              <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-white/15 border-t-[var(--brand-teal-bright)]" />
              <h2 className="mt-5 text-xl font-semibold">Building your campaign…</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                We&apos;ve got your details. Your flyer and its matching versions are being
                designed now — this page updates on its own, so you can leave it open.
              </p>
            </div>
          ) : data.flyers.length === 0 ? (
            <div className="mt-12 rounded-2xl border border-white/10 bg-card p-10 text-center">
              <h2 className="text-xl font-semibold">Let&apos;s make your first campaign</h2>
              <p className="mt-2 text-sm text-muted-foreground">Takes about 2 minutes — we&apos;ll walk you through it.</p>
              <Link href="/onboarding"
                className="mt-6 inline-block px-6 py-3 rounded-xl bg-[var(--brand-teal-bright)] text-white text-sm font-semibold hover:bg-[var(--brand-teal)] transition-colors">
                Create your first campaign
              </Link>
            </div>
          ) : (
            <>
              {/* The achievement moment. Only for someone who arrived
                  straight from onboarding AND whose campaign has finished —
                  not on every later dashboard visit, where it would be noise. */}
              {justOnboarded && data.flyers.some((f) => f.status === "Ready") && (
                <div className="mt-12 flex flex-wrap items-center gap-3 rounded-2xl border border-[var(--brand-teal)]/40 bg-[var(--brand-teal-tint)] p-5">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[var(--brand-teal-bright)] text-white">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden="true">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-base font-semibold">Your campaign is ready</p>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      Download the flyer, or open it full size to check it over.
                    </p>
                  </div>
                </div>
              )}

              {/* The optional profile step, offered where it belongs: AFTER a
                  first campaign exists, rather than as two extra form steps
                  standing between signup and any visible result. Dismissible,
                  and hidden once they've saved anything. */}
              <ProfileNudge />

              <div className="mt-12 flex items-center justify-between gap-3">
                <h2 className="text-lg font-semibold">Flyers & Pages</h2>
                <div className="flex items-center gap-2">
                  <Link href="/onboarding"
                    className="text-sm font-medium px-4 py-2 rounded-lg bg-[var(--brand-teal-bright)] text-white hover:bg-[var(--brand-teal)] transition-colors">
                    New Campaign
                  </Link>
                  <button onClick={() => setShowUpsell(true)}
                    className="text-sm font-medium px-4 py-2 rounded-lg border border-white/12 hover:bg-white/[0.05] transition-colors">
                    Request more collateral
                  </button>
                </div>
              </div>
              <div className="mt-5 grid grid-cols-2 md:grid-cols-3 gap-4">
                {data.flyers.map((f) => (
                  <FlyerCard key={f.id} flyer={f} onRetry={handleRetry} onDelete={handleDelete}
                    onOrderPrint={data.planId !== "trial" ? handleOrderPrint : undefined}
                    showUpgradeHint={data.planId === "trial"} />
                ))}
              </div>
            </>
          )}

          {data.printRequests.length > 0 && (
            <>
              <h2 className="mt-12 text-lg font-semibold">Print Requests</h2>
              <div className="mt-5 flex flex-col gap-3">
                {data.printRequests.map((r) => (
                  <div key={r.id} className="rounded-xl border border-white/10 bg-card p-4 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{r.quantity}× {r.flyerTitle}</p>
                      <p className="mt-1 text-xs text-muted-foreground truncate">Ship to {r.shippingName} — {r.shippingAddress}</p>
                    </div>
                    <StatusBadge status={r.status} />
                  </div>
                ))}
              </div>
            </>
          )}

          {data.planId === "pro" && <FormFillSection />}
        </>
      )}

      {showUpsell && <UpsellModal onClose={() => setShowUpsell(false)} />}
    </div>
  )
}
