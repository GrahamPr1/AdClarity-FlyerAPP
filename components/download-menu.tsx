"use client"

import { useState } from "react"
import { ChevronDown } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

/**
 * The one way to get a finished piece out as a file: a Download button with
 * a choice of HTML or PDF.
 *
 * Replaces a Download link and a separate PDF button that sat side by side.
 * Print stays its own button — sending a piece to your own printer is a
 * different intent from saving a file.
 *
 * HTML is the stored document itself, exactly as before: a plain
 * <a download> of the flyer's data: URL.
 *
 * PDF is the server render (/api/flyers/[id]/pdf), fetched rather than
 * linked because it takes a couple of seconds on a warm container and longer
 * on a cold one. A link gives no feedback for that whole time, and a button
 * that looks broken gets clicked again — which starts a second Chromium
 * render of the same flyer. So this shows its own progress and reports a
 * failure as a message rather than as a downloaded file full of JSON.
 *
 * Built on Radix's dropdown: the menu renders in a portal (the flyer card is
 * overflow-hidden and would clip it), Enter/Space/ArrowDown open it, arrows
 * move between items, Escape and an outside click close it, and collision
 * handling keeps it on screen at 375px.
 */
export function DownloadMenu({
  flyerId,
  title,
  htmlUrl,
  variant = "print",
  triggerClassName,
}: {
  flyerId: string
  title: string
  /** The stored document's data: URL — what the HTML option saves. */
  htmlUrl: string
  /** "print" is the flyer itself; "instagram" is the square social version. */
  variant?: "print" | "instagram"
  triggerClassName?: string
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const stem = title.replace(/[^a-z0-9]+/gi, "-").toLowerCase()
  const htmlName = variant === "instagram" ? `${stem}-instagram.html` : `${stem}.html`
  const pdfStem = stem.replace(/^-+|-+$/g, "") || "flyer"
  const pdfName = variant === "instagram" ? `${pdfStem}-instagram.pdf` : `${pdfStem}.pdf`

  async function downloadPdf() {
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
      a.download = pdfName
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
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger
          disabled={busy}
          className={
            // The pill stays the same size as the buttons beside it; the
            // ::before extends its hit area to 44px tall for touch without
            // changing the row's layout.
            "relative before:absolute before:inset-x-0 before:-inset-y-2 before:content-[''] " +
            (triggerClassName ??
              "inline-flex items-center gap-1 text-xs font-medium px-4 py-1.5 rounded-full bg-[var(--brand-teal-bright)] text-[var(--primary-foreground)] hover:bg-[var(--brand-teal)] disabled:opacity-60 transition-colors")
          }
        >
          {busy ? "Building PDF…" : "Download"}
          {!busy && <ChevronDown aria-hidden="true" className="size-3.5" />}
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          collisionPadding={16}
          className="w-64 max-w-[calc(100vw-2rem)]"
        >
          <DropdownMenuItem asChild className="min-h-11 flex-col items-start justify-center gap-0.5 py-2">
            <a href={htmlUrl} download={htmlName}>
              <span className="font-medium">HTML</span>
              <span className="text-xs text-muted-foreground">The web file. Opens in any browser.</span>
            </a>
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => void downloadPdf()}
            className="min-h-11 flex-col items-start justify-center gap-0.5 py-2"
          >
            <span className="font-medium">PDF</span>
            <span className="text-xs text-muted-foreground">Print-ready, at its real size. For email or a print shop.</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {error && (
        <span role="alert" className="text-xs text-amber-700 dark:text-amber-300 leading-snug">
          {error}
        </span>
      )}
    </>
  )
}
