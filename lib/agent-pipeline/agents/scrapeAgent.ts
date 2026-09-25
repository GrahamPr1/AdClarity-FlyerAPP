import { runJsonAgent } from "../client"
import { SCRAPE_AGENT_SYSTEM_PROMPT } from "../prompts/scrape"
import { ScrapeExtractionSchema, type ScrapeExtraction } from "../schemas/scrape"

/**
 * `providedPhone` / `providedContactName` come from the Path A form the
 * client just filled in, and are passed through so the agent HAS them.
 * Without them it was told phone was a required, blocking field and had no
 * way to satisfy it for the many sites that don't publish a number — so a
 * perfectly good scrape returned needs_clarification and dumped the client
 * into the manual flow, which is exactly what this feature exists to avoid.
 * The route still overrides the final value with the client's own input
 * either way; this just stops the agent from blocking on it.
 */
export async function runScrapeAgent(
  input: {
    pages: { url: string; text: string }[]
    socialLinks: string[]
    providedPhone: string
    providedContactName: string
  },
  email: string,
): Promise<ScrapeExtraction> {
  return runJsonAgent({
    // Explicit, because the 4096 default was clipping this agent too:
    // measured across 10 logged scrape calls, p99 and max were both exactly
    // 4096. It reads up to six crawled pages and emits the whole intake
    // object plus the Phase 2 additions, so 4096 was never realistic — this
    // is why scanning a large site (oneflyer.org) failed with "Response was
    // cut off before completion".
    maxTokens: 16384,
    systemPrompt: SCRAPE_AGENT_SYSTEM_PROMPT,
    userInput: input,
    schema: ScrapeExtractionSchema,
    logContext: { email, agentType: "scrape" },
  })
}
