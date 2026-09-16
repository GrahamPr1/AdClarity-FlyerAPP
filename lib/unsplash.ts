import { checkRateLimit } from "./rate-limit"

/**
 * Unsplash stock photography — the primary photo source for flyers.
 *
 * Different in kind from Higgsfield (lib/agent-pipeline/higgsfield.ts), which
 * GENERATES a bespoke image from a prompt. This SEARCHES a fixed library of
 * real photographs, which brings three obligations Higgsfield doesn't have:
 *
 *   1. Attribution. The Unsplash LICENSE doesn't require credit, but the API
 *      GUIDELINES do — using this API means crediting the photographer and
 *      Unsplash wherever the photo appears. Enforced in code, not by prompt:
 *      see injectPhotoAttribution in agent-pipeline/flyer-html.ts.
 *   2. A download trigger on real use (see triggerDownload below).
 *   3. A hard, SITE-WIDE rate limit (see the budget section).
 *
 * Auth is the access key only, sent as `Authorization: Client-ID <key>`.
 * Unsplash's secret key is for OAuth (acting as a logged-in Unsplash user)
 * and is not needed for search — verified against the live API.
 */

const API_BASE = "https://api.unsplash.com"

/* ------------------------------- Rate limit -------------------------------
 *
 * TODO(unsplash-production): the demo tier allows 50 requests/HOUR across the
 * WHOLE application — not per user. Production approval raises this to 5,000/hr,
 * at which point DEMO_HOURLY_BUDGET should be raised and the conservatism here
 * (single search per flyer, no pagination, no retries) can be relaxed.
 * Apply at https://unsplash.com/oauth/applications/1061998.
 *
 * Two independent defences, because either alone is insufficient:
 *
 *   - A shared Redis counter, reusing the same sliding-window limiter the
 *     login routes use. This is what stops CONCURRENT generations from
 *     collectively blowing the ceiling; a response header can't, since every
 *     in-flight request reads the same stale value.
 *   - The x-ratelimit-remaining header, which is authoritative and catches
 *     drift between our counter and Unsplash's (other clients using the same
 *     key, counter expiry, a redeploy).
 *
 * Budgeted below the real ceiling on purpose: overshooting gets 403s that
 * would surface as failed generations, and a few unused requests per hour is
 * a much cheaper mistake.
 */
const DEMO_HOURLY_BUDGET = 45
const RATE_LIMIT_KEY = "unsplash:search:global"
const RATE_WINDOW_SECONDS = 60 * 60

/** Stop calling once Unsplash itself says this little is left, even if our own counter disagrees. */
const HEADER_REMAINING_FLOOR = 3

/* ---------------------------- Relevance policy ----------------------------
 *
 * A wrong photo on a printed flyer is worse than no photo: the CSS-only
 * design the Flyer Agent already produces is genuinely good, whereas a
 * stock shot of someone else's trade actively misleads.
 *
 * Two conservative gates, because they catch different failures. Measured
 * against the real API:
 *   - "dental office"    ->  25 results  (thin library; count catches it)
 *   - "furnace tune up"  -> 532 results  but the top hits were "a group of
 *                           people in front of a green and red flame" and
 *                           "purple and blue light digital wallpaper".
 *     Count alone would have accepted that, so a keyword match on the
 *     photo's own description/tags is required as well.
 */
const MIN_TOTAL_RESULTS = 60

/** Unsplash ANDs query terms, so more words means fewer — not better — hits. */
const MAX_QUERY_TERMS = 3

/**
 * Words too generic to prove a photo is actually on-topic.
 *
 * Includes seasons and months: an offer is routinely timed ("Fall furnace
 * tune-up", "January membership drive") but no stock photo is usefully
 * filtered by when the promotion runs, and because Unsplash ANDs terms,
 * carrying them in actively suppresses good matches.
 */
const STOPWORDS = new Set([
  "business", "service", "services", "company", "local", "professional", "the", "and", "for",
  "with", "your", "our", "new", "best", "quality", "affordable", "free", "off", "special",
  "spring", "summer", "fall", "autumn", "winter", "january", "february", "march", "april",
  "june", "july", "august", "september", "october", "november", "december", "sale", "deal",
  "discount", "promotion", "offer", "today", "now", "get", "save",
])

