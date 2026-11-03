/**
 * True on a QR offer page (/r/<code>).
 *
 * Offer pages load no analytics or advertising tags: not GA4, not GTM (which
 * carries the Meta tag), not Vercel Analytics. They are a business's page for
 * its own customers, and they hold a lead form — a tag that reads forms (Meta's
 * automatic advanced matching does) could pick up a visitor's phone number.
 * Each tag component checks this itself, so nothing about the tags reaches an
 * offer page's HTML at all.
 */
export function isOfferPagePath(pathname: string | null | undefined): boolean {
  return !!pathname && (pathname === "/r" || pathname.startsWith("/r/"))
}
