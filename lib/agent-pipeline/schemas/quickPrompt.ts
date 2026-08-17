import { z } from "zod"

// Lightweight replacement for the full Intake Agent's structured Q&A on the
// Quick Prompt path — extracts only what a single free-text prompt can
// realistically contain, rather than the guided flow's full business/brand
// intake. See lib/agent-pipeline/agents/quickPromptAgent.ts.
export const QuickPromptParseSchema = z.object({
  // Content-safety gate, baked into this agent's own instructions rather
  // than a separate moderation call — same pattern this codebase already
  // uses for Brand Agent's prohibitedClaims and Flyer Agent's "no
  // fabricated awards" rules (prompt-embedded, not a distinct API call).
  // The free-text prompt is treated as DATA to extract from, never as
  // instructions to this agent itself.
  blocked: z.boolean(),
  blockedReason: z.string().nullable(),
  industry: z.string(),
  purpose: z.string(),
  targetAudience: z.string(),
  styleCues: z.array(z.string()),
  /** A business name only if one was actually mentioned in the prompt — never invented. */
  businessNameGuess: z.string().nullable(),
  /**
   * Null when confident. A single short question when the prompt was too
   * vague to extract a usable industry/purpose (e.g. "make me a flyer").
   * The route (see app/api/quick-prompt/route.ts) only ever surfaces this
   * on the FIRST attempt — after that it proceeds with best-effort data
   * regardless, per the spec's "ask one follow-up max, then generate your
   * best interpretation rather than blocking".
   */
  clarifyingQuestion: z.string().nullable(),
})

export type QuickPromptParse = z.infer<typeof QuickPromptParseSchema>
