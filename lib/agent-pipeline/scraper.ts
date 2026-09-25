import * as cheerio from "cheerio"
import robotsParser from "robots-parser"
import { extractLogo, extractColorRoles, rolesToFlatColors } from "./brand-extract"
import type { BrandColorRoles } from "@/lib/types"

// Pure-code crawling — no AI here. Fetches the homepage plus same-domain
// About/Services/Contact-ish pages (cheerio, not a headless browser: a real
// browser would blow the time budget below almost immediately just on
// launch+navigate per page, and this only needs static HTML — JS-rendered
// content on a page's initial load won't be seen, a real, honest
// limitation of this approach). The Claude extraction step that turns this
// into structured intake data lives in agents/scrapeAgent.ts.

const USER_AGENT = "OneFlyerBot/1.0 (+https://oneflyer.org; onboarding auto-fill)"
const MAX_PAGES = 6
const MAX_DEPTH = 2
const PER_PAGE_TIMEOUT_MS = 10_000
// Deliberately under the ~20s the onboarding UI tells the client to expect
// for the WHOLE Path A flow — this covers only the crawl; the Claude
// extraction call after it takes real additional time on top, same
// latency reality as every other agent call in this app.
const CRAWL_BUDGET_MS = 14_000
// Pricing and plans added: an offer's real numbers live there, and the old
// pattern skipped those pages entirely, so a scan of a business whose prices
// are public still came back without them.
const KEYWORD_PATTERNS = /\b(about|service|product|contact|pricing|plans|rates|menu|work|gallery)/i

interface CrawledPage {
  url: string
  text: string
  /** The page's own <title>, captured during the same parse that produced
   *  `text`. Costs nothing extra — the document is already in memory — and
   *  it is what makes a list of crawled URLs legible to a human. */
  title: string
}

export interface CrawlResult {
  pages: CrawledPage[]
  logoUrl: string | null
  /** Why that logo won, for the Control Center. Null when none was found. */
  logoReason: string | null
  /** Flat list — the shape NormalizedIntake.brandAssets.existingColors wants. */
  colors: string[]
  /** The same colours by role. Roles with no evidence stay null. */
  colorRoles: BrandColorRoles | null
  socialLinks: string[]
}

export type CrawlFailureReason = "invalid_url" | "unreachable" | "blocked_by_robots" | "no_usable_content"

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { signal: controller.signal, headers: { "User-Agent": USER_AGENT } })
  } finally {
    clearTimeout(timer)
  }
}

async function getRobots(origin: string) {
  try {
    const res = await fetchWithTimeout(`${origin}/robots.txt`, 5000)
    if (!res.ok) return null // no robots.txt reachable -> treat as allow-all
    return robotsParser(`${origin}/robots.txt`, await res.text())
  } catch {
    return null
  }
}

/**
 * Pulls the page's readable content.
 *
 * Deliberately reaches beyond <body>. A small business's site is frequently
 * one page whose visible content is a logo and a hero photo, with the actual
 * facts — trade, city, phone — living in the <title>, the meta description and
 * image alt text. Reading only body text returned almost nothing for those
 * sites and the crawl was rejected as "no usable content", which failed
 * precisely the customers this feature is meant to serve.
 */
