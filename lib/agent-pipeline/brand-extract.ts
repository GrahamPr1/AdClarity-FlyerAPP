import * as cheerio from "cheerio"
import type { BrandColorRoles } from "@/lib/types"

/**
 * Evidence-based logo and colour-role extraction from static HTML.
 *
 * Split out of scraper.ts so it is unit-testable without a network: scraper.ts
 * owns fetching and the crawl budget, this owns "given this page, what is the
 * brand?".
 *
 * Replaces two heuristics that were too blunt to trust:
 *
 *  - logo: "first <img> whose alt/class/id/src contains 'logo', else the
 *    favicon". On a real site the first such match is frequently a partner
 *    badge, an "as seen in" strip, or a payment-provider mark in the footer,
 *    and the favicon fallback fires far too eagerly.
 *  - colours: a flat frequency count with no roles, so a caller could not
 *    tell a background from a headline colour — which is exactly what laying
 *    out a flyer needs to know.
 *
 * Both now return null rather than guessing when the page carries no
 * evidence. A null role is a fact ("we didn't find one"); an invented hex is
 * a lie that ends up printed on a flyer.
 */

/* ------------------------------- Logo ---------------------------------- */

export interface LogoCandidate {
  url: string
  score: number
  why: string
}

const LOGO_WORD = /\b(logo|brand|wordmark|site-?title|masthead)\b/i
/** Things that look like logos but are somebody else's. */
const NOT_OUR_LOGO =
  /(partner|sponsor|badge|award|certif|payment|visa|mastercard|paypal|stripe|yelp|google|facebook|instagram|twitter|linkedin|bbb|angi|houzz|trustpilot|as-seen|client)/i

function absolutize(src: string, pageUrl: string): string | null {
  try {
    return new URL(src, pageUrl).toString()
  } catch {
    return null
  }
}

/**
 * Ranks every plausible logo on the page and returns the best, or null.
 *
 * Scoring is ordered by the preference the product asks for: a header SVG
 * beats a header raster, which beats a logo-named image anywhere, which beats
 * a favicon. Favicons are still accepted — for many small-business sites it
 * genuinely is the only mark available — but they score low enough that any
 * real logo outranks them, which is the bug being fixed.
 */
export function extractLogo($: cheerio.CheerioAPI, pageUrl: string): LogoCandidate | null {
  const candidates: LogoCandidate[] = []

  $("img[src], img[data-src], svg image[href]").each((_, el) => {
    const $el = $(el)
    const src = $el.attr("src") || $el.attr("data-src") || $el.attr("href")
    if (!src) return
    if (/^data:image\/gif/i.test(src)) return // tracking pixels

    const url = absolutize(src, pageUrl)
    if (!url) return

    const alt = $el.attr("alt") ?? ""
    const cls = `${$el.attr("class") ?? ""} ${$el.attr("id") ?? ""}`
    const haystack = `${alt} ${cls} ${src}`

    // Somebody else's mark. Excluded outright rather than down-weighted:
    // a footer full of payment badges would otherwise out-vote the real logo.
    if (NOT_OUR_LOGO.test(haystack)) return

    let score = 0
    const why: string[] = []

    const inHeader = $el.closest("header, nav, .header, .navbar, #header, [role=banner]").length > 0
    const inFooter = $el.closest("footer, .footer, #footer").length > 0
    if (inHeader) { score += 50; why.push("in header") }
    if (inFooter) { score -= 15; why.push("in footer") }

    if (LOGO_WORD.test(alt)) { score += 30; why.push("alt says logo") }
    if (LOGO_WORD.test(cls)) { score += 25; why.push("class says logo") }
    if (LOGO_WORD.test(src)) { score += 20; why.push("filename says logo") }

    // Format preference: SVG is resolution-independent, which matters for a
    // logo that gets scaled onto print output.
    if (/\.svg(\?|$)/i.test(url)) { score += 25; why.push("svg") }
    else if (/\.(png|webp)(\?|$)/i.test(url)) { score += 12; why.push("png/webp") }
    else if (/\.(jpe?g)(\?|$)/i.test(url)) { score += 2; why.push("jpeg") }

    // A link wrapping the image back to "/" is the classic site-logo pattern.
    const href = $el.closest("a").attr("href")
    if (href === "/" || href === pageUrl || href === "./") { score += 20; why.push("links home") }

    // Declared dimensions: a very wide-and-short image is a wordmark; a
    // tiny one is an icon; a huge one is a hero photo.
    const w = parseInt($el.attr("width") ?? "", 10)
    const h = parseInt($el.attr("height") ?? "", 10)
    if (Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0) {
      if (w <= 24 && h <= 24) { score -= 20; why.push("icon-sized") }
      if (w > 600 || h > 600) { score -= 25; why.push("hero-sized") }
      const ratio = w / h
      if (ratio >= 1.5 && ratio <= 8 && h <= 200) { score += 10; why.push("wordmark shape") }
    }

    if (score > 0) candidates.push({ url, score, why: why.join(", ") })
  })

  candidates.sort((a, b) => b.score - a.score)
  if (candidates.length > 0) return candidates[0]

  // Favicon last, and only if nothing above qualified. apple-touch-icon
  // first: it is required to be a real raster of decent size, whereas
  // /favicon.ico is often a 16px relic.
  const iconHref =
    $('link[rel="apple-touch-icon"]').attr("href") ||
    $('link[rel="icon"][sizes]').attr("href") ||
    $('link[rel="icon"]').attr("href") ||
    $('link[rel="shortcut icon"]').attr("href")
  if (iconHref) {
    const url = absolutize(iconHref, pageUrl)
    if (url) return { url, score: 1, why: "favicon fallback" }
  }
  return null
}

