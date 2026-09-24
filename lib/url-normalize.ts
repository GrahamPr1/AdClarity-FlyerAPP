/**
 * Normalising whatever a business owner types into a fetchable URL.
 *
 * This is deliberately its own module rather than living inside the crawler:
 * the browser needs the same answer the server does (to show "we'll scan
 * https://example.com" before submitting), and the crawler previously did its
 * own one-line version — `new URL(raw.match(/^https?:/) ? raw : 'https://'+raw)`
 * — which accepted plenty of things that are not websites. "hello world"
 * became https://hello%20world, and an email address became a URL whose host
 * was the local part.
 *
 * Pure and synchronous. Reachability is a separate question answered by the
 * crawler; this only decides whether a string is a plausible web address and
 * what its canonical form is.
 */

export type UrlNormalizeError =
  | "empty"
  | "not_a_url"
  | "no_dot"
  | "unsupported_scheme"
  | "looks_like_email"
  | "local_address"

export const URL_NORMALIZE_MESSAGES: Record<UrlNormalizeError, string> = {
  empty: "Enter your website address.",
  not_a_url: "That doesn't look like a website address.",
  no_dot: "That's missing a domain ending — try something like example.com.",
  unsupported_scheme: "Only http and https addresses can be scanned.",
  looks_like_email: "That looks like an email address, not a website.",
  local_address: "That address is only reachable on your own network.",
}

export type UrlNormalizeResult =
  | { ok: true; url: string; host: string }
  | { ok: false; reason: UrlNormalizeError; message: string }

/** Hosts that resolve inside our own network. Refused so a scan can never be
 *  pointed at internal infrastructure (SSRF), on top of being useless input. */
const LOCAL_HOST = /^(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.0\.0\.0|\[?::1\]?)/i
const PRIVATE_172 = /^172\.(1[6-9]|2\d|3[01])\./

function fail(reason: UrlNormalizeError): UrlNormalizeResult {
  return { ok: false, reason, message: URL_NORMALIZE_MESSAGES[reason] }
}

/**
 * Accepts `example.com`, `www.example.com`, `https://example.com/`,
 * `HTTP://Example.COM/path/`, and returns one canonical https URL.
 *
 * www is NOT stripped: plenty of sites serve only the www host and 301 the
 * apex (or the reverse), and following a redirect is free while guessing
 * wrong costs a failed scan. Whatever the user typed is what we try; the
 * crawler follows redirects from there.
 */
export function normalizeWebsiteUrl(raw: string): UrlNormalizeResult {
  const trimmed = (raw ?? "").trim()
  if (!trimmed) return fail("empty")

  // Before anything else: an email address parses as a URL once a scheme is
  // bolted on ("https://a@b.com" is valid), so it has to be rejected first.
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return fail("looks_like_email")

  const hasScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)
  if (hasScheme && !/^https?:\/\//i.test(trimmed)) return fail("unsupported_scheme")

  let parsed: URL
  try {
    parsed = new URL(hasScheme ? trimmed : `https://${trimmed}`)
  } catch {
    return fail("not_a_url")
  }

  const host = parsed.hostname.toLowerCase()
  if (!host) return fail("not_a_url")
  // A hostname with no dot is either a typo or an intranet name. Rejecting it
  // here is what stops "hello world" and "my business" reaching the crawler.
  if (!host.includes(".")) return fail("no_dot")
  if (host.startsWith(".") || host.endsWith(".") || host.includes("..")) return fail("not_a_url")
  if (!/^[a-z0-9.-]+$/.test(host)) return fail("not_a_url")
  // Must end in a plausible TLD: letters, at least two of them.
  if (!/\.[a-z]{2,}$/.test(host)) return fail("no_dot")
  if (LOCAL_HOST.test(host) || PRIVATE_172.test(host)) return fail("local_address")

  parsed.hostname = host
  parsed.protocol = "https:"
  parsed.hash = ""
  // A bare origin canonicalises to "/" so the crawler's "is this the
  // homepage?" identity check compares equal to the URL it actually fetched.
  if (parsed.pathname === "") parsed.pathname = "/"
  // Trailing slash is kept on the root and stripped elsewhere, which is what
  // makes ".../about/" and ".../about" the same visited entry.
  if (parsed.pathname !== "/" && parsed.pathname.endsWith("/")) {
    parsed.pathname = parsed.pathname.replace(/\/+$/, "")
  }

  return { ok: true, url: parsed.toString(), host }
}

/** The bare domain, for display ("example.com" from "https://www.example.com/x"). */
export function displayHost(raw: string): string {
  const result = normalizeWebsiteUrl(raw)
  return result.ok ? result.host.replace(/^www\./, "") : raw.trim()
}
