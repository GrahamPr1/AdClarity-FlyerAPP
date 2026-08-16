import { runJsonAgent, AgentTruncatedError } from "../client"
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
// 30000 after a real production run legitimately exceeded it (verbose but
// valid output, not a runaway loop) and got truncated.
const TOKENS_PER_FLYER = 40000
const MAX_TOKENS_CAP = 128000

// A truncated response is a real, sometimes-legitimate outcome (unusually
// verbose but valid design output), not a bug to just surface and give up on
// — the error message itself says to retry with a higher budget, so this
// does exactly that, once, before giving up for real. Doubled and re-capped
// rather than incremented, since a truncation means the true requirement is
// unknown and could be well past a small bump.
export async function runFlyerAgent(input: FlyerAgentInput): Promise<FlyerAgentOutput> {
  const baseTokens = Math.min(TOKENS_PER_FLYER * Math.max(1, input.flyerRequests.length), MAX_TOKENS_CAP)
  try {
    return await runJsonAgent({
      systemPrompt: FLYER_AGENT_SYSTEM_PROMPT,
      userInput: input,
      schema: FlyerAgentOutputSchema,
      maxTokens: baseTokens,
    })
  } catch (err) {
    if (!(err instanceof AgentTruncatedError) || baseTokens >= MAX_TOKENS_CAP) throw err
    return runJsonAgent({
      systemPrompt: FLYER_AGENT_SYSTEM_PROMPT,
      userInput: input,
      schema: FlyerAgentOutputSchema,
      maxTokens: Math.min(baseTokens * 2, MAX_TOKENS_CAP),
    })
  }
}
