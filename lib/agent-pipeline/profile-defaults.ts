import type { CampaignDefaults } from "@/lib/types"
import type { NormalizedIntake } from "./schemas/intake"

/**
 * Applies a client's own saved Business Profile (CampaignDefaults, edited at
 * /profile) to a hand-assembled NormalizedIntake.
 *
 * WHY THIS EXISTS
 * The guided flow gets these values for free: components/onboarding-form.tsx
 * fetches /api/campaign-defaults and pre-fills the form with `typed || saved`
 * before anything is submitted, so by the time the pipeline runs they're just
 * part of the submission. Quick Prompt has no form — it assembles a
 * NormalizedIntake directly in app/api/quick-prompt/route.ts — so it saw none
 * of it. A client who filled in /profile got zero benefit from it on that
 * path.
 *
 * That client-side merge is React state operating on the IntakeSubmission
 * form shape, so there was nothing server-side to reuse; this is the
 * server-side equivalent, deliberately scoped to the one caller that needs
 * it. The guided path is untouched and keeps merging where it always has.
 *
 * PRECEDENCE (highest first)
 *   1. This request  — styleOverride, body fields, and anything parsed out of
 *                      the prompt. What the client is asking for RIGHT NOW
 *                      must beat a stored preference, or a saved profile
 *                      would make "make it playful" impossible to honour.
 *   2. Saved profile — the client's own typed answers.
 *   3. Inferred      — the crawled site / the AI-inferred saved brand.
 *   4. Fallbacks     — the literal defaults the route already used.
 *
 * Every helper here is a no-op when `profile` is null, which is the case for
 * any client who has never opened /profile. Passing null must reproduce the
 * route's previous behaviour exactly.
 *
 * NOT MERGED, deliberately:
 *   brandColors   — CampaignDefaults stores free text ("navy, gold"), but
 *                   prompts/brand.ts instructs the agent to "use those exact
 *                   hex values" for existingColors. Converting names to hex
 *                   means duplicating the colour map that prompts/intake.ts
 *                   already owns; feeding it raw names would have the Brand
 *                   Agent treat "navy" as a hex value.
 *   socialHandles — stored as one free-text string, but contact.social wants
 *                   {platform, handle} pairs. Splitting and inferring the
 *                   platform is, again, logic prompts/intake.ts already owns.
 *   serviceArea   — deferred by explicit instruction.
 *   pastOffers    — nothing infers from it yet, by design.
 */

/** Treats whitespace-only as absent, so `??` chains skip blanks the way `||` would. */
export function nonEmpty(value: string | null | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

/**
 * CampaignDefaults.yearsInBusiness is free text from a number input;
 * NormalizedIntake wants a real number or null. Anything that isn't a
 * sensible count of years is dropped rather than guessed at — a bad parse
 * here would end up printed on a flyer as a credibility claim.
 */
export function parseYearsInBusiness(value: string | null | undefined): number | null {
  const raw = nonEmpty(value)
  if (!raw) return null
  const n = Number.parseInt(raw, 10)
  if (!Number.isFinite(n) || n < 0 || n > 200) return null
  return n
}

/**
 * Fills BLANKS in an already-resolved contact block from the saved profile.
 *
 * Gap-fill only: whatever the route already resolved — a number typed into
 * this request, a saved brand's contact, a scraped site — stays put. The
 * phone is never touched here at all; it is this campaign's call-to-action
 * and the route validates it separately.
 */
export function fillContactGapsFromProfile(
  contact: NormalizedIntake["contact"],
  profile: CampaignDefaults | null,
): NormalizedIntake["contact"] {
  if (!profile) return contact
  return {
    ...contact,
    address: nonEmpty(contact.address) ?? nonEmpty(profile.address),
    website: nonEmpty(contact.website) ?? nonEmpty(profile.website),
    contactName: nonEmpty(contact.contactName) ?? nonEmpty(profile.contactName),
  }
}