function extractText($: cheerio.CheerioAPI): string {
  $("script, style, noscript, svg").remove()

  const meta = (selector: string) => $(selector).attr("content")?.trim() ?? ""
  const head = [
    $("title").text().trim(),
    meta('meta[name="description"]'),
    meta('meta[property="og:site_name"]'),
    meta('meta[property="og:title"]'),
    meta('meta[property="og:description"]'),
  ]

  // Cheerio concatenates adjacent block elements with no separator, so an <h1>
  // followed by a <p> arrives as "Miller Heating & AirCall (555) 123-4567" —
  // a mangled token the extraction model then has to guess at. Separate them.
  $("body").find("br, p, div, li, td, th, h1, h2, h3, h4, h5, h6, section, article, header, footer, tr, address").after(" ")
  const body = $("body").text()

  // Alt text last: useful on image-only pages, but noisy ("", "logo", "image")
  // often enough that it shouldn't crowd out real copy.
  const alts: string[] = []
  $("img[alt]").each((_, el) => {
    const alt = $(el).attr("alt")?.trim()
    if (alt && alt.length > 2 && !alts.includes(alt)) alts.push(alt)
  })

  // Dedupe: og:title usually repeats <title>, and the h1 usually repeats both.
  const seen = new Set<string>()
  const parts = [...head, body, ...alts.slice(0, 12)]
    .map((s) => s.replace(/\s+/g, " ").trim())
    .filter((s) => s && !seen.has(s) && (seen.add(s), true))

  return parts.join(" ").replace(/\s+/g, " ").trim().slice(0, 8000)
}

function extractSameDomainLinks($: cheerio.CheerioAPI, pageUrl: string, origin: string): string[] {
  const links = new Set<string>()
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href")
    if (!href) return
    try {
      const resolved = new URL(href, pageUrl)
      resolved.hash = ""
      if (resolved.origin !== origin) return
      const matchesKeyword = KEYWORD_PATTERNS.test(resolved.pathname) || KEYWORD_PATTERNS.test($(el).text())
      if (matchesKeyword) links.add(resolved.toString())
    } catch {
      // ignore unparseable hrefs (mailto:, tel:, javascript:, etc.)
    }
  })
  return Array.from(links)
}

// extractLogoUrl / extractColors used to live here. They are now
// extractLogo / extractColorRoles in ./brand-extract.ts — moved so they can
// be unit-tested without a network, and rewritten because the old versions
// took the first "logo"-ish image (often a partner badge) and produced
// colours with no roles. Deleted rather than left alongside: two extractors
// disagreeing about a brand is worse than one that can be corrected.

const SOCIAL_DOMAINS = ["facebook.com", "instagram.com", "twitter.com", "x.com", "tiktok.com", "linkedin.com", "youtube.com"]

function extractSocialLinks($: cheerio.CheerioAPI): string[] {
  const links = new Set<string>()
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href")
    if (href && SOCIAL_DOMAINS.some((d) => href.includes(d))) links.add(href)
  })
  return Array.from(links)
}

/** Real progress, emitted as each operation actually completes. Used by the
 *  AI Control Center — nothing here is emitted speculatively. */
export type CrawlProgress =
  | { step: "connected"; url: string }
  | { step: "page_read"; url: string; total: number }
  | { step: "logo_found"; url: string | null }
  | { step: "colors_found"; count: number }

