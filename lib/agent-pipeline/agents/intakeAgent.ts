import { runJsonAgent, runJsonAgentWithDocuments, type DocumentInput } from "../client"
import { INTAKE_AGENT_SYSTEM_PROMPT } from "../prompts/intake"
import { IntakeAgentOutputSchema, type IntakeAgentOutput } from "../schemas/intake"

/**
 * `documents` carries a client's saved business-profile PDF, when they have
 * one. Claude reads PDFs natively, so there is no extraction step — the file
 * goes in as a document block exactly as form-fill has always sent it.
 *
 * The no-document call is left on runJsonAgent rather than routed through the
 * document variant with an empty array: that would change the request shape
 * for every client who has no profile, which is most of them.
 */
export async function runIntakeAgent(
  rawFormSubmission: unknown,
  email: string,
  documents: DocumentInput[] = [],
): Promise<IntakeAgentOutput> {
  if (documents.length === 0) {
    return runJsonAgent({
    // Explicit, because the 4096 default was clipping this agent: measured
    // across 51 logged intake calls, p99 AND max were both exactly 4096.
    // NormalizedIntake is a large object and a business with several services
    // and flyer requests fills it. A truncated intake fails the whole
    // submission, which is what the AgentTruncatedError 500s on /api/intake
    // were.
    maxTokens: 16384,
      systemPrompt: INTAKE_AGENT_SYSTEM_PROMPT,
      userInput: rawFormSubmission,
      schema: IntakeAgentOutputSchema,
      logContext: { email, agentType: "intake" },
    })
  }

  return runJsonAgentWithDocuments({
    systemPrompt: INTAKE_AGENT_SYSTEM_PROMPT,
    userInput: rawFormSubmission,
    documents,
    schema: IntakeAgentOutputSchema,
    logContext: { email, agentType: "intake" },
  })
}
