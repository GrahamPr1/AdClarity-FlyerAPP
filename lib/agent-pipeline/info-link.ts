/**
 * Fetching a client-supplied info link, including Google Sheets.
 *
 * Extracted verbatim from formFillPipeline so flyer intake and form-fill use
 * ONE implementation rather than two that drift. The Sheets handling in
 * particular encodes a real, hard-won detail — an unshared sheet returns 200
 * with an HTML sign-in page rather than a 401 — and duplicating it would mean
 * duplicating that lesson.
 */
const MAX_LINK_FETCH_CHARS = 200

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

const GOOGLE_SHEETS_URL_RE = /docs\.google\.com\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/

/** A Google Sheets URL has no readable content via a plain fetch (it's a JS app shell) — converts it to that sheet's public CSV export endpoint instead, which works with no login IF the sheet is shared as "Anyone with the link can view". Preserves a specific tab's gid if the URL included one. */
export function toGoogleSheetsCsvExportUrl(url: string): string | null {
  const match = url.match(GOOGLE_SHEETS_URL_RE)
  if (!match) return null
  const gidMatch = url.match(/[#&?]gid=(\d+)/)
  return `https://docs.google.com/spreadsheets/d/${match[1]}/export?format=csv${gidMatch ? `&gid=${gidMatch[1]}` : ""}`
}

/**
 * Claude has no browsing tool here — a client-provided info link is
 * fetched server-side, never handed to the agent as a bare URL.
 *
 * A Google Sheets link gets special handling: converted to its CSV export
 * URL, and a failure there is treated as a real, surfaceable error (most
 * likely cause: the sheet isn't actually shared publicly) rather than
 * silently degraded — Google doesn't return a clean 401 for this, it
 * redirects to an HTML sign-in page with a 200, so content-type is the
 * real signal a fetch succeeded vs. quietly failed.
 *
 * Any other link failing is NOT treated as an error — a bad generic link
 * just means less context for the agent, not a failed request.
 */
export async function fetchInfoLinkContent(infoLink: string | null): Promise<{ content: string | null; error: string | null }> {
  if (!infoLink) return { content: null, error: null }

  const sheetsExportUrl = toGoogleSheetsCsvExportUrl(infoLink)

  try {
    const res = await fetch(sheetsExportUrl ?? infoLink, { redirect: "follow" })
    const contentType = res.headers.get("content-type") ?? ""

    if (sheetsExportUrl) {
      if (!res.ok || !contentType.includes("csv")) {
        return {
          content: null,
          error: 'Couldn\'t access that Google Sheet — make sure it\'s shared as "Anyone with the link can view", then try again.',
        }
      }
      return { content: await res.text(), error: null }
    }

    if (!res.ok) return { content: null, error: null }
    const raw = await res.text()
    const text = contentType.includes("html") ? stripHtml(raw) : raw
    return { content: text.slice(0, MAX_LINK_FETCH_CHARS), error: null }
  } catch {
    return {
      content: null,
      error: sheetsExportUrl ? "Couldn't reach that Google Sheet link — please check it and try again." : null,
    }
  }
}

