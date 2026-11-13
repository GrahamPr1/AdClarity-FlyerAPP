import { Redis } from "@upstash/redis"
import { isNopAgentAccount } from "./enterprise/agents-store"
import { buildSearchQuery, buildSpecificSearchQuery, findFallbackStockPhoto, findPhotoForPromotion, GENERIC_FALLBACK_QUERY, type UnsplashPhoto } from "./unsplash"
import { findPexelsPhoto, type PexelsPhoto, type PexelsSearchOutcome } from "./pexels"
import { findPixabayPhoto, type PixabayPhoto } from "./pixabay"
import { creditsUsedIn, injectPhotoAttribution, photoUrlAppearsIn } from "./agent-pipeline/flyer-html"

/**
 * The stock-photo half of the photo chain, in order:
 *
 *   Pixabay -> Unsplash -> Pexels -> (Higgsfield, Pro opt-in only; see pipeline.ts) -> no-photo layout
 *
 * Pixabay is first since 2026-11-13: the Unsplash app was disabled and its
 * key answers 401, so Unsplash now fails through (its code is kept for when
 * it returns). Pexels stays dormant without a key.
 *
 * Pixabay and Pexels are for PUBLIC accounts only (extraStockAllowedFor).
 * Enterprise org and NOP accounts keep exactly the source their org approved,
 * Unsplash — which, while it is disabled, means no stock photo for them.
 */

export type StockPhoto = UnsplashPhoto | PexelsPhoto | PixabayPhoto

export type StockSearchOutcome = ({ ok: true; photo: StockPhoto } | Extract<PexelsSearchOutcome, { ok: false }>) & { queryUsed: string }

/**
 * Whether Pixabay and Pexels may be used for this account. An explicit
 * account-type check, not a consequence of fallback order: enterprise
 * accounts (an agent profile with an org) and NOP agents keep exactly the
 * photo sources their org approved, which is Unsplash only. Fails closed — if
 * the NOP lookup errors, the account is treated as an agent.
 */
export async function extraStockAllowedFor(email: string, isEnterpriseAccount: boolean): Promise<boolean> {
  if (isEnterpriseAccount) return false
  const isNopAgent = await isNopAgentAccount(email).catch(() => true)
  return !isNopAgent
}

/** The name pipeline.ts uses (gates.allowPexels); it now covers Pixabay too. */
export const pexelsAllowedFor = extraStockAllowedFor

/** Pixabay with the same specific-then-broad queries Unsplash uses. */
async function pixabayForPromotion(opts: { industry: string; purpose: string; services: string[]; context: string }): Promise<StockSearchOutcome> {
  const queries = [buildSpecificSearchQuery(opts), buildSearchQuery(opts)].filter((q, i, all) => q && all.indexOf(q) === i)
  let last: StockSearchOutcome = { ok: false, reason: "thin_results", detail: "no usable query", queryUsed: "" }
  for (const query of queries) {
    last = { ...(await findPixabayPhoto({ query, context: opts.context })), queryUsed: query }
    if (last.ok || (last.reason !== "thin_results" && last.reason !== "no_relevant_match")) return last
  }
  return last
}

/**
 * Every provider missed. The caller decides from the reported reason whether
 * a broader search is worth a request (only after thin_results or
 * no_relevant_match), so the reason reported is the first provider's, in
 * order, whose miss a broader search could fix; failing that, the primary's.
 * A disabled Unsplash, a dormant Pexels or an unconfigured Pixabay must not
 * switch the broader search off for a provider that merely came up thin.
 * Every provider's outcome is in the detail.
 */
