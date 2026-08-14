// The URL QR codes on flyers point to. Deliberately NOT Vercel's own
// VERCEL_URL (that's per-deployment and changes on every deploy) — a QR
// code that ends up on a PRINTED flyer needs a URL that stays valid for as
// long as the physical flyer exists, so this is pinned to a real env var
// with the current known-stable production domain as a fallback only for
// local dev.
export function getSiteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL ?? "https://ad-clarity-landing-page.vercel.app"
}
