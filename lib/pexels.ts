import { isProviderExhausted, markProviderExhausted, noteRateLimitHeaders, readCachedSearch, writeCachedSearch, DEFAULT_EXHAUSTED_SECONDS } from "./photo-search-cache"
import { brandingReason, relevanceTerms, type PhotoSearchOutcome } from "./unsplash"

/**
 * Pexels stock photography — the second stock source, tried when Unsplash
 * has nothing usable (see lib/stock-photos.ts for the order).
 *
 * Same shape and the same obligations as lib/unsplash.ts, minus the one
 * Unsplash-specific rule (Pexels has no download trigger):
 *
 *   1. Attribution: "Photo by <name> on Pexels", linking to the photo's own
 *      Pexels page (its `url`). Injected in code by injectPhotoAttribution,
 *      exactly like the Unsplash credit — never left to the model.
 *   2. Hotlinking: the image is used at the images.pexels.com URL Pexels
 *      returned, never copied into our Blob store.
 *   3. No implied endorsement: Pexels' guidelines forbid presenting people in
 *      a photo as endorsing a product, and a flyer is an advert. So a photo
 *      whose description mentions a person is NOT used at all — see
 *      describesPeople. Enforced here in code, because a flyer is exactly
 *      where "the model will probably crop around them" fails.
 *
 * Auth: `Authorization: <PEXELS_API_KEY>` (no scheme prefix).
 * Limits: 200 requests/hour and 20,000/month per key; X-Ratelimit-Remaining
 * and X-Ratelimit-Reset (Unix seconds) come back on successful responses.
 */

const API_BASE = "https://api.pexels.com/v1"

/** Same thin-library threshold as Unsplash, for the same reason. */
const MIN_TOTAL_RESULTS = 60

/** Skip Pexels once it reports this few requests left. */
const HEADER_REMAINING_FLOOR = 2

/**
 * Words in a Pexels `alt` that mean a person is in the frame. Pexels' alt text
 * is written to describe the subject ("Man in Black Shirt Fixing a Sink"), so
 * people show up here when they are the subject — which is the case that
 * reads as an endorsement. Trade roles are included because in a stock photo
 * "a plumber fixing a sink" is a person, not a pipe.
 *
 * This reads Pexels' description, not the pixels: a person the alt text
 * doesn't mention gets through. A refusal costs one candidate, so the list
 * errs towards refusing.
 */
const PEOPLE_WORDS = new Set([
  "man", "men", "woman", "women", "person", "people", "persons", "boy", "boys", "girl", "girls",
  "child", "children", "kid", "kids", "baby", "toddler", "teen", "teenager", "couple", "family",
  "guy", "guys", "lady", "ladies", "gentleman", "adult", "adults", "senior", "elderly", "crowd",
  "portrait", "face", "faces", "selfie", "smiling", "smile", "he", "she", "his", "her", "him",
  "worker", "workers", "employee", "employees", "customer", "customers", "client", "team", "staff",
  "chef", "barber", "mechanic", "doctor", "dentist", "nurse", "plumber", "electrician", "technician",
  "stylist", "hairdresser", "trainer", "athlete", "student", "students", "teacher", "patient",
  "model", "bride", "groom", "father", "mother", "dad", "mom", "son", "daughter", "friends",
  "someone", "somebody", "roofer", "roofers", "painter", "painters", "cleaner", "cleaners", "gardener",
  "landscaper", "carpenter", "contractor", "contractors", "builder", "builders", "installer", "handyman",
  "repairman", "baker", "barista", "waiter", "waitress", "bartender", "cook", "florist", "therapist",
  "masseuse", "groomer", "veterinarian", "instructor", "coach", "realtor", "owner", "homeowner", "farmer",
  "driver", "mover", "movers", "welder", "surgeon", "pharmacist", "optometrist", "chiropractor",
  "photographer", "artist", "musician", "dancer", "player", "players", "runner", "cyclist", "swimmer",
  "hiker", "tourist", "shopper", "volunteer", "volunteers", "officer", "firefighter", "soldier",
])

export interface PexelsPhoto {
  provider: "pexels"
  /** Pexels photo id — logs and the per-flyer source record only. */
  id: string
  /** The image to embed: images.pexels.com, hotlinked. */
  url: string
  photographerName: string
  photographerUrl: string
  /** The photo's own page on pexels.com — what the credit links to. */
  pageUrl: string
  description: string | null
}

