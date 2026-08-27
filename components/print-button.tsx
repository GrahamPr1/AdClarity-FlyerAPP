"use client"

import { useRef, useState } from "react"

/**
 * Prints a deliverable on the client's own printer.
 *
 * Prints the flyer's OWN document (/api/flyers/[id]/view) inside a hidden
 * iframe rather than the dashboard page. That matters for three reasons:
 *
 *  - There is no site chrome to hide. The served document contains only the
 *    flyer, so no `@media print { nav, button { display:none } }` rules are
 *    needed and nothing can leak into the output by being forgotten.
 *  - The format's own `@page` rule is the one that applies, so a door hanger
 *    prints at 3.5x8.5in and a proposal paginates exactly as designed —
 *    printing the dashboard would impose the dashboard's page box instead.
 *  - It is the same rendering path as "open in new tab" and as the stored
 *    download, so what prints is genuinely what was generated.
 *
 * The route serves the document under `Content-Security-Policy: sandbox
 * allow-same-origin allow-modals`. allow-modals is what lets this call
 * print() on it; allow-scripts is still absent, so the generated HTML itself
 * remains unable to run anything.
 */
export function PrintButton({
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
  const frameRef = useRef<HTMLIFrameElement | null>(null)
  const [preparing, setPreparing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function handlePrint() {
    setError(null)
    setPreparing(true)

    // A fresh iframe each time: reusing one risks printing a stale document
    // after a retry or refinement has replaced the flyer.
    frameRef.current?.remove()
    const frame = document.createElement("iframe")
    frame.setAttribute("aria-hidden", "true")
    frame.title = `${title} — print`
    // Off-screen rather than display:none — a display:none iframe does not
    // lay out in some engines, and an unlaid-out document prints blank.
    frame.style.cssText = "position:fixed;right:0;bottom:0;width:1px;height:1px;opacity:0;border:0;"
    frame.src = `/api/flyers/${encodeURIComponent(flyerId)}/view?variant=${variant}`

    let settled = false
    const cleanup = () => {
      // Left in the DOM briefly: removing it synchronously after print()
      // cancels the job in Safari, which prints asynchronously.
      window.setTimeout(() => frame.remove(), 60_000)
    }

    frame.onload = () => {
      if (settled) return
      settled = true
      try {
        const win = frame.contentWindow
        if (!win) throw new Error("no window")
        win.focus()
        win.print()
        setPreparing(false)
        cleanup()
      } catch {
        // Most likely a browser refusing print() on the sandboxed frame.
        // Falling back to a real tab always works — the document carries its
        // own @page rules, so the client just hits Cmd/Ctrl+P there.
        setPreparing(false)
        setError("Your browser blocked the print dialog. We opened the flyer in a new tab — print from there.")
        window.open(frame.src, "_blank", "noopener,noreferrer")
        cleanup()
      }
    }

    frame.onerror = () => {
      if (settled) return
      settled = true
      setPreparing(false)
      setError("Couldn't load this for printing. Try again in a moment.")
      cleanup()
    }

    document.body.appendChild(frame)
    frameRef.current = frame
  }

  return (
    <>
      <button
        type="button"
        onClick={handlePrint}
        disabled={preparing}
        className={
          className ??
          "text-xs font-medium px-3 py-1.5 rounded-lg border border-white/12 hover:bg-white/[0.05] disabled:opacity-60 transition-colors"
        }
      >
        {preparing ? "Preparing…" : "Print"}
      </button>
      {error && (
        <span role="alert" className="text-xs text-amber-300 leading-snug">
          {error}
        </span>
      )}
    </>
  )
}
