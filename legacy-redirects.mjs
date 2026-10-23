// Redirects for the legacy domain, ad-clarity-landing-page.vercel.app.
//
// Its pages move to the canonical domain with a 308, but a few paths must
// keep being SERVED on the old host, forever:
//
//   r/       QR scan pages. Printed codes point here and can't be reprinted.
//   api/     Everything an outside caller hits on the old host: the scan
//            page's click counter (/api/tracking/, posted with a RELATIVE
//            URL — a browser won't follow a cross-origin 308 for that POST,
//            so clicks would vanish silently), photo and logo URLs stored in
//            existing flyers (/api/photos/), stored material links
//            (/api/onboarding/material/), webhooks. Pages redirect before
//            they make any API call, so nothing on our own pages reaches
//            these on the old host.
//   _next/   The scan page's own scripts, styles and fonts.
//   _vercel/ Analytics endpoints the scan page reports to.
//
// The exclusions are pinned by tests/legacy-redirects.test.ts and checked
// against a live deployment by scripts/check-legacy-domain.ts. Plain .mjs so
// next.config.mjs can import it.
//
// Not done with Vercel's domain-level redirect setting on purpose: that would
// redirect /r/ too.

/** Must match LEGACY_SITE_HOSTS in lib/site-url.ts (the test checks). */
export const LEGACY_HOST = "ad-clarity-landing-page.vercel.app"
export const CANONICAL_ORIGIN = "https://oneflyer.org"

/** Path prefixes (no leading slash) that are served on the legacy host, never redirected. */
export const LEGACY_PASSTHROUGH_PREFIXES = ["r/", "api/", "_next/", "_vercel/"]

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")

export function legacyHostRedirects() {
  // `has.value` is a regex anchored by Next (^…$), so the dots are escaped.
  const has = [{ type: "host", value: escapeRegex(LEGACY_HOST) }]
  const excluded = LEGACY_PASSTHROUGH_PREFIXES.map(escapeRegex).join("|")
  return [
    // "/" on its own: the catch-all below needs at least one character.
    { source: "/", has, destination: `${CANONICAL_ORIGIN}/`, permanent: true },
    // Everything else except the passthrough prefixes. Query strings carry over.
    { source: `/:path((?!${excluded}).+)`, has, destination: `${CANONICAL_ORIGIN}/:path`, permanent: true },
  ]
}
