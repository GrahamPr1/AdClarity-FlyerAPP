import { runJsonAgent } from "../client"
import { COLORING_AGENT_SYSTEM_PROMPT } from "../prompts/coloring"
import { ColoringAgentOutputSchema, type ColoringPageRequest, type ColoringAgentOutput } from "../schemas/coloring"

// Line art is dense SVG path data, and an intricate adult page is a LOT of
// coordinates. 24000 was measured truncating a real "detailed mandala of
// woodland animals" request mid-path — which produces a broken half-drawing,
// not a shorter one, because an unclosed path leaks colour across the sheet.
//
// But 60000 is ALSO wrong, for a different reason: at the ~111 output
// tokens/sec this model sustains, 60000 tokens is roughly nine minutes, and
// both the platform's 300s function ceiling (see maxDuration on the route)
// and the HTTP socket give out long before that. A real "detailed mandala"
// request at that budget died with ETIMEDOUT rather than truncating.
//
// So the ceiling is set to what can actually complete inside the platform
// limit, and the prompt does the real work: it requires <defs>/<use> with
// transforms for repeated and symmetric motifs, which is both how this
// artwork is genuinely constructed and dramatically fewer tokens than
// emitting forty hand-written copies of the same petal.
// Measured: a 48-shape adult mandala completed in 279s against the route's
// 300s ceiling — inside the limit, but only 20s of headroom, and this model's
// output length varies run to run. The prompt's shape budget was tightened to
// 40 to buy real margin; this ceiling stays above what that produces so a
// legitimate page is never truncated mid-path.
const MAX_TOKENS = 28000

export async function runColoringAgent(input: ColoringPageRequest, email: string): Promise<ColoringAgentOutput> {
  return runJsonAgent({
    systemPrompt: COLORING_AGENT_SYSTEM_PROMPT,
    userInput: input,
    schema: ColoringAgentOutputSchema,
    maxTokens: MAX_TOKENS,
    logContext: { email, agentType: "coloring", flyerId: null },
  })
}
