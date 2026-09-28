"use client"

import { useState } from "react"

/**
 * Downloads a deliverable as a print-ready PDF.
 *
 * Not a plain <a download>, even though the route sends a
 * Content-Disposition header, because the render takes a couple of seconds
 * on a warm container and longer on a cold one. A link gives no feedback
 * for that whole time, and a button that looks broken gets clicked again —
 * which starts a second Chromium render of the same flyer. So this fetches
 * the bytes, shows its own progress, and reports a failure as a message
 * rather than as a downloaded file full of JSON.
 *
 * "Download" (the existing button beside this one) saves the HTML source.
 * This is the one to hand to a printer.
 */
export function PdfButton({
  flyerId,
  title,
  variant = "print",
  className,
}: {
  flyerId: string
  title: string
  /** "print" is the flyer itself; "instagram" is the square social version. */
  variant?: "print" | "instagram"
  className?: string
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function download() {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/flyers/${encodeURIComponent(flyerId)}/pdf?variant=${variant}`)
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        setError(body?.error ?? "Couldn't build the PDF. Try again in a moment.")
        return
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      // The server names the file too; this is what the browser actually
      // uses for a blob: URL, so the two are kept in step.
      a.download = `${title.replace(/[^a-z0-9]+/gi, "-").toLowerCase().replace(/^-+|-+$/g, "") || "flyer"}.pdf`
      document.body.appendChild(a)
      a.click()
      a.remove()
      // Revoked on a delay: Safari cancels an in-flight download if the
      // object URL disappears the moment click() returns.
      window.setTimeout(() => URL.revokeObjectURL(url), 30_000)
    } catch {
      setError("We couldn't reach the server. Check your connection and try again.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => void download()}
        disabled={busy}
        className={
          className ??
          "text-xs font-medium px-4 py-1.5 rounded-full border border-border hover:bg-[var(--surface-sunken)] disabled:opacity-60 transition-colors"
        }
      >
        {busy ? "Building PDF…" : "PDF"}
      </button>
      {error && (
        <span role="alert" className="text-xs text-amber-700 dark:text-amber-300 leading-snug">
          {error}
        </span>
      )}
    </>
  )
}