export type PexelsSearchOutcome = { ok: true; photo: PexelsPhoto } | Extract<PhotoSearchOutcome, { ok: false }>

/** The fields of a Pexels search response this module reads — also what the search cache stores. */
interface SearchBody {
  total_results?: number
  photos?: {
    id: number
    url: string
    photographer: string
    photographer_url: string
    alt: string | null
    src: { large2x: string }
  }[]
}

function apiKey(): string | null {
  return process.env.PEXELS_API_KEY?.trim() || null
}

/** True when the photo's own description says a person is in it. */
export function describesPeople(alt: string | null | undefined): boolean {
  return (alt ?? "")
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .some((w) => PEOPLE_WORDS.has(w))
}

function trimForCache(body: SearchBody): SearchBody {
  return {
    total_results: body.total_results,
    photos: (body.photos ?? []).map((p) => ({
      id: p.id,
      url: p.url,
      photographer: p.photographer,
      photographer_url: p.photographer_url,
      alt: p.alt,
      src: { large2x: p.src.large2x },
    })),
  }
}

/**
 * Finds one on-topic, people-free photo, or explains why it couldn't.
 * Never throws; at most one request per call, none on a cache hit or while
 * Pexels last reported its quota used up.
 */
export async function findPexelsPhoto(opts: { query: string; context: string; requireKeywordMatch?: boolean }): Promise<PexelsSearchOutcome> {
  const key = apiKey()
  if (!key) return { ok: false, reason: "not_configured", detail: "PEXELS_API_KEY is not set" }
  if (!opts.query) return { ok: false, reason: "thin_results", detail: "empty query" }

  const cached = await readCachedSearch<SearchBody>("pexels", opts.query)
  if (cached) return pickPhoto(cached, opts)

  if (await isProviderExhausted("pexels")) {
    return { ok: false, reason: "rate_limited", detail: "skipped: Pexels last reported its quota used up" }
  }

  let res: Response
  try {
    const url = `${API_BASE}/search?query=${encodeURIComponent(opts.query)}&per_page=15&orientation=landscape`
    res = await fetch(url, { headers: { Authorization: key } })
  } catch (err) {
    return { ok: false, reason: "error", detail: err instanceof Error ? err.message : String(err) }
  }

  await noteRateLimitHeaders("pexels", res.headers, HEADER_REMAINING_FLOOR)

  if (!res.ok) {
    const reason = res.status === 429 ? "rate_limited" : "error"
    if (reason === "rate_limited") await markProviderExhausted("pexels", DEFAULT_EXHAUSTED_SECONDS, `HTTP ${res.status}`)
    return { ok: false, reason, detail: `HTTP ${res.status}` }
  }

  let body: SearchBody
  try {
    body = trimForCache(await res.json())
  } catch {
    return { ok: false, reason: "error", detail: "unparseable response" }
  }
  await writeCachedSearch("pexels", opts.query, body)
  return pickPhoto(body, opts)
}

/** Relevance and no-people gates, applied identically to a live or a cached search. */
function pickPhoto(body: SearchBody, opts: { query: string; requireKeywordMatch?: boolean }): PexelsSearchOutcome {
  const total = body.total_results ?? 0
  const photos = body.photos ?? []
  if (total < MIN_TOTAL_RESULTS || photos.length === 0) {
    return { ok: false, reason: "thin_results", detail: `only ${total} Pexels results for "${opts.query}"` }
  }

  // An empty alt is refused too: it can't prove the photo is on-topic, and it
  // can't prove there is nobody in it.
  // No people (endorsement) and no one else's brand (see brandingReason).
  const peopleFree = photos.filter((p) => (p.alt ?? "").trim() !== "" && !describesPeople(p.alt) && !brandingReason([p.alt], p.photographer))
  const terms = opts.requireKeywordMatch === false ? [] : relevanceTerms(opts.query)
  const match = peopleFree.find((p) => terms.length === 0 || terms.some((t) => p.alt!.toLowerCase().includes(t)))
  if (!match) {
    return {
      ok: false,
      reason: "no_relevant_match",
      detail: `${photos.length} Pexels candidates for "${opts.query}" (${photos.length - peopleFree.length} refused for people, branding or no description), none matching [${terms.join(", ")}]`,
    }
  }

  return {
    ok: true,
    photo: {
      provider: "pexels",
      id: String(match.id),
      url: match.src.large2x,
      photographerName: match.photographer,
      photographerUrl: match.photographer_url,
      pageUrl: match.url,
      description: match.alt,
    },
  }
}
