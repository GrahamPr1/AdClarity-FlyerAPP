import { getCampaignDefaults, getClient, getSavedBrandProfile } from "@/lib/store"
import type { PendingGoalCampaign } from "@/lib/types"
import { nonEmpty, parseYearsInBusiness, fillContactGapsFromProfile } from "./profile-defaults"
import type { MarketingGoal, GoalChannel } from "./schemas/goal"
import type { NormalizedIntake } from "./schemas/intake"
import { getFormat } from "./formats"

/**
 * Turns a parsed marketing goal into the exact input the EXISTING pipeline
 * already takes.
 *
 * This is an adapter and nothing else. It creates no assets, calls no agent,
 * and reimplements no part of Brand or Flyer. Its whole job is to assemble a
 * NormalizedIntake — the same object app/api/quick-prompt/route.ts hand-builds
 * — so continuePipelineFromIntake can run unchanged.
 *
 * Context precedence matches Quick Prompt's, for the same reasons documented
 * there and in profile-defaults.ts: what this request said wins, then the
 * client's own typed profile, then anything AI-inferred, then a literal
 * fallback.
 */

/**
 * Thrown when the goal implies no offer. Deliberately fatal rather than
 * papered over: the alternative is inventing a discount, and an invented
 * "20% off" becomes a real obligation the moment a flyer carrying it reaches
 * a customer. Better to ask.
 */
export class OfferRequiredError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "OfferRequiredError"
  }
}

/**
 * suggested_channels -> what the pipeline can actually act on.
 *
 * Only `flyer` names a real FormatId. `instagram`, `text-blast` and
 * `nextdoor` are NOT formats — they are the repurpose stage's automatic
 * outputs (RepurposedFlyerContent), produced for every flyer on a plan that
 * includes extras, so there is nothing to select. `qr` is the wantsQrCode
 * boolean, itself still subject to the plan gate in qrEnabled().
 *
 * Mapping them to formats would invent product behaviour that doesn't exist.
 * The parser also cannot currently emit one-pager / door-hanger / proposal,
 * so those canvases are unreachable from a goal — a known limitation, not an
 * oversight, and a Phase 2 schema change if it ever matters.
 */
const CHANNEL_TO_FORMAT: Partial<Record<GoalChannel, string>> = { flyer: "flyer" }

export function formatIdForChannels(channels: readonly GoalChannel[]): string {
  for (const c of channels) {
    const id = CHANNEL_TO_FORMAT[c]
    if (id) return id
  }
  // Every other channel rides along with a printed piece, so a flyer is the
  // only sensible canvas when none was named.
  return "flyer"
}

export function wantsQrFromChannels(channels: readonly GoalChannel[]): boolean {
  return channels.includes("qr")
}

export async function buildGoalCampaignPlan(opts: {
  goal: MarketingGoal
  /** Always the caller's own session identity — never a client-supplied address. */
  email: string
  /** Supplied at execute time when nothing on file has one. */
  phoneOverride?: string
}): Promise<PendingGoalCampaign> {
  const { goal, email } = opts

  // No offer, no campaign. The parser returns null precisely when the goal
  // doesn't imply one ("I need more customers"), and that is the signal to
  // ask rather than to guess.
  const offer = nonEmpty(goal.primary_offer)
  if (!offer) {
    throw new OfferRequiredError(
      "We need to know what you're offering before we can build this. Add the promotion to your goal — for example \"I want more customers this month, offering $89 furnace tune-ups\".",
    )
  }

  const [profile, savedBrand, client] = await Promise.all([
    getCampaignDefaults(email).catch(() => null),
    getSavedBrandProfile(email).catch(() => null),
    getClient(email).catch(() => null),
  ])

  const category = nonEmpty(client?.businessCategory)
  const businessName =
    nonEmpty(savedBrand?.brandProfile.businessName) ?? nonEmpty(client?.businessName) ?? "Your business"

  // "Other" is the default every client carries whether or not they picked
  // one (see getClient), so it says nothing about the trade.
  const industry = (category === "Other" ? null : category) ?? "local services"

  // Start from the saved brand's contact when there is one — it came from a
  // real submission — then let the typed profile fill any gaps, exactly as
  // Quick Prompt does.
  const baseContact: NormalizedIntake["contact"] = savedBrand?.contact ?? {
    phone: "",
    address: null,
    website: null,
    social: null,
    contactName: null,
  }
  const contact = fillContactGapsFromProfile(
    { ...baseContact, phone: nonEmpty(opts.phoneOverride) ?? baseContact.phone },
    profile,
  )

  const formatId = getFormat(formatIdForChannels(goal.suggested_channels)).id

  const intake: NormalizedIntake = {
    businessName,
    industry,
    yearsInBusiness: parseYearsInBusiness(profile?.yearsInBusiness) ?? null,
    // min(1) — the offer is always a real service they're promoting.
    services: [offer],
    targetAudience: nonEmpty(goal.target_audience) ?? nonEmpty(profile?.targetAudience) ?? "local customers",
    contact,
    brandAssets: {
      logoUrl: null,
      existingColors: savedBrand ? savedBrand.brandProfile.colors.map((c) => c.hex) : null,
      existingFontsNote: savedBrand
        ? `Heading: ${savedBrand.brandProfile.fonts.heading}, Body: ${savedBrand.brandProfile.fonts.body}`
        : null,
    },
    voiceTonePreference: nonEmpty(profile?.voiceTone) ?? "professional",
    fontStylePreference: profile?.preferredStyle ?? "modern",
    photos: [],
    // Never opted into on the client's behalf — it's a real Pro-gated consent
    // choice (see aiPhotosEnabled), and silence is not consent.
    wantsAiPhotos: false,
    wantsQrCode: wantsQrFromChannels(goal.suggested_channels),
    flyerRequests: [
      {
        id: crypto.randomUUID(),
        purpose: offer,
        // The goal and its window are the campaign's framing, and this is the
        // only place they reach the Flyer Agent — otherwise time_period would
        // be parsed and then silently dropped.
        notes: `Campaign goal: ${goal.goal}. Time period: ${goal.time_period}.`,
        formatId,
      },
    ],
    websitePreferences: null,
    existingMaterialsNotes: null,
    batchSize: 1,
  }

  return {
    createdAt: new Date().toISOString(),
    goal,
    intake,
    formatId,
    needsPhone: !nonEmpty(contact.phone),
  }
}
