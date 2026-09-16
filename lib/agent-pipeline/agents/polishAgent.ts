import { runJsonAgent } from "../client"
import { POLISH_AGENT_SYSTEM_PROMPT } from "../prompts/polish"
import { PolishAgentOutputSchema, type PolishAgentInput, type PolishAgentOutput } from "../schemas/polish"

/**
 * Small by design, but 512 was NOT enough: the pilot truncated 3/3 at that cap.
 * Structured outputs spend tokens on the response scaffold before any prose, so
 * the floor is well above the visible text. 2048 still sits far under the Flyer
 * Agent's per-flyer budget, which has to carry a whole HTML document.
 */
const MAX_TOKENS = 2048

export async function runPolishAgent(input: PolishAgentInput, email: string, flyerId: string | null): Promise<PolishAgentOutput> {
  return runJsonAgent({
    systemPrompt: POLISH_AGENT_SYSTEM_PROMPT,
    userInput: input,
    schema: PolishAgentOutputSchema,
    maxTokens: MAX_TOKENS,
    logContext: { email, agentType: "polish", flyerId },
  })
}
