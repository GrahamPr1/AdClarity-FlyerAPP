import { runJsonAgent } from "../client"
import { INTAKE_AGENT_SYSTEM_PROMPT } from "../prompts/intake"
import { IntakeAgentOutputSchema, type IntakeAgentOutput } from "../schemas/intake"

export async function runIntakeAgent(rawFormSubmission: unknown, email: string): Promise<IntakeAgentOutput> {
  return runJsonAgent({
    systemPrompt: INTAKE_AGENT_SYSTEM_PROMPT,
    userInput: rawFormSubmission,
    schema: IntakeAgentOutputSchema,
    logContext: { email, agentType: "intake" },
  })
}
