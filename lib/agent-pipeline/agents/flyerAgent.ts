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
//
// repurposed.instagramHtml is a second full HTML document per flyer (same
// design-richness expectations as the print one), roughly doubling real
// per-flyer output on top of the smaller caption/blurb/post text fields —
// bumped from the pre-repurposing 16000/64000 accordingly. Bumped again from
// 30000 to 60000 after a real production run legitimately produced more than
// 30000 tokens of valid output (not a runaway loop) and got truncated.
//
// Deliberately NOT retried-with-a-higher-budget on truncation: max_tokens is
// only a ceiling, not something that costs time by itself, so the fix is to
// set this high enough that a legitimate response fits on the FIRST attempt
// — a second from-scratch generation would roughly double wall-clock time
// and risk blowing the pipeline's own timeout (see PIPELINE_TIMEOUT_MS in
// pipeline.ts), which is exactly what happened when this was tried.
const TOKENS_PER_FLYER = 60000
const MAX_TOKENS_CAP = 128000

export async function runFlyerAgent(input: FlyerAgentInput): Promise<FlyerAgentOutput> {
  const maxTokens = Math.min(TOKENS_PER_FLYER * Math.max(1, input.flyerRequests.length), MAX_TOKENS_CAP)
  return runJsonAgent({
    systemPrompt: FLYER_AGENT_SYSTEM_PROMPT,
    userInput: input,
    schema: FlyerAgentOutputSchema,
    maxTokens,
  })
}
