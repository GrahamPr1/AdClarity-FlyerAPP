import { z } from "zod"

/**
 * The only channels OneFlyer actually produces today — see CAMPAIGN_ASSETS in
 * lib/marketing.ts and the repurpose stage in lib/agent-pipeline/pipeline.ts.
 *
 * Declared as a zod enum rather than a prompt instruction on purpose: with
 * Anthropic's structured outputs the schema is compiled into a grammar that
 * constrains which tokens the model may emit, so "email" or "google-ads"
 * cannot come back at all. A prose rule ("only pick from this list") is a
 * request; this is an impossibility. That matters here because a plan naming
 * a channel the product can't deliver is worse than no plan.
 */
export const GOAL_CHANNELS = ["flyer", "instagram", "text-blast", "nextdoor", "qr"] as const
export type GoalChannel = (typeof GOAL_CHANNELS)[number]

/**
 * A plain-language business goal turned into a structured marketing
 * objective. Phase 2 of the goal-based marketing work: this is the ONLY
 * thing it produces — nothing here creates a campaign, an asset, or a flyer.
 *
 * Deliberately five fields and no more. No confidence score, no reasoning
 * trace, no rationale string: each would be a thing later phases start
 * depending on before anyone has decided it should exist, and a model-written
 * "why" reads as justification whether or not it reflects anything real.
 */
export const MarketingGoalSchema = z.object({
  /** The qualified outcome, e.g. "20 qualified leads". */
  goal: z.string(),
  /** e.g. "30 days". Always populated — the agent infers a sensible default when the goal doesn't say. */
  time_period: z.string(),
  /** The promotion this campaign leads with. Null when the goal genuinely doesn't imply one — never a placeholder. */
  primary_offer: z.string().nullable(),
  suggested_channels: z.array(z.enum(GOAL_CHANNELS)),
  /** Who it's aimed at. Null when neither the goal nor the saved profile says. */
  target_audience: z.string().nullable(),
})

export type MarketingGoal = z.infer<typeof MarketingGoalSchema>
