import { runJsonAgent } from "../client"
import { FLYER_AGENT_SYSTEM_PROMPT } from "../prompts/flyer"
import { FlyerAgentOutputSchema, type FlyerAgentInput, type FlyerAgentOutput } from "../schemas/flyer"

// Each flyer's full HTML document costs meaningfully more tokens than a
// single flat cap accounts for once more than one flyer is batched, and the
// richer per-flyer design instructions (icons, gradients, decorative panels)
// push individual flyers well past what 8192 covers even at batch size 1.
// Scale with the batch size, capped well under the model's output ceiling —
// streaming (see client.ts) removes the old non-streaming request-time
// limit, so there's room to be generous here.
const TOKENS_PER_FLYER = 16000
const MAX_TOKENS_CAP = 64000

export async function runFlyerAgent(input: FlyerAgentInput): Promise<FlyerAgentOutput> {
  const maxTokens = Math.min(TOKENS_PER_FLYER * Math.max(1, input.flyerRequests.length), MAX_TOKENS_CAP)
  return runJsonAgent({
    systemPrompt: FLYER_AGENT_SYSTEM_PROMPT,
    userInput: input,
    schema: FlyerAgentOutputSchema,
    maxTokens,
  })
}
