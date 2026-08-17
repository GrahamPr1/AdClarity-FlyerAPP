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
