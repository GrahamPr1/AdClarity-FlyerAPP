import { isProviderExhausted, markProviderExhausted, readCachedSearch, writeCachedSearch, DEFAULT_EXHAUSTED_SECONDS } from "./photo-search-cache"
import { brandingReason, relevanceTerms, type PhotoSearchOutcome } from "./unsplash"
import { describesPeople } from "./pexels"
import { rehostExternalImage } from "./rehost-image"

/**
 * Pixabay stock photography — the FIRST stock source (see lib/stock-photos.ts
 * for the order), for public accounts only.
 *
 * Pixabay's API terms differ from Unsplash's and Pexels' in one way that
 * shapes this file: images must NOT be hotlinked. So the one photo picked
 * for a flyer is copied into our own Blob store (rehostExternalImage, the
 * same path logos and AI photos use) and only our /api/photos/ URL is ever
 * returned. A pixabay.com image URL never reaches a flyer, a PDF or an offer
 * page; if the copy fails, the photo isn't used.
 *
 *   1. Attribution: "Photo by <user> on Pixabay", linking to the photo's own
 *      page (pageURL). Injected in code by injectPhotoAttribution.
 *   2. Caching: search responses are cached for 24 hours (the shared search
 *      cache), as Pixabay asks.
 *   3. No people, no one else's marks: a photo whose tags mention a person
 *      (an advert must not imply endorsement), a logo, sign, lettering or a
 *      brand is refused, in code. Tags are Pixabay's only description, so a
 *      person the tags don't mention gets through; a refusal costs one
 *      candidate, so the lists err towards refusing.
 *
 * Auth: `key=<PIXABAY_API_KEY>` query parameter.
 * Limits: 100 requests per 60 seconds; X-RateLimit-Remaining and
 * X-RateLimit-Reset (SECONDS UNTIL the window resets, not a Unix time) come
 * back on every response.
 */

const API_BASE = "https://pixabay.com/api/"

/** Fewer hits than this is a thin library for the query; a broader query is tried instead. */
const MIN_TOTAL_HITS = 20

/** Skip Pixabay once it reports this few requests left in the window. */
const HEADER_REMAINING_FLOOR = 2

/**
 * Pixabay tags name what is visible ("text", "font", "label"), which the
 * shared branding filter's prose-oriented list doesn't cover.
 */
const LETTERING_TAGS = /\b(text|texts|typography|font|fonts|label|labels|writing|written|words?|alphabet|calligraphy|graffiti|poster|posters|banner|banners|packaging|product)\b/i

/**
 * People as Pixabay tags them, beyond the shared Pexels word list: body parts
 * (a hand IS a person in an advert), roles and plurals Pixabay favours, and
 * group words. Found on real searches: "hand, palm, fingers, one, two, three"
 * for a pasta-night offer; "engineers, teamwork" and "architect, hardhat" for
 * a roofer.
 */
const PEOPLE_TAGS = /\b(hands?|fingers?|thumbs?|arms?|legs?|feet|foot|knees?|eyes?|lips|mouth|hair|beard|skin|body|bodies|silhouettes?|human|humans|male|female|businessman|businesswoman|engineers?|architects?|surveyors?|foreman|teamwork|colleagues?|partners?|users?|hardhat|hard hat|helmet|construction workers?)\b/i

/**
 * Words a query can carry that say nothing about what a photo shows: "Two-
 * for-one pasta night" becomes the query "two one restaurant", and a photo
 * tagged "one, two, three" is not a restaurant.
 */
