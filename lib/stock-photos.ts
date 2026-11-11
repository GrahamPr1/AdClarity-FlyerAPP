import { Redis } from "@upstash/redis"
import { isNopAgentAccount } from "./enterprise/agents-store"
import { buildSearchQuery, buildSpecificSearchQuery, findFallbackStockPhoto, findPhotoForPromotion, GENERIC_FALLBACK_QUERY, type UnsplashPhoto } from "./unsplash"
import { findPexelsPhoto, type PexelsPhoto, type PexelsSearchOutcome } from "./pexels"
import { creditsUsedIn, injectPhotoAttribution, photoUrlAppearsIn } from "./agent-pipeline/flyer-html"

/**
 * The stock-photo half of the photo chain, in order:
 *
 *   Unsplash -> Pexels -> (Higgsfield, Pro opt-in only; see pipeline.ts) -> no-photo layout
 *
 * Unsplash stays first: it is what every flyer used before Pexels existed,
 * and keeping it first means a flyer that found an Unsplash photo yesterday
 * finds the same one today. Pexels is tried whenever Unsplash produced
 * nothing — including when Unsplash was skipped for its quota, which on the
 * demo tier (50/hour site-wide) is the case that most needs a second source.
 */

export type StockPhoto = UnsplashPhoto | PexelsPhoto

export type StockSearchOutcome = ({ ok: true; photo: StockPhoto } | Extract<PexelsSearchOutcome, { ok: false }>) & { queryUsed: string }

/**
 * Whether Pexels may be used for this account. An explicit account-type check,
 * not a consequence of fallback order: enterprise accounts (an agent profile
 * with an org) and NOP agents keep exactly the photo sources their org
 * approved, which is Unsplash only. Fails closed — if the NOP lookup errors,
 * the account is treated as an agent.
 */
export async function pexelsAllowedFor(email: string, isEnterpriseAccount: boolean): Promise<boolean> {
  if (isEnterpriseAccount) return false
  const isNopAgent = await isNopAgentAccount(email).catch(() => true)
  return !isNopAgent
}

/** Pexels with the same specific-then-broad queries Unsplash uses. */
async function pexelsForPromotion(opts: { industry: string; purpose: string; services: string[]; context: string }): Promise<StockSearchOutcome> {
  const queries = [buildSpecificSearchQuery(opts), buildSearchQuery(opts)].filter((q, i, all) => q && all.indexOf(q) === i)
  let last: StockSearchOutcome = { ok: false, reason: "thin_results", detail: "no usable query", queryUsed: "" }
  for (const query of queries) {
    last = { ...(await findPexelsPhoto({ query, context: opts.context })), queryUsed: query }
    if (last.ok || (last.reason !== "thin_results" && last.reason !== "no_relevant_match")) return last
  }
  return last
}

/**
 * When both providers miss, Unsplash's reason is the one reported, with the
 * Pexels outcome added to the detail. The caller decides from the reason
 * whether a broader search is worth a request (only after thin_results or
 * no_relevant_match), and that decision is about Unsplash's library and
 * budget — a dormant or exhausted Pexels must not switch it off.
 */
function bothMissed(unsplash: StockSearchOutcome, pexels: StockSearchOutcome): StockSearchOutcome {
  if (unsplash.ok || pexels.ok) return pexels
  return { ...unsplash, detail: `${unsplash.detail}; pexels: ${pexels.reason} — ${pexels.detail}` }
}

/** A photo for this promotion: Unsplash first, then Pexels when allowed. */
export async function findStockForPromotion(
  opts: { industry: string; purpose: string; services: string[]; context: string },
  allowPexels: boolean,
): Promise<StockSearchOutcome> {
  const unsplash = await findPhotoForPromotion(opts)
  if (unsplash.ok || !allowPexels) return unsplash
  console.log(`[photo-pool] ${opts.context}: unsplash miss (${unsplash.reason}) — ${unsplash.detail}; trying pexels.`)
  const pexels = await pexelsForPromotion(opts)
  if (pexels.ok) console.log(`[photo-pool] ${opts.context}: using a Pexels photo for "${pexels.queryUsed}".`)
  return bothMissed(unsplash, pexels)
}