/* ------------------------------ Colours -------------------------------- */

const HEX = /#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/g

function expand(hex: string): string {
  const h = hex.toLowerCase()
  if (h.length === 4) return `#${h[1]}${h[1]}${h[2]}${h[2]}${h[3]}${h[3]}`
  return h
}

function rgb(hex: string): [number, number, number] {
  const h = expand(hex)
  return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]
}

/** Grey, near-white or near-black: real, but not a *brand* colour. */
export function isNeutralHex(hex: string): boolean {
  const [r, g, b] = rgb(hex)
  const spread = Math.max(r, g, b) - Math.min(r, g, b)
  if (spread < 18) return true
  return false
}

function isLight(hex: string): boolean {
  const [r, g, b] = rgb(hex)
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 > 0.6
}

/**
 * Pulls colour declarations out of <style> blocks and inline styles and
 * assigns them to roles using the property they were declared against —
 * which is the actual evidence — rather than by frequency alone.
 *
 * Only static HTML is available (no external stylesheets, same documented
 * limitation as the rest of the crawler), so a site that keeps everything in
 * a linked .css file yields nothing here and every role stays null.
 */
export function extractColorRoles($: cheerio.CheerioAPI): BrandColorRoles {
  const roles: BrandColorRoles = { primary: null, secondary: null, accent: null, background: null, text: null }
  const css = $("style").map((_, el) => $(el).text()).get().join("\n")

  // CSS custom properties are the strongest signal a site can give us:
  // someone wrote down what they consider their brand colour.
  const varHit = (names: RegExp): string | null => {
    const re = new RegExp(`--[a-z0-9-]*(?:${names.source})[a-z0-9-]*\\s*:\\s*(#[0-9a-fA-F]{3,6})`, "i")
    const m = css.match(re)
    return m ? expand(m[1]) : null
  }
  roles.primary = varHit(/primary|brand(?!-bg)/)
  roles.secondary = varHit(/secondary/)
  roles.accent = varHit(/accent|highlight/)

  // body/html background and text colour, declared in a <style> block.
  const bodyRule = css.match(/(?:^|[},])\s*(?:html\s*,\s*body|body|html)\s*\{([^}]*)\}/i)
  if (bodyRule) {
    const block = bodyRule[1]
    const bg = block.match(/background(?:-color)?\s*:\s*([^;]+)/i)?.[1]
    const fg = block.match(/(?:^|;)\s*color\s*:\s*([^;]+)/i)?.[1]
    const bgHex = bg?.match(/#[0-9a-fA-F]{3,6}/)?.[0]
    const fgHex = fg?.match(/#[0-9a-fA-F]{3,6}/)?.[0]
    if (bgHex) roles.background = expand(bgHex)
    if (fgHex) roles.text = expand(fgHex)
  }

  // theme-color is a real declaration of brand intent, but on dark-themed
  // sites it is just the chrome colour — so it fills primary only if that
  // is still empty and the colour isn't neutral.
  const theme = $('meta[name="theme-color"]').attr("content")?.trim()
  if (!roles.primary && theme && /^#[0-9a-fA-F]{3,6}$/.test(theme) && !isNeutralHex(theme)) {
    roles.primary = expand(theme)
  }

  // Frequency, as the fallback for whatever is still unset. Counted only
  // where brand colour actually lives: buttons, links, headers, headings.
  if (!roles.primary || !roles.secondary || !roles.accent) {
    const counts = new Map<string, number>()
    const bump = (hex: string, weight = 1) => {
      const h = expand(hex)
      if (isNeutralHex(h)) return
      counts.set(h, (counts.get(h) ?? 0) + weight)
    }
    css.match(HEX)?.forEach((h) => bump(h))
    $("header, nav, button, .btn, a.btn, .button, h1, h2, [class*=primary], [class*=cta]").each((_, el) => {
      $(el).attr("style")?.match(HEX)?.forEach((h) => bump(h, 3))
    })
    const ranked = Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([hex]) => hex)
      .filter((hex) => hex !== roles.primary && hex !== roles.secondary && hex !== roles.accent)

    for (const hex of ranked) {
      if (!roles.primary) { roles.primary = hex; continue }
      if (!roles.secondary) { roles.secondary = hex; continue }
      if (!roles.accent) { roles.accent = hex; break }
    }
  }

  // Sanity: background and text must not be the same colour, and text should
  // be the darker of the two on a light page. If the page contradicts that,
  // trust neither rather than shipping an unreadable pair.
  if (roles.background && roles.text && roles.background === roles.text) {
    roles.background = null
    roles.text = null
  }
  if (roles.background && roles.text && isLight(roles.background) === isLight(roles.text)) {
    roles.text = null
  }

  return roles
}

/** Flat list, ordered by role prominence — the shape the existing
 *  NormalizedIntake.brandAssets.existingColors contract still expects. */
export function rolesToFlatColors(roles: BrandColorRoles): string[] {
  return [roles.primary, roles.secondary, roles.accent].filter((c): c is string => !!c)
}
