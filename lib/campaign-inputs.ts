import { Redis } from "@upstash/redis"
import { getAgentProfile } from "@/lib/store"
import type { NormalizedIntake } from "@/lib/agent-pipeline/schemas/intake"
import type { FlyerRequest } from "@/lib/agent-pipeline/schemas/flyer"

/**
 * What each flyer was made FROM, kept per flyer so a later "new promotion
 * from this campaign" (Pro) can reuse the business, brand, photos and format
 * and change only the offer.
 *
 * pipeline-state:<email> already holds the inputs, but only for an account's
 * LATEST run, so it can't answer for a flyer made three campaigns ago.
 * Written by continuePipelineFromIntake at the start of every run; flyers made
 * before this existed have no record, and the feature falls back to the saved
 * Business Profile (it says so in the UI).
 *
 * Not written for enterprise org accounts: the feature is not offered to them,
 * so there is nothing to keep. NOP agents never reach the pipeline.
 */

const redis = Redis.fromEnv()
const key = (flyerId: string) => `campaign-input:v1:${flyerId}`

export interface CampaignInput {
  /** The intake as generated, without its batch of requests (see `request`). */
  intake: NormalizedIntake
  /** This flyer's own request: its offer, notes and format. */
  request: FlyerRequest
  savedAt: string
}

export async function saveCampaignInputs(email: string, intake: NormalizedIntake, requests: FlyerRequest[]): Promise<void> {
  try {
    if ((await getAgentProfile(email).catch(() => null))?.orgId) return
    const savedAt = new Date().toISOString()
    const base = { ...intake, flyerRequests: [] as NormalizedIntake["flyerRequests"] }
    await Promise.all(requests.map((request) => redis.set(key(request.id), { intake: base, request, savedAt } satisfies CampaignInput)))
  } catch (err) {
    // Never fails a generation: the feature falls back to the Business Profile.
    console.warn(`[campaign-inputs] not saved for ${requests.map((r) => r.id).join(",")}: ${err instanceof Error ? err.message : err}`)
  }
}

export async function getCampaignInput(flyerId: string): Promise<CampaignInput | null> {
  return (await redis.get<CampaignInput>(key(flyerId)).catch(() => null)) ?? null
}