function allMissed(primary: StockSearchOutcome, others: [string, StockSearchOutcome][]): StockSearchOutcome {
  if (primary.ok) return primary
  const retryable = (o: StockSearchOutcome) => !o.ok && (o.reason === "thin_results" || o.reason === "no_relevant_match")
  const reported = [primary, ...others.map(([, o]) => o)].find(retryable) ?? primary
  if (reported.ok) return reported
  const rest = others.map(([name, o]) => (o.ok ? "" : `; ${name}: ${o.reason} — ${o.detail}`)).join("")
  return { ...reported, detail: `pixabay: ${primary.ok ? "ok" : `${primary.reason} — ${primary.detail}`}${rest}` }
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
 * A photo for this promotion. Public accounts: Pixabay, then Unsplash, then
 * Pexels. Enterprise and NOP (allowExtra false): Unsplash only.
 */
export async function findStockForPromotion(
  opts: { industry: string; purpose: string; services: string[]; context: string },
  allowExtra: boolean,
): Promise<StockSearchOutcome> {
  if (!allowExtra) return findPhotoForPromotion(opts)
  const pixabay = await pixabayForPromotion(opts)
  if (pixabay.ok) {
    console.log(`[photo-pool] ${opts.context}: using a Pixabay photo for "${pixabay.queryUsed}".`)
    return pixabay
  }
  console.log(`[photo-pool] ${opts.context}: pixabay miss (${pixabay.reason}) — ${pixabay.detail}; trying unsplash.`)
  const unsplash = await findPhotoForPromotion(opts)
  if (unsplash.ok) return unsplash
  console.log(`[photo-pool] ${opts.context}: unsplash miss (${unsplash.reason}) — ${unsplash.detail}; trying pexels.`)
  const pexels = await pexelsForPromotion(opts)
  if (pexels.ok) {
    console.log(`[photo-pool] ${opts.context}: using a Pexels photo for "${pexels.queryUsed}".`)
    return pexels
  }
  return allMissed(pixabay, [["unsplash", unsplash], ["pexels", pexels]])
}

/** One provider's last-resort search: industry alone, then the generic query. */
async function fallbackQueries(
  industry: string,
  find: (query: string, requireKeywordMatch: boolean) => Promise<Extract<StockSearchOutcome, { ok: false }> | Omit<StockSearchOutcome, "queryUsed">>,
): Promise<StockSearchOutcome> {
  const industryOnly = buildSearchQuery({ industry, purpose: "", services: [] })
  let last: StockSearchOutcome = { ok: false, reason: "thin_results", detail: "no usable query", queryUsed: "" }
  for (const query of [industryOnly, GENERIC_FALLBACK_QUERY].filter((q, i, all) => q && all.indexOf(q) === i)) {
    last = { ...(await find(query, query !== GENERIC_FALLBACK_QUERY)), queryUsed: query } as StockSearchOutcome
    if (last.ok || (last.reason !== "thin_results" && last.reason !== "no_relevant_match")) break
  }
  return last
}

/** The looser last-resort stock search (industry alone, then generic), in the same provider order. */
export async function findFallbackStock(opts: { industry: string; context: string }, allowExtra: boolean): Promise<StockSearchOutcome> {
  if (!allowExtra) return findFallbackStockPhoto(opts)
  const pixabay = await fallbackQueries(opts.industry, (query, requireKeywordMatch) => findPixabayPhoto({ query, context: opts.context, requireKeywordMatch }))
  if (pixabay.ok) return pixabay
  const unsplash = await findFallbackStockPhoto(opts)
  if (unsplash.ok) return unsplash
  const pexels = await fallbackQueries(opts.industry, (query, requireKeywordMatch) => findPexelsPhoto({ query, context: opts.context, requireKeywordMatch }))
  if (pexels.ok) return pexels
  return allMissed(pixabay, [["unsplash", unsplash], ["pexels", pexels]])
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

export type PhotoProvider = "unsplash" | "pexels" | "pixabay" | "higgsfield" | "client"

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
  /** Pexels and Pixabay: the photo's page, which the credit links to. */
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
    pageUrl: s.provider === "pexels" || s.provider === "pixabay" ? s.pageUrl : undefined,
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
