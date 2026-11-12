import { Redis } from "@upstash/redis"
import { getAgentProfile, getDeliverablesForEmail, getOrCreateClient, getTrackingRecord } from "@/lib/store"
import { isNopAgentAccount } from "@/lib/enterprise/agents-store"
import { offerPageFeaturesEnabled } from "@/lib/agent-pipeline/plan-features"
import { isOfferExpired } from "@/lib/offer-page-content"

/**
 * The dashboard's "time to refresh this offer" banner (Phase 4, hook 3 —
 * banner only, no email). A flyer is listed when its offer page:
 *
 *   - has passed the end date the owner set (expiresAt), or
 *   - hasn't changed in STALE_DAYS: no save, reset or undo on its offer page
 *     since then (offer-page-touched:v1:<flyerId>), or, never touched, the
 *     flyer itself is that old.
 *
 * A page edited before the touched key existed has no date to go by, so it is
 * never called stale: the owner may have edited it yesterday.
 *
 * Basic and up only (it points at the offer page, a Basic feature); never
 * enterprise org accounts or NOP agents.
 */

const redis = Redis.fromEnv()
const touchedKey = (flyerId: string) => `offer-page-touched:v1:${flyerId}`

export const STALE_DAYS = 60
const DAY_MS = 24 * 60 * 60 * 1000
/** The banner lists the most pressing few, not every old flyer. */
const MAX_ITEMS = 3

/** The owner saved, reset or undid this flyer's offer page. */
export async function markOfferPageTouched(flyerId: string, now: Date = new Date()): Promise<void> {
  await redis.set(touchedKey(flyerId), now.toISOString()).catch((err) => {
    console.warn(`[offer-refresh] could not mark ${flyerId} touched: ${err instanceof Error ? err.message : err}`)
  })
}

export type OfferRefreshItem =
  | { flyerId: string; title: string; reason: "expired"; endedOn: string }
  | { flyerId: string; title: string; reason: "stale"; since: string; days: number }

export interface OfferRefresh {
  items: OfferRefreshItem[]
  /** Pro, not paused: the banner also offers a new promotion from the flyer. */
  canNewPromotion: boolean
}

const NONE: OfferRefresh = { items: [], canNewPromotion: false }

export async function getOfferRefresh(email: string, now: Date = new Date()): Promise<OfferRefresh> {
  const [agent, nop, client] = await Promise.all([
    getAgentProfile(email).catch(() => null),
    isNopAgentAccount(email).catch(() => true),
    getOrCreateClient(email),
  ])
  if (agent?.orgId || nop) return NONE
  if (!offerPageFeaturesEnabled(client, false)) return NONE

  const { flyers } = await getDeliverablesForEmail(email)
  const candidates = flyers.filter((f) => f.status === "Ready" && f.trackingCode)
  const found = await Promise.all(
    candidates.map(async (f): Promise<OfferRefreshItem | null> => {
      const record = await getTrackingRecord(f.trackingCode!).catch(() => null)
      if (!record) return null
      if (isOfferExpired(record.expiresAt, now)) return { flyerId: f.id, title: f.title, reason: "expired", endedOn: record.expiresAt! }
      const touched = await redis.get<string>(touchedKey(f.id)).catch(() => null)
      const since = touched ?? (record.offerPageEdited ? null : record.createdAt)
      if (!since) return null
      const days = Math.floor((now.getTime() - Date.parse(since)) / DAY_MS)
      return days >= STALE_DAYS ? { flyerId: f.id, title: f.title, reason: "stale", since, days } : null
    }),
  )
  const items = found
    .filter((x): x is OfferRefreshItem => !!x)
    // Ended offers first (most recently ended first), then the longest unchanged.
    .sort((a, b) =>
      a.reason !== b.reason
        ? a.reason === "expired" ? -1 : 1
        : a.reason === "expired" && b.reason === "expired"
          ? b.endedOn.localeCompare(a.endedOn)
          : (b as { days: number }).days - (a as { days: number }).days,
    )
    .slice(0, MAX_ITEMS)
  return { items, canNewPromotion: client.plan === "pro" && !client.pausedAt }
}