export async function crawlWebsite(
  rawUrl: string,
  onProgress?: (p: CrawlProgress) => void,
): Promise<CrawlResult | { error: CrawlFailureReason }> {
  // PERMISSIVE on purpose. The strict policy — rejecting free text, email
  // addresses, non-http schemes and private/loopback hosts — lives in
  // lib/url-normalize.ts and is applied by the ROUTES, which is where
  // untrusted input actually enters. Putting it here as well looked like
  // defence in depth but was really a layering mistake: it made an internal
  // utility refuse addresses its trusted callers legitimately use (the test
  // harness serves fixtures from 127.0.0.1), while adding no protection the
  // boundary check doesn't already provide.
  let startUrl: URL
  try {
    startUrl = new URL(rawUrl.match(/^https?:\/\//i) ? rawUrl : `https://${rawUrl}`)
  } catch {
    return { error: "invalid_url" }
  }
  const origin = startUrl.origin

  const robots = await getRobots(origin)
  if (robots?.isAllowed(startUrl.toString(), USER_AGENT) === false) {
    return { error: "blocked_by_robots" }
  }

  const deadline = Date.now() + CRAWL_BUDGET_MS
  const visited = new Set<string>()
  const queue: { url: string; depth: number }[] = [{ url: startUrl.toString(), depth: 0 }]
  const pages: CrawledPage[] = []
  let logoUrl: string | null = null
  let logoReason: string | null = null
  let colors: string[] = []
  let colorRoles: BrandColorRoles | null = null
  let socialLinks: string[] = []
  // Distinguishes "the homepage itself couldn't be fetched at all" (DNS
  // failure, connection refused, timeout) from "pages loaded fine but had
  // too little real content" — both end in pages.length === 0 below, but
  // they're different failures worth reporting accurately (see
  // CrawlFailureReason) rather than collapsing into one generic message.
  let homepageUnreachable = false

  while (queue.length > 0 && pages.length < MAX_PAGES && Date.now() < deadline) {
    const next = queue.shift()!
    if (visited.has(next.url)) continue
    visited.add(next.url)

    if (robots?.isAllowed(next.url, USER_AGENT) === false) continue

    let res: Response
    try {
      res = await fetchWithTimeout(next.url, Math.min(PER_PAGE_TIMEOUT_MS, Math.max(0, deadline - Date.now())))
    } catch {
      if (next.url === startUrl.toString()) homepageUnreachable = true
      continue // one page failing (timeout, DNS, etc.) doesn't fail the whole crawl
    }
    if (!res.ok) {
      if (next.url === startUrl.toString()) homepageUnreachable = true
      continue
    }

    const contentType = res.headers.get("content-type") ?? ""
    if (!contentType.includes("text/html")) continue

    const html = await res.text()
    const $ = cheerio.load(html)

    // BRAND EXTRACTION RUNS FIRST, BEFORE extractText.
    //
    // extractText() strips <script>, <style>, <noscript> and <svg> from the
    // DOM in place, so anything reading those tags afterwards sees a document
    // they have already been deleted from. Colour detection reads <style>
    // blocks, which means the previous ordering handed it a page with no
    // stylesheet at all and it could only ever recover a <meta theme-color>.
    // That is a long-standing bug — it predates this refactor — and it is the
    // most likely explanation for colour detection historically succeeding on
    // roughly one site in five. Order matters here; do not move this below.
    if (next.depth === 0) {
      const logo = extractLogo($, next.url)
      logoUrl = logo?.url ?? null
      logoReason = logo?.why ?? null
      colorRoles = extractColorRoles($)
      // Flat list stays the ranked roles, so the existing merge contract and
      // everything downstream of it keeps working unchanged.
      colors = rolesToFlatColors(colorRoles)
      socialLinks = extractSocialLinks($)
    }

    const text = extractText($)
    // The homepage is kept whenever it loaded at all, however terse: for a
    // one-page site it IS the business, and a name plus a phone number is
    // already enough to prefill onboarding. The length floor still applies to
    // sub-pages, where a near-empty page is noise rather than the whole site.
    const isHomepage = next.url === startUrl.toString()
    const title = $("title").first().text().trim().slice(0, 160)
    if (isHomepage ? text.length > 0 : text.length > 40) pages.push({ url: next.url, text, title })

    if (isHomepage) onProgress?.({ step: "connected", url: next.url })
    onProgress?.({ step: "page_read", url: next.url, total: pages.length })

    // Emitted here rather than inside the block above so the "connected" and
    // "page read" events still come first — the Control Center reads bottom-up
    // in the order operations complete.
    if (next.depth === 0) {
      onProgress?.({ step: "logo_found", url: logoUrl })
      onProgress?.({ step: "colors_found", count: colors.length })
    }

    if (next.depth < MAX_DEPTH) {
      for (const link of extractSameDomainLinks($, next.url, origin)) {
        if (!visited.has(link)) queue.push({ url: link, depth: next.depth + 1 })
      }
    }
  }

  if (pages.length === 0) {
    return { error: homepageUnreachable ? "unreachable" : "no_usable_content" }
  }

  return { pages, logoUrl, logoReason, colors, colorRoles, socialLinks }
}