const NON_TOPIC_TERMS = new Set(["one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "first", "second", "third", "half", "double", "single", "free", "offer", "deal", "special", "discount", "sale", "night", "day", "week", "month", "today", "tonight"])

export interface PixabayPhoto {
  provider: "pixabay"
  /** Pixabay photo id — logs and the per-flyer source record only. */
  id: string
  /** OUR Blob copy (/api/photos/...), never a pixabay.com URL. */
  url: string
  photographerName: string
  photographerUrl: string
  /** The photo's own page on pixabay.com — what the credit links to. */
  pageUrl: string
  description: string | null
}

export type PixabaySearchOutcome = { ok: true; photo: PixabayPhoto } | Extract<PhotoSearchOutcome, { ok: false }>

/** The fields of a Pixabay search response this module reads — also what the search cache stores. */
interface SearchBody {
  totalHits?: number
  hits?: {
    id: number
    pageURL: string
    tags: string
    largeImageURL: string
    user: string
    user_id: number
  }[]
}

type Hit = NonNullable<SearchBody["hits"]>[number]

function apiKey(): string | null {
  return process.env.PIXABAY_API_KEY?.trim() || null
}

/** Why a photo's tags rule it out, or null when they don't. */
export function refusalReason(tags: string, user: string): string | null {
  if (!tags.trim()) return "no tags"
  if (describesPeople(tags) || PEOPLE_TAGS.test(tags)) return "people"
  const lettering = tags.match(LETTERING_TAGS)
  if (lettering) return `lettering ("${lettering[0]}")`
  const branding = brandingReason([tags], user)
  return branding ? `branding (${branding})` : null
}

/** A photographer's Pixabay profile: pixabay.com/users/<name>-<id>/. */
export function profileUrl(user: string, userId: number): string {
  const slug = user.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
  return `https://pixabay.com/users/${slug}-${userId}/`
}

function trimForCache(body: SearchBody): SearchBody {
  return {
    totalHits: body.totalHits,
    hits: (body.hits ?? []).map((h) => ({ id: h.id, pageURL: h.pageURL, tags: h.tags, largeImageURL: h.largeImageURL, user: h.user, user_id: h.user_id })),
  }
}

/**
 * Pixabay's window reset is relative ("seconds until"), unlike the Unix time
 * the shared helper reads for Pexels, so it is handled here.
 */
async function noteRateLimit(headers: Headers): Promise<void> {
  const remaining = Number(headers.get("x-ratelimit-remaining") ?? NaN)
  if (!Number.isFinite(remaining) || remaining > HEADER_REMAINING_FLOOR) return
  const reset = Number(headers.get("x-ratelimit-reset") ?? NaN)
  await markProviderExhausted("pixabay", Number.isFinite(reset) && reset > 0 ? reset : DEFAULT_EXHAUSTED_SECONDS, `x-ratelimit-remaining=${remaining}`)
}

/**
 * Finds one on-topic photo with no people or marks in it, copied into our
 * Blob store, or explains why it couldn't. Never throws; at most one search
 * request per call (none on a cache hit or while Pixabay last reported its
 * window used up), plus the one image download for the photo picked.
 */
export async function findPixabayPhoto(
  opts: { query: string; context: string; requireKeywordMatch?: boolean },
  rehost: (url: string) => Promise<string | null> = (url) => rehostExternalImage(url, "stock-photo"),
): Promise<PixabaySearchOutcome> {
  const key = apiKey()
  if (!key) return { ok: false, reason: "not_configured", detail: "PIXABAY_API_KEY is not set" }
  if (!opts.query) return { ok: false, reason: "thin_results", detail: "empty query" }

  let body = await readCachedSearch<SearchBody>("pixabay", opts.query)
  if (!body) {
    if (await isProviderExhausted("pixabay")) {
      return { ok: false, reason: "rate_limited", detail: "skipped: Pixabay last reported its window used up" }
    }
    let res: Response
    try {
      const params = new URLSearchParams({ key, q: opts.query, image_type: "photo", orientation: "horizontal", safesearch: "true", per_page: "20", lang: "en" })
      res = await fetch(`${API_BASE}?${params}`)
    } catch (err) {
      return { ok: false, reason: "error", detail: err instanceof Error ? err.message : String(err) }
    }
    await noteRateLimit(res.headers)
    if (!res.ok) {
      const reason = res.status === 429 ? "rate_limited" : "error"
      if (reason === "rate_limited") await markProviderExhausted("pixabay", DEFAULT_EXHAUSTED_SECONDS, `HTTP ${res.status}`)
      return { ok: false, reason, detail: `HTTP ${res.status}` }
    }
    try {
      body = trimForCache(await res.json())
    } catch {
      return { ok: false, reason: "error", detail: "unparseable response" }
    }
    await writeCachedSearch("pixabay", opts.query, body)
  }

  const picked = pickHit(body, opts)
  if (!picked.ok) return picked
  const hit = picked.hit

  // Never hotlink: our own copy or nothing.
  const own = await rehost(hit.largeImageURL)
  if (!own) return { ok: false, reason: "error", detail: `could not copy Pixabay photo ${hit.id} into Blob` }

  return {
    ok: true,
    photo: {
      provider: "pixabay",
      id: String(hit.id),
      url: own,
      photographerName: hit.user,
      photographerUrl: profileUrl(hit.user, hit.user_id),
      pageUrl: hit.pageURL,
      description: hit.tags,
    },
  }
}

/** Relevance and refusal gates, applied identically to a live or a cached search. */
export function pickHit(
  body: SearchBody,
  opts: { query: string; requireKeywordMatch?: boolean },
): { ok: true; hit: Hit } | Extract<PhotoSearchOutcome, { ok: false }> {
  const total = body.totalHits ?? 0
  const hits = body.hits ?? []
  if (total < MIN_TOTAL_HITS || hits.length === 0) {
    return { ok: false, reason: "thin_results", detail: `only ${total} Pixabay results for "${opts.query}"` }
  }
  const allowed = hits.filter((h) => !refusalReason(h.tags ?? "", h.user ?? ""))
  const terms = opts.requireKeywordMatch === false ? [] : relevanceTerms(opts.query).filter((t) => !NON_TOPIC_TERMS.has(t))
  if (opts.requireKeywordMatch !== false && terms.length === 0) {
    return { ok: false, reason: "no_relevant_match", detail: `"${opts.query}" has no words that say what the photo should show` }
  }
  const match = allowed.find((h) => terms.length === 0 || terms.some((t) => h.tags.toLowerCase().includes(t)))
  if (!match) {
    return {
      ok: false,
      reason: "no_relevant_match",
      detail: `${hits.length} Pixabay candidates for "${opts.query}" (${hits.length - allowed.length} refused for people, lettering, branding or no tags), none matching [${terms.join(", ")}]`,
    }
  }
  return { ok: true, hit: match }
}
