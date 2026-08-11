import { runJsonAgent } from "../client"
import { BRAND_AGENT_SYSTEM_PROMPT } from "../prompts/brand"
import { BrandProfileSchema, type BrandProfile } from "../schemas/brand"
import type { NormalizedIntake } from "../schemas/intake"

export async function runBrandAgent(intake: NormalizedIntake): Promise<BrandProfile> {
  return runJsonAgent({
    systemPrompt: BRAND_AGENT_SYSTEM_PROMPT,
    userInput: intake,
    schema: BrandProfileSchema,
  })
}
