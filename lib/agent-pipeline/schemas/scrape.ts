import { z } from "zod"
import { IntakeAgentOutputSchema } from "./intake"
import { BUSINESS_CATEGORIES } from "@/lib/types"

// Reuses IntakeAgentOutputSchema directly (not a parallel schema) — the
// whole point, per the spec, is that this agent's output "matches what
// Intake Agent currently produces, so no changes are needed to Brand/Flyer
// Agents". businessCategoryGuess is an addition ON TOP of that core
// contract, not part of it — businessCategory is deliberately never
// touched by the Intake Agent either (it's set directly on the
// ClientRecord, see /api/intake's own comment on this), so it can't live
// inside the reused schema; it's a genuinely useful bonus for pre-filling
// onboarding's Category step, surfaced separately.
export const ScrapeExtractionSchema = IntakeAgentOutputSchema.extend({
  businessCategoryGuess: z.enum(BUSINESS_CATEGORIES).nullable(),
})

export type ScrapeExtraction = z.infer<typeof ScrapeExtractionSchema>