/**
 * Three, not four: "Gym", "Spa" and "Vet" are whole trades. The longer
 * minimum silently dropped the industry itself from the query.
 */
const MIN_TERM_LENGTH = 3

export interface UnsplashPhoto {
  /** Unsplash photo id — useful in logs, never shown to a client. */
  id: string
  /** The image to embed. `regular` (~1080px wide) is the guideline-recommended display size. */
  url: string
  photographerName: string
  photographerUrl: string
  /** Must be GET'd when the photo is really used — see triggerDownload. */
  downloadLocation: string
  description: string | null
}

export type PhotoSearchOutcome =
  | { ok: true; photo: UnsplashPhoto }
  | { ok: false; reason: "not_configured" | "rate_limited" | "thin_results" | "no_relevant_match" | "error"; detail: string }

function accessKey(): string | null {
  return process.env.UNSPLASH_ACCESS_KEY?.trim() || null
}

function authHeaders(key: string) {
  return { Authorization: `Client-ID ${key}`, "Accept-Version": "v1" }
}

/**
 * Turns intake data into a plain-text search query.
 *
 * Adapted from buildAiPhotoPrompt (agent-pipeline/pipeline.ts) rather than
 * reused verbatim: that builds a long generative prompt full of negative
 * constraints ("no people, no text, no logos"), which is meaningless to a
 * keyword search and actively harmful — Unsplash would match the word
 * "people". Only the concrete nouns carry over.
 */
export function buildSearchQuery(opts: { industry: string; purpose: string; services: string[] }): string {
  // Order matters: industry first, then the concrete service, then whatever
  // the offer adds. Earlier terms are the ones worth keeping when the cap
  // trims the tail.
  const raw = [opts.industry, opts.services[0] ?? "", opts.purpose]
    .join(" ")
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= MIN_TERM_LENGTH && !STOPWORDS.has(w))

  // Near-duplicate collapse. "Roofing" + "Roof replacement" + "fall roof
  // replacement" naively concatenates to "roofing roof replacement fall
  // roof" — measured against the live API that scored 59 results, where
  // plain "roof replacement" scores 2,179. Over-specifying the query is a
  // far bigger relevance risk than under-specifying it, because Unsplash
  // ANDs the terms.
  const kept: string[] = []
  for (const w of raw) {
    if (kept.some((k) => k.startsWith(w) || w.startsWith(k))) continue
    kept.push(w)
    if (kept.length === MAX_QUERY_TERMS) break
  }
  return kept.join(" ").slice(0, 100)
}

/** Meaningful words a candidate photo should plausibly relate to. */
function relevanceTerms(query: string): string[] {
  return query
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= MIN_TERM_LENGTH && !STOPWORDS.has(w))
}

function isRelevant(photo: { description: string | null; alt_description: string | null; tags?: { title?: string }[] }, terms: string[]): boolean {
  if (terms.length === 0) return true
  const haystack = [
    photo.description ?? "",
    photo.alt_description ?? "",
    ...(photo.tags ?? []).map((t) => t.title ?? ""),
  ]
    .join(" ")
    .toLowerCase()
  return terms.some((t) => haystack.includes(t))
}

/**
 * Finds one on-topic photo, or explains why it couldn't.
 *
 * Never throws: every failure path returns a reason so the caller can fall
 * back to the CSS-only design instead of failing a generation the client has
 * already spent a credit on. Exactly one request per call — no pagination,
 * no retries — because of the hourly ceiling above.
 */
