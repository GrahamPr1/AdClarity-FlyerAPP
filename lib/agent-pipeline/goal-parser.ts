import { getCampaignDefaults, getClient } from "@/lib/store"
import { nonEmpty } from "./profile-defaults"
import { runGoalAgent, type GoalBusinessContext } from "./agents/goalAgent"
import type { MarketingGoal } from "./schemas/goal"

/**
 * Turns a plain-language business goal into a structured marketing objective.
 *
 * Phase 2 of the goal-based marketing work, and deliberately the whole of it:
 * text in, structured JSON out. This creates nothing, writes nothing, sends
 * nothing and touches no existing flow. It does not call the Intake, Brand or
 * Flyer agents, and nothing calls it except its own test route.
 *
 * Store access is READ-ONLY and lives here rather than in agents/goalAgent.ts,
 * matching how the rest of the pipeline is layered: agents are thin
 * prompt+schema wrappers, callers assemble their input.
 */

/** Free text a client typed; capped before it reaches a model prompt. */
const MAX_GOAL_LENGTH = 500

export class GoalTooVagueError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "GoalTooVagueError"
  }
}

/**
 * Reads what OneFlyer already knows about this business. Every field is
 * optional and a client with nothing saved yields a context of all-nulls,
 * which the agent is explicitly told is normal.
 *
 * Deliberately narrow. CampaignDefaults also holds contact details, brand
 * colours, socials and a street address; none of that helps decide an
 * objective, and the less that reaches a prompt the less there is to leak
 * into output that a client eventually sees.
 *
 * `industry` comes from ClientRecord.businessCategory, not CampaignDefaults —
 * CampaignDefaults has no industry field (the guided form's `industry` is
 * per-submission and never persisted). businessCategory is the closest thing
 * that IS stored per client, and always has a real value ("Other" at worst).
 */
async function loadBusinessContext(email: string): Promise<GoalBusinessContext | null> {
  const [defaults, client] = await Promise.all([
    getCampaignDefaults(email).catch(() => null),
    getClient(email).catch(() => null),
  ])

  // "Other" is the DEFAULT businessCategory every client gets whether or not
  // they ever picked one (see getClient in lib/store.ts), so it carries no
  // information. Treated as absent — otherwise every client would look like
  // they had context on file and the agent's "no context" branch would be
  // unreachable.
  const category = nonEmpty(client?.businessCategory)

  const context: GoalBusinessContext = {
    businessName: nonEmpty(client?.businessName),
    industry: category === "Other" ? null : category,
    targetAudience: nonEmpty(defaults?.targetAudience),
    serviceArea: nonEmpty(defaults?.serviceArea),
    pastOffers: defaults?.pastOffers ?? [],
  }

  // Nothing useful on file — send null rather than an object of nulls, so the
  // prompt's "context is absent" branch is unambiguous.
  const hasAnything =
    context.businessName !== null ||
    context.industry !== null ||
    context.targetAudience !== null ||
    context.serviceArea !== null ||
    context.pastOffers.length > 0
  return hasAnything ? context : null
}

export async function parseMarketingGoal(opts: {
  /** The owner's plain-language goal. */
  goal: string
  /**
   * Whose business context to read, and who the model call is billed to in
   * the generation log. Always the caller's OWN session identity — there is
   * deliberately no path for one client to pass another's address.
   */
  email: string
}): Promise<{ parsed: MarketingGoal; usedBusinessContext: boolean }> {
  const goal = opts.goal.trim().slice(0, MAX_GOAL_LENGTH)
  if (!goal) {
    throw new GoalTooVagueError("Tell us what you want to achieve — even one sentence is enough.")
  }

  const business = await loadBusinessContext(opts.email)
  const parsed = await runGoalAgent({ goal, business }, opts.email)

  return { parsed, usedBusinessContext: business !== null }
}
