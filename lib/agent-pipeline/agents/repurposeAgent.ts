import { runJsonAgent } from "../client"
import { REPURPOSE_AGENT_SYSTEM_PROMPT } from "../prompts/repurpose"
import { RepurposedContentSchema, type RepurposedContent, type FlyerSpecification } from "../schemas/flyer"
import type { BrandProfile } from "../schemas/brand"
import type { NormalizedIntake } from "../schemas/intake"

/**
 * Reformats an ALREADY-GENERATED flyer for Instagram / text / Nextdoor.
 *
 * Split out of the Flyer Agent because doing both in one call made that call
 * emit two complete HTML documents plus three pieces of copy, which blew the
 * pipeline's 285s budget on paid plans — the flyer itself then never reached
 * the client at all (the whole generation was marked Failed). Now the flyer
 * ships first and this runs after it, so a slow or failed repurpose can only
 * cost the extra channels, never the flyer.
 *
 * Takes the generated flyer's own copy so the offer is copied rather than
 * re-derived — see the consistency rules in the prompt.
 */
export async function runRepurposeAgent(
  input: {
    brandProfile: BrandProfile
    contact: NormalizedIntake["contact"]
    flyer: Pick<
      FlyerSpecification,
      "purpose" | "headline" | "subheadline" | "offer" | "cta" | "disclaimer" | "paletteUsed" | "fontsUsed"
    >
  },
  email: string,
): Promise<RepurposedContent> {
  return runJsonAgent({
    systemPrompt: REPURPOSE_AGENT_SYSTEM_PROMPT,
    userInput: input,
    schema: RepurposedContentSchema,
    // Logged under the same "flyer" stage as the generation it belongs to:
    // it's part of producing one campaign's assets, and splitting it into its
    // own cost line would make the admin per-flyer cost figures look like the
    // price had doubled when nothing about the work changed.
    logContext: { email, agentType: "flyer" },
  })
}
