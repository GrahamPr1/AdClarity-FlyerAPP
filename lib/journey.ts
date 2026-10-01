/**
 * Where this client actually is, end to end.
 *
 * The Control Center that runs during a website scan proved its own rule:
 * every row is driven by something the server observed, and "ran but found
 * nothing" is a distinct state from "succeeded" so the panel never ticks a
 * box for work that did not happen. The scan was the only part of the
 * product that worked that way. Everything after it — profile, product,
 * generation, export — left the client guessing.
 *
 * This is the same contract applied to the whole journey. Each step below
 * maps to a fact already in storage:
 *
 *   scan     a canonical profile exists, and whether a crawl produced it
 *   profile  that profile has the fields a flyer actually needs
 *   product  the client has described at least one thing they sell
 *   options  at least one campaign has produced a Ready flyer
 *   export   a PDF or print view of a finished flyer was really served
 *
 * Nothing here is derived from elapsed time, and nothing advances because
 * the client clicked past it. Opening the product form does not complete
 * "product"; saving one does.
 *
 * Deliberately NOT a stored cursor. A "currentStep" field in Redis would
 * drift the moment anything changed outside the flow — a product deleted,
 * a campaign that failed, an account restored from an older state — and a
 * progress bar that disagrees with the dashboard beside it is worse than
 * none. Deriving it means it cannot be wrong about what exists.
 *
 * Pure and dependency-free, so the derivation can be tested without Redis.
 */

export type JourneyStepId = "scan" | "profile" | "product" | "options" | "export"

/**
 * done     — observed complete
 * current  — the next thing to do, and reachable now
 * skipped  — genuinely bypassed, not failed (no website to scan)
 * blocked  — cannot be done until an earlier step is
 * pending  — not started, not yet reachable
 *
 * "skipped" exists for the same reason it does in the scan panel: a client
 * with no website has not failed, and must not be shown a red mark or a
 * tick for a scan that never ran.
 */
export type JourneyStepStatus = "done" | "current" | "pending" | "skipped" | "blocked"

export interface JourneyStep {
  id: JourneyStepId
  label: string
  status: JourneyStepStatus
  /** One short line of real detail, e.g. "3 options ready". Never a guess. */
  detail?: string
  /** Where clicking this step takes them, when it leads anywhere useful. */
  href?: string
}

/** Everything the derivation needs, all of it read from storage. */
export interface JourneyFacts {
  /** A canonical business profile exists. */
  hasProfile: boolean
  /** The profile carries what a flyer needs (name, contact, something to say). */
  profileComplete: boolean
  /** URLs a crawl actually read. Empty means no scan produced this profile. */
  scannedPages: number
  /** The client told us they have no website, so a scan is not pending work. */
  scanDeclined: boolean
  productCount: number
  /** Flyers that finished and can be picked. */
  readyFlyerCount: number
  /** Flyers still being generated right now. */
  generatingFlyerCount: number
  /** The pipeline's own current stage, when something is running. */
  generationStage: string | null
  /** A PDF or print view of a finished flyer was served. */
  hasExported: boolean
  /** Real QR scans recorded against this client's flyers. */
  qrScans: number
  /**
   * Whether any flyer actually carries a QR code.
   *
   * QR tracking is a paid feature, so a Free Trial client's flyers have no
   * code on them at all. Telling them scans "show up here" would promise
   * something their plan does not include — see the export detail below.
   */
  hasTrackingCodes: boolean
}

const LABELS: Record<JourneyStepId, string> = {
  scan: "Scan your website",
  profile: "Business profile",
  product: "Product or service",
  options: "Creative options",
  export: "Download or print",
}

export const JOURNEY_STEP_ORDER: JourneyStepId[] = ["scan", "profile", "product", "options", "export"]

/**
 * The journey, as the stored facts actually describe it.
 *
 * Exactly one step is "current" — the first unfinished one that is
 * reachable. Steps after it are "pending", not "blocked", unless they
 * genuinely cannot be attempted: you cannot export a flyer that does not
 * exist, and saying "pending" there would imply it is merely waiting its
 * turn rather than depending on something.
 */
export function deriveJourney(facts: JourneyFacts): JourneyStep[] {
  const scanStatus: JourneyStepStatus = facts.scannedPages > 0
    ? "done"
    : facts.scanDeclined || facts.hasProfile
      ? "skipped"
      : "current"

  const profileDone = facts.hasProfile && facts.profileComplete
  const productDone = facts.productCount > 0
  const optionsDone = facts.readyFlyerCount > 0
  const exportDone = facts.hasExported

  const steps: JourneyStep[] = [
    {
      id: "scan",
      label: LABELS.scan,
      status: scanStatus,
      detail:
        facts.scannedPages > 0
          ? `${facts.scannedPages} page${facts.scannedPages === 1 ? "" : "s"} read`
          : scanStatus === "skipped"
            ? "Filled in by hand"
            : undefined,
      href: "/onboarding",
    },
    {
      id: "profile",
      label: LABELS.profile,
      status: profileDone ? "done" : facts.hasProfile ? "current" : scanStatus === "current" ? "pending" : "current",
      detail: facts.hasProfile && !facts.profileComplete ? "Needs a few details" : undefined,
      href: "/profile",
    },
    {
      id: "product",
      label: LABELS.product,
      status: productDone
        ? "done"
        : profileDone
          ? "current"
          : "blocked",
      detail: productDone
        ? `${facts.productCount} saved`
        : profileDone
          ? undefined
          : "Needs your business profile first",
      href: "/onboarding",
    },
    {
      id: "options",
      label: LABELS.options,
      // Generating is its own visible state rather than a half-tick: the
      // work is genuinely underway and the stage name below says where.
      status: optionsDone
        ? "done"
        : facts.generatingFlyerCount > 0
          ? "current"
          : productDone
            ? "current"
            : "blocked",
      detail: optionsDone
        ? `${facts.readyFlyerCount} ready to pick`
        : facts.generationStage
          ? facts.generationStage
          : facts.generatingFlyerCount > 0
            ? "Generating…"
            : productDone
              ? undefined
              : "Add what you're promoting first",
      href: "/dashboard",
    },
    {
      id: "export",
      label: LABELS.export,
      status: exportDone ? "done" : optionsDone ? "current" : "blocked",
      detail: exportDone
        ? facts.qrScans > 0
          ? `${facts.qrScans} QR scan${facts.qrScans === 1 ? "" : "s"} so far`
          : facts.hasTrackingCodes
            ? "Share it and QR scans show up here"
            : "Ready to hand out"
        : optionsDone
          ? undefined
          : "Nothing finished to export yet",
      href: "/dashboard",
    },
  ]

  // Exactly one "current": the first one. Later steps that were marked
  // current by their own condition fall back to pending, so the panel
  // points at one next action rather than several.
  let seenCurrent = false
  for (const step of steps) {
    if (step.status !== "current") continue
    if (seenCurrent) step.status = "pending"
    else seenCurrent = true
  }

  return steps
}

/** True once every step that can be completed has been. */
export function journeyComplete(steps: JourneyStep[]): boolean {
  return steps.every((s) => s.status === "done" || s.status === "skipped")
}

/** The one thing to do next, or null when there is nothing left. */
export function nextStep(steps: JourneyStep[]): JourneyStep | null {
  return steps.find((s) => s.status === "current") ?? null
}
