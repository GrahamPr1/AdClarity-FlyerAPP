import { z } from "zod"

/**
 * A quick edit to a template flyer, as the model proposes it. Code applies it
 * (lib/agent-pipeline/quick-edit.ts) and then checks the result
 * (edit-invariants.ts) — the model never writes HTML here, so it cannot move,
 * restyle or drop anything the client didn't ask about.
 */
export const QUICK_EDIT_LOOKS = ["unchanged", "modern", "classic", "editorial", "bold", "friendly"] as const
export const QUICK_EDIT_EMPHASIS = ["unchanged", "none", "headline", "supporting"] as const

export const QuickEditAgentOutputSchema = z.object({
  /** New text for each field the instruction changes; null leaves it exactly as it is. */
  fields: z.object({
    headline: z.string().nullable(),
    supporting: z.string().nullable(),
    phone: z.string().nullable(),
    address: z.string().nullable(),
  }),
  style: z.object({
    /** Typeface pairing. "editorial" is the premium one. */
    look: z.enum(QUICK_EDIT_LOOKS),
    /** Which line gets a highlight in the brand's accent colour. */
    emphasis: z.enum(QUICK_EDIT_EMPHASIS),
  }),
  /** Set when part of the request can't be done on this layout, e.g. "add a photo". Shown to the client. */
  cannotApply: z.string().nullable(),
  /** One plain sentence describing what changed, for the client. */
  summary: z.string(),
})

export type QuickEditAgentOutput = z.infer<typeof QuickEditAgentOutputSchema>
export type QuickEditLook = (typeof QUICK_EDIT_LOOKS)[number]
export type QuickEditEmphasis = (typeof QUICK_EDIT_EMPHASIS)[number]

export interface QuickEditAgentInput {
  business: { name: string; trade: string; audience: string | null; voiceTone: string | null }
  /** The flyer's current text, field by field, with each field's hard character limit. */
  current: { field: string; value: string; hardLimit: number }[]
  hardLimits: Record<string, number>
  currentStyle: { look: QuickEditLook; emphasis: QuickEditEmphasis }
  instruction: string
  /** Set on the one retry: why the previous answer was refused (e.g. a field over its limit). */
  previousAttemptRejected?: string | null
}