/** The looser last-resort stock search (industry alone, then generic): Unsplash, then Pexels when allowed. */
export async function findFallbackStock(opts: { industry: string; context: string }, allowPexels: boolean): Promise<StockSearchOutcome> {
  const unsplash = await findFallbackStockPhoto(opts)
  if (unsplash.ok || !allowPexels) return unsplash
  const industryOnly = buildSearchQuery({ industry: opts.industry, purpose: "", services: [] })
  let last: StockSearchOutcome = unsplash
  for (const query of [industryOnly, GENERIC_FALLBACK_QUERY].filter((q, i, all) => q && all.indexOf(q) === i)) {
    last = { ...(await findPexelsPhoto({ query, context: opts.context, requireKeywordMatch: query !== GENERIC_FALLBACK_QUERY })), queryUsed: query }
    if (last.ok || (last.reason !== "thin_results" && last.reason !== "no_relevant_match")) break
  }
  return bothMissed(unsplash, last)
}

/**
 * The Instagram square (template mode) shows the same photo as its flyer, so
 * it carries the same credit — as a screen format, with links. No download
 * trigger here: it is the same use of the photo the flyer already reported.
 */
export function creditInstagramSquare(html: string, stock: StockPhoto[]): string {
  return injectPhotoAttribution(html, creditsUsedIn(html, stock), "screen")
}

/* -------------------------- Per-flyer source record ------------------------- */

const redis = Redis.fromEnv()

export type PhotoProvider = "unsplash" | "pexels" | "higgsfield" | "client"

/** One photo the pool offered the flyer, and where it came from. */
export interface PhotoCandidate {
  url: string
  provider: PhotoProvider
  /** Present for stock photos: what the credit and the compliance record need. */
  stock?: StockPhoto
}

export interface FlyerPhotoSource {
  /** "none" when the flyer ended up with no photo from the pool. */
  provider: PhotoProvider | "none"
  photoId?: string
  imageUrl?: string
  photographerName?: string
  photographerUrl?: string
  /** Pexels: the photo's page, which the credit links to. */
  pageUrl?: string
  /** Stock photos only: whether a credit was stamped on the flyer. */
  credited?: boolean
  recordedAt: string
}

export const photoSourceKey = (flyerId: string) => `flyer-photo-source:v1:${flyerId}`

/** What the finished flyer actually used, judged from its final HTML. */
export function photoSourceFor(html: string, candidates: PhotoCandidate[]): FlyerPhotoSource {
  const recordedAt = new Date().toISOString()
  const used = candidates.find((c) => photoUrlAppearsIn(html, c.url))
  if (!used) return { provider: "none", recordedAt }
  if (!used.stock) return { provider: used.provider, imageUrl: used.url, recordedAt }
  const s = used.stock
  return {
    provider: s.provider,
    photoId: s.id,
    imageUrl: s.url,
    photographerName: s.photographerName,
    photographerUrl: s.photographerUrl,
    pageUrl: s.provider === "pexels" ? s.pageUrl : undefined,
    credited: html.includes('class="oneflyer-photo-credit"'),
    recordedAt,
  }
}

/**
 * Records which provider a flyer's photo came from, so attribution and
 * licence compliance can be audited later (scripts or admin) without
 * re-parsing every stored flyer. No TTL: it is a compliance record for as
 * long as the flyer exists. Best-effort — never fails a delivered flyer.
 */
export async function recordFlyerPhotoSource(flyerId: string, html: string, candidates: PhotoCandidate[]): Promise<void> {
  const record = photoSourceFor(html, candidates)
  try {
    await redis.set(photoSourceKey(flyerId), record)
  } catch (err) {
    console.warn(`[photo-pool] flyer ${flyerId}: could not record photo source: ${err instanceof Error ? err.message : err}`)
  }
}

export async function getFlyerPhotoSource(flyerId: string): Promise<FlyerPhotoSource | null> {
  return (await redis.get<FlyerPhotoSource>(photoSourceKey(flyerId)).catch(() => null)) ?? null
}
