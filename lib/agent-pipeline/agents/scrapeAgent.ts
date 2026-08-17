import { runJsonAgent } from "../client"
import { SCRAPE_AGENT_SYSTEM_PROMPT } from "../prompts/scrape"
import { ScrapeExtractionSchema, type ScrapeExtraction } from "../schemas/scrape"

export async function runScrapeAgent(
  input: { pages: { url: string; text: string }[]; socialLinks: string[] },
  email: string,
): Promise<ScrapeExtraction> {
  return runJsonAgent({
    systemPrompt: SCRAPE_AGENT_SYSTEM_PROMPT,
    userInput: input,
    schema: ScrapeExtractionSchema,
    logContext: { email, agentType: "scrape" },
  })
}
