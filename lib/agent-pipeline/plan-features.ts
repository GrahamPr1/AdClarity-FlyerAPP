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
/**
 * Whether STOCK photography (Unsplash) may be sourced for this flyer.
 *
 * Every tier, always. Deliberately not gated on plan and not gated on
 * wantsAiPhotos:
 *
 *   - Not on plan, because a stock photograph costs nothing per image. The
 *     only per-image spend is Higgsfield, which aiPhotosEnabled still gates.
 *   - Not on wantsAiPhotos, because that question asks about AI-GENERATED
 *     imagery. A real photograph taken by a real photographer is not what
 *     the client declined, and reading "no AI photos" as "no photos at all"
 *     is putting words in their mouth.
 *
 * A client's own uploaded photos still win over this — see buildPhotoPool.
 *
 * This is a behaviour change: before, one flag gated BOTH sources, so a
 * free-trial flyer skipped Unsplash entirely and fell through to the
 * no-photo design. Everything downstream (scrim, attribution, download
 * trigger) already handles stock photos on any tier.
 */
export function stockPhotosEnabled(_plan: PlanId | undefined): boolean {
  return true
}

export function aiPhotosEnabled(plan: PlanId | undefined, wantsAiPhotos: boolean): boolean {
  return planAllowsAiPhotos(plan) && wantsAiPhotos
}

/**
 * Whether a flyer gets a QR code printed on it.
 *
 * Every plan, including Trial, as long as the client asked for one ("Add a QR
 * code to your flyer?" in onboarding). A Trial flyer's QR opens the static
 * offer page and counts scans; the lead form and offer-page editing are what
 * a paid plan adds (see leadCaptureEnabled). Trial used to get no QR at all,
 * which left nothing to show a trial account and nothing to upgrade from.
 *
 * Deliberately separate from planIncludesExtras: declining a QR code must not
 * also switch off repurposing, which is gated by plan alone. An unknown plan
 * (no client record) still gets none.
 *
 * Enterprise accounts (an agent profile with an org) keep the older rule, paid
 * plans only: Trial's QR is a self-serve upgrade path that was never part of
 * what an org approved.
 */
export function qrEnabled(plan: PlanId | undefined, wantsQrCode: boolean, isEnterpriseAccount = false): boolean {
  if (isEnterpriseAccount) return planIncludesExtras(plan) && wantsQrCode
  return plan !== undefined && wantsQrCode
}

/**
 * Whether a flyer's owner may create more QR codes for it, one per channel.
 * Basic/Pro, not paused: Trial keeps exactly one QR per flyer. Creation only:
 * channel codes that already exist keep resolving and counting on any plan.
 */
export function channelTrackingEnabled(client: { plan: PlanId; pausedAt: string | null } | null | undefined): boolean {
  return leadCaptureEnabled(client)
}

/**
 * The lead form and the offer-page editor: leadCaptureEnabled, minus enterprise
 * accounts (an agent profile with an org). Their flyers carry approved,
 * verbatim content, so an owner rewriting the public page, or collecting leads
 * on it, isn't something the org signed up for. Their QR still resolves to the
 * static page, and channel tracking follows its own rule above.
 */
export function offerPageFeaturesEnabled(client: { plan: PlanId; pausedAt: string | null } | null | undefined, isEnterpriseAccount: boolean): boolean {
  return leadCaptureEnabled(client) && !isEnterpriseAccount
}

/**
 * Whether a flyer's offer page shows the lead form, and whether its owner may
 * edit the page. Basic/Pro, not paused.
 *
 * Read from the OWNER's record on every request, not stored on the flyer, so
 * upgrading switches the form on for flyers already printed, and a downgrade
 * or pause switches it off. Never a reason to hide the offer page itself:
 * whatever this returns, /r/<code> still renders the offer and counts the scan.
 */
export function leadCaptureEnabled(client: { plan: PlanId; pausedAt: string | null } | null | undefined): boolean {
  return !!client && planIncludesExtras(client.plan) && !client.pausedAt
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

