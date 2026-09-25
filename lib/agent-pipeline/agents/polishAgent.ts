import { runJsonAgent } from "../client"
import { POLISH_AGENT_SYSTEM_PROMPT } from "../prompts/polish"
import { PolishAgentOutputSchema, type PolishAgentInput, type PolishAgentOutput } from "../schemas/polish"

/**
 * Small by design, but 512 was NOT enough: the pilot truncated 3/3 at that cap.
 * Structured outputs spend tokens on the response scaffold before any prose, so
 * the floor is well above the visible text.
 *
 * 2048 was not enough either, and it was failing silently. Measured across 120
 * logged polish calls: p50 584, p99 1901, max EXACTLY 2048 — a maximum that
 * lands exactly on the ceiling is the signature of a clipped distribution, not
 * of a well-sized budget. Those clipped calls are the "Flyer X failed:
 * Unterminated string in JSON" errors, and because template mode is the
 * default, polish runs for essentially every flyer — so this one ceiling was
 * the single largest source of generation failures in the app.
 *
 * 8192 is four times the previous cap and roughly four times the observed p99.
 * max_tokens is a ceiling, not a reservation: a normal 584-token response
 * costs exactly the same under it. The only thing it changes is that a
 * legitimately long headline no longer destroys the flyer.
 */
const MAX_TOKENS = 8192

export async function runPolishAgent(input: PolishAgentInput, email: string, flyerId: string | null): Promise<PolishAgentOutput> {
  return runJsonAgent({
    systemPrompt: POLISH_AGENT_SYSTEM_PROMPT,
    userInput: input,
    schema: PolishAgentOutputSchema,
    maxTokens: MAX_TOKENS,
    logContext: { email, agentType: "polish", flyerId },
  })
}
