import { Redis } from "@upstash/redis"

/**
 * Two pieces of shared state for the stock-photo providers (lib/unsplash.ts,
 * lib/pexels.ts), kept in Redis because generations run concurrently across
 * serverless instances and an in-memory value would be per-instance.
 *
 *   1. A search cache, keyed by provider + normalised query. Stores the
 *      provider's own search RESULTS (ids, image URLs, credit fields) — never
 *      image bytes. The URLs are the provider's own CDN URLs as returned, so a
 *      flyer built from a cached result still hotlinks images.unsplash.com /
 *      images.pexels.com exactly as one built from a live search. The cache
 *      sits in front of SEARCH only: Unsplash's download trigger is fired per
 *      real use in finalizePhotoUsage, which never reads from here, so a cache
 *      hit can't skip it.
 *   2. An "exhausted" marker per provider, set from the provider's own
 *      X-Ratelimit-Remaining header (or a 429/403), so the next generation
 *      skips that provider instead of spending a request that is going to
 *      fail.
 *
 * Every Redis failure fails open: no cache, not exhausted. Photo sourcing is
 * best-effort and must never fail a generation over a cache.
 */

const redis = Redis.fromEnv()

export type StockProvider = "unsplash" | "pexels" | "pixabay"

/** Long enough that a burst of same-trade generations shares one search; short enough to pick up new library photos. */
export const SEARCH_CACHE_TTL_SECONDS = 24 * 60 * 60

/** Bump to invalidate every cached search at once (e.g. if the cached shape changes). */
const CACHE_VERSION = "v1"

/**
 * Lower-cased, whitespace-collapsed. Word ORDER is kept: both providers rank
 * by it, so "roof replacement" and "replacement roof" are not the same search.
 */
export function normaliseQuery(query: string): string {
  return query.toLowerCase().replace(/\s+/g, " ").trim()
}

export function searchCacheKey(provider: StockProvider, query: string): string {
  return `photo-search:${CACHE_VERSION}:${provider}:${normaliseQuery(query)}`
}

export async function readCachedSearch<T>(provider: StockProvider, query: string): Promise<T | null> {
  try {
    const hit = await redis.get<T>(searchCacheKey(provider, query))
    if (hit != null) console.log(`[photo-search] cache HIT ${provider} "${normaliseQuery(query)}"`)
    return hit ?? null
  } catch (err) {
    console.warn(`[photo-search] cache read failed (${provider}): ${err instanceof Error ? err.message : err}`)
    return null
  }
}

export async function writeCachedSearch<T>(provider: StockProvider, query: string, value: T): Promise<void> {
  try {
    await redis.set(searchCacheKey(provider, query), value, { ex: SEARCH_CACHE_TTL_SECONDS })
    console.log(`[photo-search] cache STORE ${provider} "${normaliseQuery(query)}" (ttl ${SEARCH_CACHE_TTL_SECONDS}s)`)
  } catch (err) {
    console.warn(`[photo-search] cache write failed (${provider}): ${err instanceof Error ? err.message : err}`)
  }
}

/* --------------------------------- Quota ---------------------------------- */

const exhaustedKey = (provider: StockProvider) => `photo-provider:${CACHE_VERSION}:${provider}:exhausted`

/**
 * When a provider doesn't say when its window resets (Unsplash sends no reset
 * header), look again after this long. One probe per interval is the most a
 * wrong guess can cost.
 */
export const DEFAULT_EXHAUSTED_SECONDS = 10 * 60

/** True when a provider recently reported its quota as used up. */
export async function isProviderExhausted(provider: StockProvider): Promise<boolean> {
  try {
    return (await redis.get(exhaustedKey(provider))) != null
  } catch {
    return false
  }
}

export async function markProviderExhausted(provider: StockProvider, seconds: number, why: string): Promise<void> {
  const ttl = Math.max(30, Math.min(Math.ceil(seconds), 60 * 60))
  console.warn(`[photo-search] ${provider} marked exhausted for ${ttl}s: ${why}`)
  try {
    await redis.set(exhaustedKey(provider), why, { ex: ttl })
  } catch (err) {
    console.warn(`[photo-search] could not record ${provider} as exhausted: ${err instanceof Error ? err.message : err}`)
  }
}

/**
 * Reads X-Ratelimit-Remaining (and X-Ratelimit-Reset, a Unix time in seconds,
 * when the provider sends one) off a response and marks the provider
 * exhausted once remaining is at or below `floor`.
 */
export async function noteRateLimitHeaders(provider: StockProvider, headers: Headers, floor: number): Promise<void> {
  const remaining = Number(headers.get("x-ratelimit-remaining") ?? NaN)
  if (!Number.isFinite(remaining) || remaining > floor) return
  const reset = Number(headers.get("x-ratelimit-reset") ?? NaN)
  const seconds = Number.isFinite(reset) && reset > 0 ? reset - Date.now() / 1000 : DEFAULT_EXHAUSTED_SECONDS
  await markProviderExhausted(provider, seconds, `x-ratelimit-remaining=${remaining}`)
}
