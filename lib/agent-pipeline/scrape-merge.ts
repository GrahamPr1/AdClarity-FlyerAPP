import type { NormalizedIntake } from "./schemas/intake"

/**
 * Decides the final contact + brand-asset values for a scraped business.
 *
 * There are two distinct phone numbers in this flow and conflating them was
 * the original scraper bug:
 *
 *   userProvidedPhone     — typed into the Path A form, first-hand, current
 *   websitePublishedPhone — whatever the crawler happened to find on the site
 *
 * The user-provided number ALWAYS wins. It's the number they just chose to be
 * contacted on; a stale number in a site footer must never silently replace
 * it on a flyer that gets printed. A website phone is purely a fallback for
 * when the user left the field blank, and its absence is never an error —
 * see the phone rules in prompts/scrape.ts, which stop the agent blocking on
 * a missing one.
 *
 * Logo and colors go the other way: they're extracted from real markup and
 * CSS by lib/agent-pipeline/scraper.ts, which the agent never sees (it only
 * gets page text), so code wins over the model's guess there.
 */
export function mergeScrapedContact(
  extracted: NormalizedIntake,
  crawled: { logoUrl: string | null; colors: string[] },
  userProvided: { phone?: string; fullName?: string },
): NormalizedIntake {
  const userPhone = userProvided.phone?.trim()
  const userName = userProvided.fullName?.trim()

  return {
    ...extracted,
    brandAssets: {
      ...extracted.brandAssets,
      logoUrl: crawled.logoUrl,
      existingColors: crawled.colors.length > 0 ? crawled.colors : extracted.brandAssets.existingColors,
    },
    contact: {
      ...extracted.contact,
      phone: userPhone || extracted.contact.phone,
      contactName: userName || extracted.contact.contactName,
    },
  }
}
