import { crawlWebsite, type CrawlProgress } from "./scraper"
import { emptyBusinessProfile, type BusinessProfile } from "@/lib/business-profile"
import { normalizeWebsiteUrl } from "@/lib/url-normalize"
import { runScrapeAgent } from "./agents/scrapeAgent"
import { mergeScrapedContact } from "./scrape-merge"
import type { NormalizedIntake } from "./schemas/intake"

/**
 * Crawl a site, extract what it says about the business, merge in anything
 * the client typed.
 *
 * Lifted out of /api/scrape-website so Quick Prompt can personalise from a
 * website too, rather than a second copy of the same three steps drifting
 * out of sync with the first. The guided flow's route is now a thin wrapper
 * around this.
 *
 * Never throws. Every failure — an unreachable host, a robots block, a site
 * too thin to read, the extraction call erroring — comes back as a reason
 * code, because in both callers the correct response is to carry on without
 * the website rather than fail the whole request.
 */

export type ScrapeFailureReason =
  | "invalid_url"
  | "unreachable"
  | "blocked_by_robots"
  | "no_usable_content"
  | "needs_clarification"
  | "agent_error"

export const SCRAPE_FAILURE_MESSAGES: Record<ScrapeFailureReason, string> = {
  invalid_url: "That doesn't look like a valid website address.",
  unreachable: "We couldn't reach that website.",
  blocked_by_robots: "That site doesn't allow automatic reading.",
  no_usable_content: "We couldn't find enough on that site to work with.",
  needs_clarification: "That site didn't have quite enough to go on.",
  agent_error: "Something went wrong while reading your website.",
}

export type ScrapeSiteResult =
  | {
      scraped: true
      normalizedIntake: NormalizedIntake
      businessCategoryGuess: string | null
      /**
       * The same crawl + extraction, shaped as a persistent Business Profile.
       *
       * Returned from HERE rather than from a second scan function so there
       * is exactly one crawl path in the app: the guided flow and the new
       * business scanner run identical code and cannot drift apart or
       * double-charge a client two Claude calls for one website.
       */
      profile: BusinessProfile
      /** Which pages were actually read, for the Control Center. */
      scannedPages: string[]
      /** Why the chosen logo won. Null when none was found. */
      logoReason: string | null
    }
  | { scraped: false; reason: ScrapeFailureReason; message: string }

export async function scrapeSiteForIntake(
  url: string,
  email: string,
  provided: { phone?: string; fullName?: string } = {},
  onProgress?: (p: CrawlProgress) => void,
): Promise<ScrapeSiteResult> {
  const crawlResult = await crawlWebsite(url, onProgress)
  if ("error" in crawlResult) {
    const reason = crawlResult.error as ScrapeFailureReason
    return { scraped: false, reason, message: SCRAPE_FAILURE_MESSAGES[reason] }
  }

  let extraction: Awaited<ReturnType<typeof runScrapeAgent>>
  try {
    extraction = await runScrapeAgent(
      {
        pages: crawlResult.pages,
        socialLinks: crawlResult.socialLinks,
        // Anything the client typed themselves is given to the agent so it
        // never blocks asking for a phone number it couldn't find on the site.
        providedPhone: provided.phone?.trim() ?? "",
        providedContactName: provided.fullName?.trim() ?? "",
      },
      email,
    )
  } catch (err) {
    console.error("[scrape-site] Extraction call failed:", err instanceof Error ? err.message : err)
    return { scraped: false, reason: "agent_error", message: SCRAPE_FAILURE_MESSAGES.agent_error }
  }

  if (extraction.status === "needs_clarification" || !extraction.data) {
    return { scraped: false, reason: "needs_clarification", message: SCRAPE_FAILURE_MESSAGES.needs_clarification }
  }

  // Precedence rules live in one tested place — see mergeScrapedContact.
  const normalizedIntake = mergeScrapedContact(
    extraction.data,
    { logoUrl: crawlResult.logoUrl, colors: crawlResult.colors },
    { phone: provided.phone, fullName: provided.fullName },
  )

  const d = extraction.data
  const normalizedUrlResult = normalizeWebsiteUrl(url)
  const normalizedUrl = normalizedUrlResult.ok ? normalizedUrlResult.url : null
  const profile: BusinessProfile = {
    ...emptyBusinessProfile(),
    source: "website_scan",
    businessName: d.businessName || null,
    website: normalizedUrl,
    description: extraction.businessSummary || null,
    industry: d.industry || null,
    services: d.services ?? [],
    contact: {
      // The merged intake is used, not the raw extraction, so anything the
      // client typed themselves still outranks what the site said.
      phone: normalizedIntake.contact.phone || null,
      email: null,
      address: normalizedIntake.contact.address || null,
      social: normalizedIntake.contact.social ?? [],
    },
    brand: {
      logoUrl: crawlResult.logoUrl,
      colors: crawlResult.colorRoles,
      tone: d.voiceTonePreference || null,
    },
    // terminology stays empty: it does not fit in the extraction schema's
    // remaining budget (see schemas/scrape.ts). Kept on the record so it can
    // be filled later without migrating stored profiles.
    terminology: [],
    ctas: extraction.ctas ?? [],
    scannedPages: crawlResult.pages.map((pg) => pg.url),
  }

  return {
    scraped: true,
    normalizedIntake,
    businessCategoryGuess: extraction.businessCategoryGuess,
    profile,
    scannedPages: crawlResult.pages.map((pg) => pg.url),
    logoReason: crawlResult.logoReason,
  }
}
