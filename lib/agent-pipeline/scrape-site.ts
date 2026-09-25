import { crawlWebsite, type CrawlProgress } from "./scraper"
import { emptyBusinessProfile, type BusinessProfile } from "@/lib/business-profile"
import { normalizeWebsiteUrl } from "@/lib/url-normalize"
import { buildPageReports } from "./page-report"
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
  | {
      scraped: false
      reason: ScrapeFailureReason
      message: string
      /**
       * What the scan DID establish, when it established anything.
       *
       * needs_clarification does not mean the site was unreadable — it most
       * often means one required-and-blocking intake field was absent. The
       * commonest by far is contact.phone, which NormalizedIntake declares
       * as z.string().min(1); a business that simply does not publish a phone
       * number on its website cannot satisfy that, however well the scan went.
       *
       * Discarding everything else in that case is the wrong trade. Scanning
       * oneflyer.org returns the business name, industry, a full service list,
       * a description and nine CTAs, and then threw all of it away because
       * there was no phone number on the page.
       *
       * Callers needing a valid NormalizedIntake (the guided flow, Quick
       * Prompt) still see scraped:false and fall back exactly as before —
       * this is additive. Only the business scanner reads it.
       */
      partialProfile?: BusinessProfile
      /** Which required fields were missing, e.g. ["contact.phone"]. */
      missingFields?: string[]
    }

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
    // Salvage whatever the agent did establish. partialData is a JSON string
    // of the fields it could fill; BusinessProfile's contact fields are all
    // nullable, so a missing phone costs us the phone and nothing else.
    let partialProfile: BusinessProfile | undefined
    try {
      const partial = extraction.partialData ? JSON.parse(extraction.partialData) : null
      if (partial && typeof partial === "object") {
        const normalizedUrlResult = normalizeWebsiteUrl(url)
        partialProfile = {
          ...emptyBusinessProfile(),
          source: "website_scan",
          businessName: typeof partial.businessName === "string" ? partial.businessName || null : null,
          website: normalizedUrlResult.ok ? normalizedUrlResult.url : null,
          description: extraction.businessSummary || null,
          industry: typeof partial.industry === "string" ? partial.industry || null : null,
          services: Array.isArray(partial.services) ? partial.services.filter((x: unknown) => typeof x === "string") : [],
          contact: {
            phone: partial.contact?.phone || provided.phone?.trim() || null,
            email: null,
            address: partial.contact?.address || null,
            social: Array.isArray(partial.contact?.social) ? partial.contact.social : [],
          },
          brand: {
            logoUrl: crawlResult.logoUrl,
            colors: crawlResult.colorRoles,
            tone: typeof partial.voiceTonePreference === "string" ? partial.voiceTonePreference || null : null,
          },
          terminology: [],
          ctas: extraction.ctas ?? [],
          scannedPages: crawlResult.pages.map((pg) => pg.url),
        }
        partialProfile.pageReports = buildPageReports(crawlResult.pages, partialProfile)
      }
    } catch {
      // partialData wasn't parseable JSON. Nothing salvageable; fall through
      // to the plain failure, which is the pre-existing behaviour.
    }

    return {
      scraped: false,
      reason: "needs_clarification",
      message: SCRAPE_FAILURE_MESSAGES.needs_clarification,
      partialProfile,
      missingFields: extraction.missingFields ?? undefined,
    }
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
  // Attributed AFTER the profile exists, since it matches extracted values
  // against the page text they came from.
  profile.pageReports = buildPageReports(crawlResult.pages, profile)

  return {
    scraped: true,
    normalizedIntake,
    businessCategoryGuess: extraction.businessCategoryGuess,
    profile,
    scannedPages: crawlResult.pages.map((pg) => pg.url),
    logoReason: crawlResult.logoReason,
  }
}
