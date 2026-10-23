/**
 * READ-ONLY: how many stored flyers use an Unsplash photo with no credit.
 *
 *   npx tsx scripts/count-uncredited-unsplash.ts            # counts only
 *   npx tsx scripts/count-uncredited-unsplash.ts --list     # also list account / flyer id
 *   npx tsx scripts/count-uncredited-unsplash.ts --json out.json
 *
 * Against production, with the READ-ONLY token (it never needs to write):
 *
 *   read -rs RO_TOKEN
 *   UPSTASH_REDIS_REST_URL=https://<prod-db>.upstash.io UPSTASH_REDIS_REST_TOKEN="$RO_TOKEN" \
 *     BLOB_READ_WRITE_TOKEN= npx tsx scripts/count-uncredited-unsplash.ts
 *
 * Why: until the creditsUsedIn fix, template-built flyers (template mode,
 * 2026-09-16 on) wrote the photo URL attribute-escaped (&amp;), the credit
 * check looked for it raw, and the flyer shipped with no "Photo by … on
 * Unsplash" and no download ping.
 *
 * Every Redis call goes through a wrapper that only permits reads; it doesn't
 * import lib/store, so nothing can write a marker either.
 */
import "./load-env"
import { writeFileSync } from "node:fs"
import { Redis } from "@upstash/redis"
import { decodeFlyerHtml } from "../lib/flyer-data-url"
import { findUncreditedUnsplash, type StoredFlyer, type StoredCampaign } from "./lib/unsplash-credit-scan"

const raw = Redis.fromEnv()
const ALLOWED = new Set(["scan", "get", "type"])
const redis = new Proxy(raw, {
  get(target, prop, receiver) {
    const value = Reflect.get(target, prop, receiver)
    if (typeof value !== "function") return value
    if (typeof prop === "string" && !ALLOWED.has(prop)) {
      return () => {
        throw new Error(`count-uncredited-unsplash is read-only; refused redis.${prop}()`)
      }
    }
    return value.bind(target)
  },
}) as Redis

async function scanKeys(match: string): Promise<string[]> {
  const keys: string[] = []
  let cursor = "0"
  do {
    const [next, batch] = await redis.scan(cursor, { match, count: 500 })
    cursor = String(next)
    keys.push(...batch)
  } while (cursor !== "0")
  return keys
}

async function main() {
  const rows: { account: string; flyerId: string; document: string; createdAt: string | null; mode: string; photos: number }[] = []
  let flyersScanned = 0
  let documentsWithUnsplash = 0

  for (const key of await scanKeys("deliverables:*")) {
    if ((await redis.type(key)) !== "string") continue
    const email = key.slice("deliverables:".length)
    const stored = await redis.get<{ flyers?: StoredFlyer[] }>(key)
    if (!stored?.flyers?.length) continue
    const campaigns = (await redis.get<StoredCampaign[]>(`client:${email}:campaigns`)) ?? []
    for (const flyer of stored.flyers) {
      flyersScanned++
      for (const hit of findUncreditedUnsplash(flyer, campaigns, decodeFlyerHtml)) {
        if (hit.hasUnsplash) documentsWithUnsplash++
        if (!hit.uncredited) continue
        rows.push({ account: email, flyerId: flyer.id, document: hit.document, createdAt: hit.createdAt, mode: hit.mode, photos: hit.photoUrls.length })
      }
    }
  }

  const since = rows.filter((r) => r.createdAt && r.createdAt >= "2026-09-16")
  const before = rows.filter((r) => r.createdAt && r.createdAt < "2026-09-16")
  const undated = rows.filter((r) => !r.createdAt)
  const byMode = rows.reduce<Record<string, number>>((a, r) => ((a[r.mode] = (a[r.mode] ?? 0) + 1), a), {})
  const summary = {
    flyersScanned,
    documentsWithUnsplashPhoto: documentsWithUnsplash,
    uncreditedDocuments: rows.length,
    uncreditedFlyers: new Set(rows.map((r) => `${r.account} ${r.flyerId}`)).size,
    accountsAffected: new Set(rows.map((r) => r.account)).size,
    byDate: { since_2026_09_16: since.length, before_2026_09_16: before.length, undated: undated.length },
    byGenerationMode: byMode,
    byDocument: {
      print: rows.filter((r) => r.document === "downloadUrl").length,
      instagram: rows.filter((r) => r.document === "instagram").length,
    },
  }
  console.log(JSON.stringify(summary, null, 2))
  if (process.argv.includes("--list")) for (const r of rows) console.log(`  ${r.account}  ${r.flyerId}  ${r.document}  ${r.createdAt ?? "undated"}  ${r.mode}`)

  const i = process.argv.indexOf("--json")
  if (i >= 0 && process.argv[i + 1]) {
    writeFileSync(process.argv[i + 1], JSON.stringify({ summary, rows }, null, 2))
    console.log(`written: ${process.argv[i + 1]}`)
  }
  process.exit(0)
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
