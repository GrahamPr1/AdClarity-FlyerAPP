import * as cheerio from "cheerio"
import robotsParser from "robots-parser"

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
const KEYWORD_PATTERNS = /\b(about|service|product|contact)/i

interface CrawledPage {
  url: string
  text: string
}

export interface CrawlResult {
  pages: CrawledPage[]
  logoUrl: string | null
  colors: string[]
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

function extractLogoUrl($: cheerio.CheerioAPI, pageUrl: string): string | null {
  const candidates = $("img[src]").filter((_, el) => {
    const attrs = [$(el).attr("alt"), $(el).attr("class"), $(el).attr("id"), $(el).attr("src")].join(" ").toLowerCase()
    return attrs.includes("logo")
  })
  const first = candidates.first().attr("src")
  if (first) {
    try {
      return new URL(first, pageUrl).toString()
    } catch {
      /* fall through to favicon */
    }
  }
  const icon = $('link[rel="icon"], link[rel="apple-touch-icon"], link[rel="shortcut icon"]').first().attr("href")
  if (icon) {
    try {
      return new URL(icon, pageUrl).toString()
    } catch {
      return null
    }
  }
  return null
}

const NEUTRAL_HEX = new Set(["#ffffff", "#fff", "#000000", "#000", "#fafafa", "#f5f5f5", "#eeeeee", "#e5e5e5", "#cccccc", "#f9f9f9"])

function isNeutral(hex: string): boolean {
  const h = hex.toLowerCase()
  if (NEUTRAL_HEX.has(h)) return true
  // Crude grayscale check for 6-digit hex: R, G, B all within 10 of each other.
  if (h.length === 7) {
    const r = parseInt(h.slice(1, 3), 16)
    const g = parseInt(h.slice(3, 5), 16)
    const b = parseInt(h.slice(5, 7), 16)
    if (Math.max(r, g, b) - Math.min(r, g, b) < 12) return true
  }
  return false
}

/**
 * Best-effort dominant-color detection — a meta theme-color tag (a real,
 * common, reliable signal many sites provide) plus a frequency count of
 * hex colors appearing in inline <style> blocks and on key elements
 * (header/nav/button/.btn). Does NOT fetch external stylesheets — out of
 * scope for the time budget here, and most sites' brand colors show up in
 * at least one of the places above anyway. Never blocks the flow if this
 * comes back empty (see the "best-effort" note in the calling agent).
 */
function extractColors($: cheerio.CheerioAPI): string[] {
  const counts = new Map<string, number>()
  const bump = (hex: string) => {
    const normalized = hex.toLowerCase()
    if (isNeutral(normalized)) return
    counts.set(normalized, (counts.get(normalized) ?? 0) + 1)
  }

  // A strong, explicit signal when present — weighted heavily so it wins
  // ties — but still passes through the SAME neutral filter as everything
  // else below: a dark-themed site's theme-color is often just its page
  // background (near-black), not a real accent color worth pre-filling as
  // a brand color.
  const themeColor = $('meta[name="theme-color"]').attr("content")
  if (themeColor?.match(/^#[0-9a-f]{3,6}$/i) && !isNeutral(themeColor.toLowerCase())) {
    counts.set(themeColor.toLowerCase(), 999)
  }

  const hexPattern = /#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/g
  $("style").each((_, el) => {
    const matches = $(el).text().match(hexPattern)
    matches?.forEach(bump)
  })
  $("header, nav, button, .btn, a.btn").each((_, el) => {
    const style = $(el).attr("style") ?? ""
    const matches = style.match(hexPattern)
    matches?.forEach(bump)
  })

  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([hex]) => hex)
}

const SOCIAL_DOMAINS = ["facebook.com", "instagram.com", "twitter.com", "x.com", "tiktok.com", "linkedin.com", "youtube.com"]

function extractSocialLinks($: cheerio.CheerioAPI): string[] {
  const links = new Set<string>()
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href")
    if (href && SOCIAL_DOMAINS.some((d) => href.includes(d))) links.add(href)
  })
  return Array.from(links)
}

export async function crawlWebsite(rawUrl: string): Promise<CrawlResult | { error: CrawlFailureReason }> {
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
  let colors: string[] = []
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
    const text = extractText($)
    // The homepage is kept whenever it loaded at all, however terse: for a
    // one-page site it IS the business, and a name plus a phone number is
    // already enough to prefill onboarding. The length floor still applies to
    // sub-pages, where a near-empty page is noise rather than the whole site.
    const isHomepage = next.url === startUrl.toString()
    if (isHomepage ? text.length > 0 : text.length > 40) pages.push({ url: next.url, text })

    if (next.depth === 0) {
      logoUrl = extractLogoUrl($, next.url)
      colors = extractColors($)
      socialLinks = extractSocialLinks($)
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

  return { pages, logoUrl, colors, socialLinks }
}
