"use client"

import type { ScanEvent, ScanStepId, ScanStepStatus } from "@/lib/scan-events"
import { SCAN_STEP_ORDER } from "@/lib/scan-events"

/**
 * The OneFlyer AI Control Center.
 *
 * Shows what the AI is ACTUALLY doing. Every row here is driven by an event
 * the server emitted after the corresponding operation really finished — see
 * app/api/business-scan/route.ts. There is no timer, no staged animation and
 * no step that ticks itself because enough time has passed.
 *
 * That constraint is why "skipped" exists as a distinct state. A scan that
 * ran fine but found no logo must not show a tick next to "Detect logo", and
 * must not show a red failure either: it says "No logo found" in muted type.
 * Pretending otherwise is the exact thing this panel is supposed to prevent.
 *
 * Purely presentational — it owns no fetching, so the same panel can be
 * driven by any future pipeline that emits the same events.
 */
export interface ControlCenterState {
  status: ScanStepStatus | "pending"
  label: string
  detail?: string
}

export function buildStepState(events: ScanEvent[]): Map<ScanStepId, ControlCenterState> {
  const state = new Map<ScanStepId, ControlCenterState>()
  for (const { id, label } of SCAN_STEP_ORDER) {
    state.set(id, { status: "pending", label })
  }
  for (const e of events) {
    if (e.type !== "step") continue
    state.set(e.id, { status: e.status, label: e.label, detail: e.detail })
  }
  return state
}

function Mark({ status }: { status: ControlCenterState["status"] }) {
  const base = "grid h-4 w-4 shrink-0 place-items-center rounded-full text-[10px] font-bold"
  if (status === "done") {
    return <span className={`${base} bg-[var(--brand-teal-bright)] text-[var(--primary-foreground)]`} aria-hidden="true">✓</span>
  }
  if (status === "failed") {
    return <span className={`${base} bg-[var(--destructive)] text-[var(--destructive-foreground)]`} aria-hidden="true">!</span>
  }
  if (status === "skipped") {
    return <span className={`${base} border border-border text-muted-foreground`} aria-hidden="true">–</span>
  }
  if (status === "running") {
    return (
      <span className={`${base} border-2 border-[var(--brand-teal-bright)] border-t-transparent animate-spin`} aria-hidden="true" />
    )
  }
  return <span className={`${base} border border-border`} aria-hidden="true" />
}

const SR_LABEL: Record<ControlCenterState["status"], string> = {
  done: "completed",
  failed: "failed",
  skipped: "nothing found",
  running: "in progress",
  pending: "not started",
}

export function AiControlCenter({
  events,
  className = "",
  title = "OneFlyer AI",
}: {
  events: ScanEvent[]
  className?: string
  title?: string
}) {
  const state = buildStepState(events)
  const started = events.length > 0

  return (
    <aside
      className={`rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-soft)] ${className}`}
      aria-label="OneFlyer AI activity"
    >
      <div className="flex items-center gap-2">
        <span className="h-1.5 w-1.5 rounded-full bg-[var(--brand-teal-bright)]" aria-hidden="true" />
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{title}</p>
      </div>

      {/* aria-live so a screen-reader user hears progress instead of watching
          ticks they cannot see. polite, not assertive: this is status, and it
          must not interrupt what they are reading. */}
      <ol className="mt-3 space-y-2" aria-live="polite" aria-busy={started && !state.get("save")?.status.includes("done")}>
        {SCAN_STEP_ORDER.map(({ id }) => {
          const s = state.get(id)!
          const muted = s.status === "pending" || s.status === "skipped"
          return (
            <li key={id} className="flex items-start gap-2.5 text-xs leading-snug">
              <span className="mt-0.5">
                <Mark status={s.status} />
              </span>
              <span className="min-w-0">
                <span className={muted ? "text-muted-foreground" : "text-foreground"}>{s.label}</span>
                <span className="sr-only"> — {SR_LABEL[s.status]}</span>
                {s.detail && (
                  <span className="block truncate text-[11px] text-muted-foreground" title={s.detail}>
                    {s.detail}
                  </span>
                )}
              </span>
            </li>
          )
        })}
      </ol>

      {!started && (
        <p className="mt-3 text-[11px] text-muted-foreground">
          Nothing running yet. Steps tick off as they actually complete.
        </p>
      )}
    </aside>
  )
}
