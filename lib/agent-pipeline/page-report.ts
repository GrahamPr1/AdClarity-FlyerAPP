import type { BusinessProfile } from "@/lib/business-profile"

/**
 * What the scanner read, per page.
 *
 * Exists because a checklist of ticks does not answer the question a client
 * actually has — "what did you look at, and where did that come from?" —
 * and because the honest answer is already sitting in memory at the end of
 * a crawl. No page is re-fetched to build this.
 *
 * The deliberate limitation: the extraction agent reads every page at once
 * and does not report which page a given fact came from, so attribution
 * cannot be taken from it. Rather than guess, `found` is derived by checking
 * which page's text actually CONTAINS each extracted value. That is
 * evidence, not inference — if a service name appears on /services, it is
 * listed there; if it appears nowhere (the agent normalised the wording),
 * it is listed nowhere rather than attributed to a page at random.
 */
export interface PageReport {
  url: string
  /** The page's <title>, or the path when the page had none. */
  title: string
  /** Characters of readable text handed to the extraction agent. */
  chars: number
  /** Extracted values whose text literally appears on this page. */
  found: string[]
}

/** Normalised for comparison — case and whitespace differences are not
 *  meaningful evidence either way. */
function norm(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim()
}

/**
 * Attributes extracted facts to the pages they literally appear on.
 *
 * Only substantial values are attempted: a two-character string would match
 * everywhere and tell the reader nothing.
 */
export function buildPageReports(
  pages: { url: string; text: string; title: string }[],
  profile: BusinessProfile,
): PageReport[] {
  const candidates: { label: string; needle: string }[] = []

  if (profile.businessName) candidates.push({ label: profile.businessName, needle: profile.businessName })
  if (profile.contact.phone) {
    // Phone punctuation varies between the page and the extraction, so
    // compare on digits alone.
    candidates.push({ label: profile.contact.phone, needle: profile.contact.phone })
  }
  if (profile.contact.address) candidates.push({ label: profile.contact.address, needle: profile.contact.address })
  for (const s of profile.services) candidates.push({ label: s, needle: s })
  for (const c of profile.ctas) candidates.push({ label: c, needle: c })

  const digitsOf = (s: string) => s.replace(/\D/g, "")

  return pages.map((page) => {
    const hay = norm(page.text)
    const hayDigits = digitsOf(page.text)
    const found: string[] = []

    for (const { label, needle } of candidates) {
      if (found.includes(label)) continue
      const n = norm(needle)
      if (n.length < 4) continue

      const isPhone = /^[\d\s()+.-]+$/.test(needle) && digitsOf(needle).length >= 7
      const hit = isPhone ? hayDigits.includes(digitsOf(needle)) : hay.includes(n)
      if (hit) found.push(label)
    }

    return {
      url: page.url,
      title: page.title || new URL(page.url).pathname,
      chars: page.text.length,
      found: found.slice(0, 8),
    }
  })
}
