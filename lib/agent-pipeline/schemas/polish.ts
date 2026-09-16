import { z } from "zod"

/**
 * The ONLY thing the model produces in template mode: two short lines of
 * plain text. No HTML, no layout, no colour.
 *
 * That is the whole cost argument. The Flyer Agent averages ~8,070 output
 * tokens because it writes a complete HTML document; this writes roughly a
 * tweet. It is also why truncation stops being a risk — there is nothing long
 * enough to cut off.
 */
export const PolishAgentOutputSchema = z.object({
  /** The dominant line on the piece. */
  headline: z.string(),
  /** One supporting line under it. */
  supporting: z.string(),
})

export type PolishAgentOutput = z.infer<typeof PolishAgentOutputSchema>

export interface PolishAgentInput {
  businessName: string
  industry: string
  /** What the client actually typed about this promotion. */
  promotion: string
  targetAudience: string
  voiceTone: string
  /** Hard limits the template can physically fit. */
  budgets: { headline: number; supporting: number }
}
