// The URL QR codes on flyers point to. Deliberately NOT Vercel's own
// VERCEL_URL (that's per-deployment and changes on every deploy) — a QR
// code that ends up on a PRINTED flyer needs a URL that stays valid for as
// long as the physical flyer exists.
//
// The fallback is the real owned apex domain, NOT the
// ad-clarity-landing-page.vercel.app alias it used to be. That alias is a
// project-name-derived Vercel URL: renaming the project (or moving it)
// silently invalidates it, and by then the URL is on paper in someone's
// mailbox and cannot be changed. oneflyer.org is registered through 2027 and
// is the domain the product is actually marketed under, so it's the safest
// thing to fall back to if NEXT_PUBLIC_SITE_URL is ever missing or wrong.
const FALLBACK_SITE_URL = "https://oneflyer.org"

export function getSiteUrl(): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim()
  if (!configured) return FALLBACK_SITE_URL

  // A trailing slash here produces "https://site.org//r/abc123" in every
  // generated link, which some scanners and mail clients mangle.
  return configured.replace(/\/+$/, "")
}

// ---- Hosts ------------------------------------------------------------------

/**
 * The canonical domain. Matches FALLBACK_SITE_URL; www is served too.
 */
export const CANONICAL_SITE_HOSTS = ["oneflyer.org", "www.oneflyer.org"] as const

/**
 * Where the site used to live. Printed QR codes point here (/r/<code>), and
 * so do photo, logo and material URLs stored in existing flyers and profiles,
 * so this host stays attached to the project, public, and serving those paths
 * FOREVER. next.config.mjs redirects its pages to the canonical domain but
 * leaves /r/, /api/ and /_next/ alone (see legacy-redirects.mjs); the PDF
 * renderer keeps treating it as our own host.
 */
export const LEGACY_SITE_HOSTS = ["ad-clarity-landing-page.vercel.app"] as const

/**
 * Base URL for links to images THIS deployment stores (/api/photos/…).
 *
 * Production and local development use the site URL. A Preview deployment
 * uses its own URL instead: its uploads live in the non-production Blob store,
 * which production can't read, so a Preview image linked at the production
 * host was a 404 everywhere (in the browser and in the PDF). Server-only —
 * VERCEL_ENV / VERCEL_BRANCH_URL / VERCEL_URL aren't exposed to the browser.
 */
export function getAssetBaseUrl(): string {
  if (process.env.VERCEL_ENV === "preview") {
    const own = process.env.VERCEL_BRANCH_URL?.trim() || process.env.VERCEL_URL?.trim()
    if (own) return `https://${own.replace(/^https?:\/\//, "").replace(/\/+$/, "")}`
  }
  return getSiteUrl()
}

/** The public URL for an uploaded or rehosted image stored at `pathname` in Blob. */
export function photoUrl(pathname: string): string {
  return `${getAssetBaseUrl()}/api/photos/${pathname}`
}

/** Every host this app is served from that can appear in stored URLs. */
export function ownSiteHosts(): string[] {
  const hosts = new Set<string>([...CANONICAL_SITE_HOSTS, ...LEGACY_SITE_HOSTS])
  for (const base of [getSiteUrl(), getAssetBaseUrl()]) {
    try {
      hosts.add(new URL(base).host)
    } catch {
      // Both always return absolute URLs; the fixed hosts still apply.
    }
  }
  return [...hosts]
}

/**
 * Re-points a stored URL on a legacy host at the current site URL.
 *
 * For links that need the user's session (e.g. /api/onboarding/material/…):
 * sessions are per-domain, so once users sign in on oneflyer.org, a stored
 * link on the old domain would answer 401. Anything else is returned as is.
 * Not needed for /api/photos/ (public, served on every host).
 */
export function toCurrentSiteUrl(stored: string): string {
  try {
    const url = new URL(stored)
    if (!(LEGACY_SITE_HOSTS as readonly string[]).includes(url.host)) return stored
    const site = new URL(getSiteUrl())
    if ((LEGACY_SITE_HOSTS as readonly string[]).includes(site.host)) return stored
    url.protocol = site.protocol
    url.host = site.host
    return url.href
  } catch {
    return stored
  }
}