export async function findPhoto(opts: { query: string; context: string }): Promise<PhotoSearchOutcome> {
  const key = accessKey()
  if (!key) {
    return { ok: false, reason: "not_configured", detail: "UNSPLASH_ACCESS_KEY is not set" }
  }

  const budget = await checkRateLimit(RATE_LIMIT_KEY, DEMO_HOURLY_BUDGET, RATE_WINDOW_SECONDS)
  if (!budget.allowed) {
    return {
      ok: false,
      reason: "rate_limited",
      detail: `site-wide hourly budget of ${DEMO_HOURLY_BUDGET} exhausted; retry in ${budget.retryAfterSeconds}s`,
    }
  }

  let res: Response
  try {
    const url =
      `${API_BASE}/search/photos?query=${encodeURIComponent(opts.query)}` +
      `&per_page=10&orientation=landscape&content_filter=high`
    res = await fetch(url, { headers: authHeaders(key) })
  } catch (err) {
    return { ok: false, reason: "error", detail: err instanceof Error ? err.message : String(err) }
  }

  const remaining = Number(res.headers.get("x-ratelimit-remaining") ?? NaN)
  if (Number.isFinite(remaining) && remaining <= HEADER_REMAINING_FLOOR) {
    console.warn(`[unsplash] ${opts.context}: only ${remaining} requests left on the hourly quota.`)
  }

  if (!res.ok) {
    // 403 here is Unsplash's own ceiling, reached despite our counter.
    const reason = res.status === 403 || res.status === 429 ? "rate_limited" : "error"
    return { ok: false, reason, detail: `HTTP ${res.status}` }
  }

  let body: {
    total?: number
    results?: {
      id: string
      urls: { regular: string }
      links: { download_location: string }
      user: { name: string; links: { html: string } }
      description: string | null
      alt_description: string | null
      tags?: { title?: string }[]
    }[]
  }
  try {
    body = await res.json()
  } catch {
    return { ok: false, reason: "error", detail: "unparseable response" }
  }

  const total = body.total ?? 0
  const results = body.results ?? []

  if (total < MIN_TOTAL_RESULTS || results.length === 0) {
    return { ok: false, reason: "thin_results", detail: `only ${total} results for "${opts.query}"` }
  }

  const terms = relevanceTerms(opts.query)
  const match = results.find((p) => isRelevant(p, terms))
  if (!match) {
    return {
      ok: false,
      reason: "no_relevant_match",
      detail: `${results.length} candidates for "${opts.query}", none matching [${terms.join(", ")}]`,
    }
  }

  return {
    ok: true,
    photo: {
      id: match.id,
      url: match.urls.regular,
      photographerName: match.user.name,
      photographerUrl: match.user.links.html,
      downloadLocation: match.links.download_location,
      description: match.description ?? match.alt_description,
    },
  }
}

/**
 * Reports a real use of a photo back to Unsplash.
 *
 * Required by the API Guidelines whenever a photo is actually used — not
 * when it merely appears in search results. It's how photographers get
 * credited with usage, and skipping it puts API access at risk.
 *
 * Deliberately not exported for callers to remember: the only caller is
 * finalizePhotoUsage below, which is wired into the same step that decides a
 * photo really made it into a flyer. Best-effort — a failed ping must never
 * fail a delivered flyer.
 */
async function triggerDownload(photo: UnsplashPhoto, context: string): Promise<boolean> {
  const key = accessKey()
  if (!key) return false
  try {
    const res = await fetch(photo.downloadLocation, { headers: authHeaders(key) })
    if (!res.ok) {
      console.warn(`[unsplash] ${context}: download trigger for ${photo.id} returned HTTP ${res.status}`)
      return false
    }
    return true
  } catch (err) {
    console.warn(`[unsplash] ${context}: download trigger for ${photo.id} failed — ${err instanceof Error ? err.message : err}`)
    return false
  }
}

/**
 * Call once per flyer, with the photos that genuinely ended up in its HTML.
 *
 * This is the single choke point for "a photo was really used": it fires the
 * mandatory download trigger for each one. Pairing it with attribution at the
 * same call site (see the pipeline) means neither obligation can be met
 * without the other.
 */
export async function finalizePhotoUsage(photos: UnsplashPhoto[], context: string): Promise<void> {
  if (photos.length === 0) return
  const results = await Promise.allSettled(photos.map((p) => triggerDownload(p, context)))
  const fired = results.filter((r) => r.status === "fulfilled" && r.value).length
  console.log(`[unsplash] ${context}: download trigger fired for ${fired}/${photos.length} used photo(s)`)
}
