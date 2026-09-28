/**
 * Reading and writing the `data:` URL a flyer is stored in.
 *
 * One decoder rather than three. The edit route already parsed both
 * encodings correctly while the view route split on the literal string
 * "base64," — which returns undefined for a percent-encoded document and
 * reports it as "Stored flyer is malformed". toDataUrl() below always
 * writes base64, so production flyers never took that path, but the dev
 * seed writes percent-encoded ones and view/print/PDF all failed on them.
 * A parser that only handles what our own writer happens to emit is a
 * parser that breaks the moment anything else writes a flyer.
 */

// [\s\S] rather than the /s flag: the compile target predates it.
const DATA_URL = /^data:text\/html(?:;charset=[^;,]+)?(;base64)?,([\s\S]*)$/

/** The flyer's HTML, or null if this isn't a flyer data: URL we can read. */
export function decodeFlyerHtml(downloadUrl: string): string | null {
  const m = downloadUrl.match(DATA_URL)
  if (!m) return null
  try {
    return m[1] ? Buffer.from(m[2], "base64").toString("utf8") : decodeURIComponent(m[2])
  } catch {
    return null
  }
}

/** Re-encoded the way the pipeline stores it (see flyer-html.ts toDataUrl). */
export function encodeFlyerHtml(html: string): string {
  return `data:text/html;charset=utf-8;base64,${Buffer.from(html, "utf8").toString("base64")}`
}
