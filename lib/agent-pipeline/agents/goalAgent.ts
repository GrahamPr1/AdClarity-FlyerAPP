import { runJsonAgent } from "../client"
import { GOAL_AGENT_SYSTEM_PROMPT } from "../prompts/goal"
import { MarketingGoalSchema, type MarketingGoal } from "../schemas/goal"

/**
 * Business context handed to the Goal Parser. A flattened, read-only subset
 * of what OneFlyer already knows — assembled by lib/agent-pipeline/goal-parser.ts,
 * which owns the store reads. Kept deliberately narrow: this agent has no
 * business seeing contact details, brand colours or anything that could end
 * up printed.
 */
export interface GoalBusinessContext {
  businessName: string | null
  industry: string | null
  targetAudience: string | null
  serviceArea: string | null
  pastOffers: string[]
}

/**
 * Thin wrapper, same shape as every other agent here (see agents/intakeAgent.ts):
 * prompt + schema + logContext, no store access, no orchestration.
 *
 * maxTokens is 1024 rather than the 4096 default — the output is five short
 * fields and nothing here can legitimately need more. It's a ceiling, not a
 * reservation, so this costs nothing; it just fails loudly instead of
 * quietly burning tokens if something ever goes wrong upstream.
 */
export async function runGoalAgent(
  input: { goal: string; business: GoalBusinessContext | null },
  email: string,
): Promise<MarketingGoal> {
  return runJsonAgent({
    systemPrompt: GOAL_AGENT_SYSTEM_PROMPT,
    userInput: input,
    schema: MarketingGoalSchema,
    maxTokens: 1024,
    logContext: { email, agentType: "goal" },
  })
}
