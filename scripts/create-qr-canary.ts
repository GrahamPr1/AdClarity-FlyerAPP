/**
 * Creates the canary QR record the legacy-domain health check scans:
 * /r/health-canary. Run ONCE per environment; it never overwrites (SET NX),
 * so re-running is harmless.
 *
 *   npx tsx scripts/create-qr-canary.ts            # show what it would write
 *   npx tsx scripts/create-qr-canary.ts --apply    # write it
 *
 * Needs the target environment's Redis REST URL and a WRITE token, plus
 * APP_ENV matching the database's marker (the store refuses a mismatch):
 *
 *   APP_ENV=production UPSTASH_REDIS_REST_URL=… UPSTASH_REDIS_REST_TOKEN=… \
 *     npx tsx scripts/create-qr-canary.ts --apply
 *
 * The record belongs to no client (canary@oneflyer.invalid), so it appears on
 * no dashboard, and its scans are only ever the health check's own.
 */
import "./load-env"
import { Redis } from "@upstash/redis"
import { assertRedisMatchesEnvironment } from "../lib/store"
import type { TrackingRecord } from "../lib/types"

export const CANARY_CODE = "health-canary"
const APPLY = process.argv.includes("--apply")

const record: TrackingRecord = {
  email: "canary@oneflyer.invalid",
  flyerId: "health-canary",
  businessName: "OneFlyer QR health check",
  headline: "QR health check",
  offer: "If you can read this, printed OneFlyer QR codes are resolving.",
  cta: "Call now",
  disclaimer: "Used by OneFlyer's automated uptime check. Not a real offer.",
  phone: "(000) 000-0000",
  website: null,
  createdAt: new Date().toISOString(),
  channelLabel: null,
  parentCode: null,
}

async function main() {
  await assertRedisMatchesEnvironment()
  const redis = Redis.fromEnv()
  const key = `tracking:${CANARY_CODE}:record`
  const existing = await redis.get(key)
  if (existing) {
    console.log(`${key} already exists — nothing to do.`)
    return
  }
  if (!APPLY) {
    console.log(`DRY RUN — would create ${key}:`, record)
    return
  }
  const created = await redis.set(key, record, { nx: true })
  console.log(created ? `created ${key}` : `${key} appeared meanwhile — left as is`)
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err)
    process.exit(1)
  })
