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

  // Added ON TOP of the intake contract, same as businessCategoryGuess above:
  // the Business Profile wants things a flyer intake never needed, and
  // widening NormalizedIntake would change what every downstream agent gets.
  //
  // THERE IS ROOM FOR EXACTLY TWO MORE FIELDS HERE, AND THIS IS THEM.
  // Anthropic Structured Outputs enforces two separate ceilings, and this
  // schema — which extends the whole of IntakeAgentOutputSchema — sits right
  // against both. Measured, not guessed, by submitting each variant:
  //
  //   baseline                            OK
  //   + businessSummary                   OK
  //   + businessSummary + ctas            OK
  //   + businessSummary + ctas + terminology
  //                                       400 "compiled grammar is too large"
  //
  // A third field fails the whole call, so the scan returns agent_error and
  // the client gets nothing. `terminology` is therefore NOT requested here;
  // BusinessProfile keeps the field (empty) so it can be populated later
  // without a data migration. See the Phase 2 report.
  //
  // Neither field is .nullable(): the OTHER ceiling is 16 union-typed
  // parameters and the baseline already uses all 16, so one `.nullable()`
  // here 400s every call. An empty string/array says "the site didn't say"
  // just as well.
  /** One or two sentences describing the business, in the site's own terms. */
  businessSummary: z.string(),
  /** Calls to action the site actually uses, e.g. "Book a free estimate". */
  ctas: z.array(z.string()),

})

export type ScrapeExtraction = z.infer<typeof ScrapeExtractionSchema>
