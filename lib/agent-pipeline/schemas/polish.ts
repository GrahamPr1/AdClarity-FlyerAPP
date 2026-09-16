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
  /**
   * The same limits restated as a sentence the model reads inline.
   *
   * `budgets` alone was being treated as metadata: compliance held at the
   * roomy banner-hero budget (5% overshoot) and collapsed at the tighter
   * split-vertical one (20%), which is the signature of a constraint being
   * skimmed rather than applied. Stating it as an instruction in the input,
   * next to the text being written, is the cheap fix to try before changing
   * any geometry.
   */
  hardLimits: string
}
