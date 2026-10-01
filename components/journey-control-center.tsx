"use client"

import Link from "next/link"
import useSWR from "swr"
import { fetcher } from "@/lib/swr-fetcher"
import { journeyComplete, nextStep, type JourneyStep, type JourneyStepStatus } from "@/lib/journey"

/**
 * The Control Center, extended from the website scan to the whole journey.
 *
 * Same contract as AiControlCenter and for the same reason: every mark here
 * reflects something the server observed. A step is done because a product
 * was saved or a PDF was really served, never because the client walked
 * past the screen that would have done it. "Skipped" and "blocked" exist so
 * the panel can say "you had no website" and "nothing finished to export
 * yet" instead of showing a tick or a cross that would both be lies.
 *
 * Deliberately a STRIP, not a wizard. The brief is that this must not
 * obstruct the main flow, and the flow already works without it — so it is
 * one row of five, it never gates a button, and the only interactive thing
 * on it is a link to whichever step is next. It tells you where you are; it
 * does not decide where you may go.
 *
 * Polls only while something is genuinely in flight. Once the journey is
 * finished it stops entirely rather than re-asking a settled question.
 */

const MARK_BASE = "grid h-4 w-4 shrink-0 place-items-center rounded-full text-[10px] font-bold"

function Mark({ status }: { status: JourneyStepStatus }) {
  if (status === "done") {
    return (
      <span className={`${MARK_BASE} bg-[var(--brand-teal-bright)] text-[var(--primary-foreground)]`} aria-hidden="true">
        ✓
      </span>
    )
  }
  if (status === "current") {
    return (
      <span
        className={`${MARK_BASE} border-2 border-[var(--brand-teal-bright)] bg-[var(--brand-teal-tint)] text-[var(--brand-teal-bright)]`}
        aria-hidden="true"
      >
        •
      </span>
    )
  }
  // skipped, blocked and pending all read as "not done", and none of them
  // is a failure — so none of them gets the destructive colour. They differ
  // in the wording beneath, which is where the real distinction belongs.
  if (status === "skipped") {
    return <span className={`${MARK_BASE} border border-border text-muted-foreground`} aria-hidden="true">–</span>
  }
  return <span className={`${MARK_BASE} border border-border`} aria-hidden="true" />
}

const SR_LABEL: Record<JourneyStepStatus, string> = {
  done: "done",
  current: "next up",
  pending: "not started",
  skipped: "skipped",
  blocked: "not available yet",
}

export function JourneyControlCenter({
  className = "",
  /** Hide once finished. True on the onboarding screens, where a completed
   *  strip is just clutter; false on the dashboard, where it stays as the
   *  record of what was done. */
  hideWhenComplete = false,
}: {
  className?: string
  hideWhenComplete?: boolean
}) {
  const { data } = useSWR<{ steps: JourneyStep[]; isAdmin: boolean }>("/api/journey", fetcher, {
    // While a campaign generates, the stage detail changes every few
    // seconds and this is the panel showing it. Settled journeys do not
    // poll at all — see below.
    refreshInterval: (latest) => {
      if (!latest || latest.isAdmin) return 0
      const running = latest.steps.some((s) => s.status === "current" || s.status === "pending")
      return running ? 5000 : 0
    },
    revalidateOnFocus: true,
  })

  // Renders nothing until the real state is known. A strip that appears
  // showing five empty circles and then rearranges itself is worse than one
  // that appears once, correct.
  if (!data || data.isAdmin || data.steps.length === 0) return null

  const steps = data.steps
  const complete = journeyComplete(steps)
  if (complete && hideWhenComplete) return null
  const next = nextStep(steps)

  return (
    <section
      aria-label="Your progress"
      className={`rounded-2xl border border-border bg-card px-4 py-3 shadow-[var(--shadow-soft)] ${className}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <div className="flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--brand-teal-bright)]" aria-hidden="true" />
          {/* Not "OneFlyer AI" — that label belongs to the live activity
              panel, and on the scan screen both are visible at once. Two
              identical headings over two different things read as a
              duplicated component. This one is the map; that one is the
              work happening right now. */}
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Your campaign
          </p>
        </div>
        {next?.href ? (
          <Link
            href={next.href}
            className="text-xs font-medium text-[var(--brand-teal-bright)] transition-colors hover:text-[var(--brand-teal)]"
          >
            Next: {next.label} →
          </Link>
        ) : (
          complete && <span className="text-xs text-muted-foreground">All set — your campaign is ready to use.</span>
        )}
      </div>

      <ol className="mt-2.5 grid gap-x-4 gap-y-2 sm:grid-cols-5" aria-live="polite">
        {steps.map((s) => (
          <li key={s.id} className="flex items-start gap-2 text-xs leading-snug">
            <span className="mt-px">
              <Mark status={s.status} />
            </span>
            <span className="min-w-0">
              <span className={s.status === "done" || s.status === "current" ? "text-foreground" : "text-muted-foreground"}>
                {s.label}
              </span>
              <span className="sr-only"> — {SR_LABEL[s.status]}</span>
              {s.detail && (
                <span className="block truncate text-[11px] text-muted-foreground" title={s.detail}>
                  {s.detail}
                </span>
              )}
            </span>
          </li>
        ))}
      </ol>
    </section>
  )
}
