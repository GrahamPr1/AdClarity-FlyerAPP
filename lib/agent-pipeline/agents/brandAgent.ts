import { runJsonAgent } from "../client"
import { BRAND_AGENT_SYSTEM_PROMPT } from "../prompts/brand"
import { BrandProfileSchema, type BrandProfile } from "../schemas/brand"
import type { NormalizedIntake } from "../schemas/intake"

export async function runBrandAgent(intake: NormalizedIntake, email: string): Promise<BrandProfile> {
  return runJsonAgent({
    // Explicit rather than the 4096 default: measured max is 3611, i.e. 88%
    // of the ceiling, which is one unusually long positioning statement away
    // from the same silent truncation that was breaking polish and intake.
    maxTokens: 8192,
    systemPrompt: BRAND_AGENT_SYSTEM_PROMPT,
    userInput: intake,
    schema: BrandProfileSchema,
    logContext: { email, agentType: "brand" },
  })
}
