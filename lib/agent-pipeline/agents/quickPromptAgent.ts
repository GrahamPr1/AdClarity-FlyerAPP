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
    // Explicit rather than implicit: the output is a handful of short
    // fields (measured max 194 tokens), so the default is already generous —
    // but "we decided this" and "we never looked" should not be
    // indistinguishable in the source. See tests/agent-token-budgets.test.ts.
    maxTokens: 4096,
    schema: QuickPromptParseSchema,
    logContext: { email, agentType: "quick_prompt" },
  })
}
