import type { PlanId } from "@/lib/types"

/**
 * Plan-and-consent gating, kept in its own module so it can be unit-tested.
 *
 * pipeline.ts can't be imported from a test — it constructs a Redis client at
 * module load (the same reason flyer-html.ts was split out) — and these are
 * exactly the decisions that must not be wrong: they determine what a paying
 * plan gets and what a client explicitly declined.
 */

/** Basic/Pro only. Covers the extra channels (Instagram, text, Nextdoor) and eligibility for QR tracking. */
export function planIncludesExtras(plan: PlanId | undefined): boolean {
  return plan !== undefined && plan !== "trial"
}

/** Pro only. Still requires the client's own opt-in on top — see aiPhotosEnabled. */
export function planAllowsAiPhotos(plan: PlanId | undefined): boolean {
  return plan === "pro"
}

/**
 * Whether AI photo generation actually runs for this flyer.
 *
 * Same two-condition shape as qrEnabled, and for the same reason: the plan
 * has to include it AND the client has to have asked for it. The plan check
 * is outermost, so a Trial or Basic account gets nothing even if the
 * submitted flag says true — the onboarding checkbox is disabled for them,
 * but the form is not what enforces this.
 *
 * Unlike QR codes this defaults to OFF when unanswered: generating imagery
 * nobody asked for spends real credits and puts invented pictures on a
 * client's marketing.
 */
export function aiPhotosEnabled(plan: PlanId | undefined, wantsAiPhotos: boolean): boolean {
  return planAllowsAiPhotos(plan) && wantsAiPhotos
}

/**
 * Whether a flyer gets a QR code printed on it.
 *
 * Two independent conditions, both required: the plan has to include QR
 * tracking, AND the client has to have asked for one ("Add a QR code to your
 * flyer?" in onboarding).
 *
 * Deliberately separate from planIncludesExtras: declining a QR code must not
 * also switch off repurposing, which is gated by plan alone. And the plan
 * check is on the outside, so a client on Trial gets no QR even if the
 * submitted flag says true — the form disables the checkbox, but the form is
 * not what enforces this.
 */
export function qrEnabled(plan: PlanId | undefined, wantsQrCode: boolean): boolean {
  return planIncludesExtras(plan) && wantsQrCode
}

/**
 * Whether a client may start a NEW campaign right now.
 *
 * Pausing is deliberately a creation gate and nothing else. A paused client
 * keeps their dashboard, every flyer they've already generated, their brand
 * profile and their QR tracking — printed flyers in the world keep working,
 * because switching those off would punish the customer for taking a break.
 * The only thing that stops is spending more.
 */
export function canCreateCampaign(client: { pausedAt: string | null } | null | undefined): {
  allowed: boolean
  reason?: string
} {
  if (client?.pausedAt) {
    return {
      allowed: false,
      reason: "Your account is paused. Resume it from your profile to create new campaigns — nothing has been deleted.",
    }
  }
  return { allowed: true }
}
