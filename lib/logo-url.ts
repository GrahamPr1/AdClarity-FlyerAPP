/**
 * The one rule for a logo URL that will be written into flyer HTML.
 *
 * A logo URL ends up inside `<img src="…">` in AI-generated documents that are
 * shown in browsers AND rendered server-side to PDF, so it must be inert:
 * an absolute `https:` URL, nothing else — no `javascript:`, no `data:`, no
 * relative paths, no embedded credentials. It's returned normalised through
 * the URL parser, which percent-encodes quotes, spaces and angle brackets, so
 * the value can't break out of the attribute even before escaping (which the
 * caller still does — see escapeHtmlAttr).
 *
 * The single exception is local development: the upload route returns
 * `http://localhost:3000/api/photos/…` there, so `http:` on a loopback host is
 * accepted only when the caller passes allowDevLocalhost (true only when the
 * app environment is "development" — never in preview or production).
 */
const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"])
const MAX_LENGTH = 2000

export function safeLogoUrl(value: unknown, opts: { allowDevLocalhost?: boolean } = {}): string | null {
  if (typeof value !== "string") return null
  const raw = value.trim()
  if (!raw || raw.length > MAX_LENGTH) return null
  let url: URL
  try {
    url = new URL(raw) // absolute only: no base, so relative input throws
  } catch {
    return null
  }
  if (url.username || url.password) return null
  if (url.protocol === "https:") return url.href
  if (url.protocol === "http:" && opts.allowDevLocalhost && LOOPBACK.has(url.hostname)) return url.href
  return null
}

/** Escapes a value for use inside a double- or single-quoted HTML attribute. */
export function escapeHtmlAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
}
