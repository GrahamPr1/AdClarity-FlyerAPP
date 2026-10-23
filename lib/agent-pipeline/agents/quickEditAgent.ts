import { runJsonAgent } from "../client"
import { QUICK_EDIT_AGENT_SYSTEM_PROMPT } from "../prompts/quick-edit"
import { QuickEditAgentOutputSchema, type QuickEditAgentInput, type QuickEditAgentOutput } from "../schemas/quick-edit"

/**
 * Same ceiling reasoning as the polish agent (polishAgent.ts): a short
 * structured answer, but structured outputs spend tokens on scaffolding, and
 * 2048 was measured to clip there. A ceiling, not a reservation.
 */
const MAX_TOKENS = 8192

/** Same model as every other agent (ADCLARITY_MODEL in client.ts) — never a weaker one. */
export async function runQuickEditAgent(input: QuickEditAgentInput, email: string, flyerId: string): Promise<QuickEditAgentOutput> {
  return runJsonAgent({
    systemPrompt: QUICK_EDIT_AGENT_SYSTEM_PROMPT,
    userInput: input,
    schema: QuickEditAgentOutputSchema,
    maxTokens: MAX_TOKENS,
    logContext: { email, agentType: "quick_edit", flyerId },
  })
}
