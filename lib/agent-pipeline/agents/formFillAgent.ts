import { runJsonAgentWithDocuments, type DocumentInput } from "../client"
import { FORM_FILL_AGENT_SYSTEM_PROMPT } from "../prompts/formFill"
import { FormFillAgentOutputSchema, type FormFillAgentInput, type FormFillAgentOutput } from "../schemas/formFill"

const MAX_TOKENS = 8192

export async function runFormFillAgent(
  input: FormFillAgentInput,
  targetFormPdf: DocumentInput,
  infoFilePdf: DocumentInput | null,
): Promise<FormFillAgentOutput> {
  const documents = [targetFormPdf, ...(infoFilePdf ? [infoFilePdf] : [])]

  return runJsonAgentWithDocuments({
    systemPrompt: FORM_FILL_AGENT_SYSTEM_PROMPT,
    userInput: input,
    documents,
    schema: FormFillAgentOutputSchema,
    maxTokens: MAX_TOKENS,
  })
}
