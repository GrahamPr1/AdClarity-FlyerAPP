/**
 * Which network requests a document may make while it's rendered to PDF.
 *
 * The PDF render (lib/pdf/flyer-pdf.ts) loads AI-generated HTML into a real
 * Chromium on our server. JavaScript is off there, and every request the
 * document makes goes through this allow-list; anything else is aborted. That
 * keeps a crafted or hallucinated URL in a flyer from turning the render into
 * a way to reach arbitrary hosts from our infrastructure.
 *
 * The list is what generated documents actually load (measured 2026-10-22):
 *
 *   - Google Fonts — AI-written documents link the stylesheet, which pulls
 *     the font files: fonts.googleapis.com + fonts.gstatic.com.
 *   - Uploaded photos and logos — private Blob files streamed by OUR route,
 *     `${getSiteUrl()}/api/photos/…`. Only that path, GET only, on our own
 *     hosts (the site URL's host, and oneflyer.org).
 *   - Vercel Blob directly (*.blob.vercel-storage.com), for any document that
 *     references a Blob URL as-is.
 *   - Unsplash stock photos: images.unsplash.com.
 *
 * Not on the list, on purpose: Higgsfield AI images and logos from a client's
 * own website (submitted or scanned). Those are copied into our Blob store
 * when they arrive (lib/rehost-image.ts), so documents reference them via
 * /api/photos/ above. Anything still pointing at the original host — e.g. a
 * flyer made before rehosting, not yet migrated — is blocked here.
 *
 * `data:` URLs (the QR code, inline images) never reach the network and aren't
 * routed, so they always work.
 */

export const PDF_ALLOWED_HOSTS = [
  "fonts.googleapis.com",
  "fonts.gstatic.com",
  "images.unsplash.com",
] as const

/** Host suffixes: any subdomain is allowed (".blob.vercel-storage.com" matches "abc.public.blob.vercel-storage.com"). */
export const PDF_ALLOWED_HOST_SUFFIXES = [".blob.vercel-storage.com"] as const

/** Our own hosts, where only the photo route may be fetched. */
export const PHOTO_ROUTE_PREFIX = "/api/photos/"

export interface PdfRequestPolicy {
  /** Hosts serving our app, e.g. the getSiteUrl() host and oneflyer.org. */
  siteHosts: string[]
  /** Local development only: allow http to loopback site hosts (the dev site URL is http://localhost:3000). */
  allowDevHttpLoopback?: boolean
}

const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"])

export function isAllowedPdfRequest(rawUrl: string, method: string, policy: PdfRequestPolicy): boolean {
  if (method.toUpperCase() !== "GET") return false
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    return false
  }
  if (url.protocol === "data:") return true
  if (url.username || url.password) return false

  const host = url.host.toLowerCase()
  const isSiteHost = policy.siteHosts.some((h) => h.toLowerCase() === host)
  if (isSiteHost) {
    const httpOk =
      url.protocol === "https:" || (url.protocol === "http:" && !!policy.allowDevHttpLoopback && LOOPBACK.has(url.hostname))
    return httpOk && url.pathname.startsWith(PHOTO_ROUTE_PREFIX) && !url.pathname.includes("..")
  }

  if (url.protocol !== "https:") return false
  if (url.port) return false // the allowed hosts are all served on 443
  const name = url.hostname.toLowerCase()
  if ((PDF_ALLOWED_HOSTS as readonly string[]).includes(name)) return true
  return PDF_ALLOWED_HOST_SUFFIXES.some((suffix) => name.endsWith(suffix))
}
