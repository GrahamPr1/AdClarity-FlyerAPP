import { runJsonAgent } from "../client"
import { QUICK_PROMPT_AGENT_SYSTEM_PROMPT } from "../prompts/quickPrompt"
import { QuickPromptParseSchema, type QuickPromptParse } from "../schemas/quickPrompt"
import type { BusinessCategory, QuickPromptFormat } from "@/lib/types"

export async function runQuickPromptAgent(
  input: { prompt: string; format: QuickPromptFormat; clientBusinessCategory: BusinessCategory },
  email: string,
): Promise<QuickPromptParse> {
  return runJsonAgent({
    systemPrompt: QUICK_PROMPT_AGENT_SYSTEM_PROMPT,
    userInput: input,
    schema: QuickPromptParseSchema,
    logContext: { email, agentType: "quick_prompt" },
  })
}
