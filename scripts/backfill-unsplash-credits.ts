/**
 * BACKFILL — add the missing "Photo by … on Unsplash" credit to stored flyers
 * that use an Unsplash photo without one (see count-uncredited-unsplash.ts
 * for why they exist).
 *
 *   npx tsx scripts/backfill-unsplash-credits.ts               # DRY RUN (default): resolve, report, write nothing
 *   npx tsx scripts/backfill-unsplash-credits.ts --no-lookup   # dry run without calling Unsplash
 *   npx tsx scripts/backfill-unsplash-credits.ts --apply       # add credits + fire download pings
 *
 * Needs UNSPLASH_ACCESS_KEY (the dry run's lookups are reads against
 * Unsplash's API and count toward its hourly limit) and the target Redis:
 * read-only token for a dry run, write token plus APP_ENV matching the
 * database marker for --apply.
 *
 * WHO TOOK IT. The photographer isn't stored with the flyer; the pipeline used
 * it once and dropped it. It's recovered from the image URL: Unsplash's
 * `ixid` parameter encodes the search query and result position, so the
 * script repeats that search and matches the image. A photo that no longer
 * appears in those results is reported as unresolved and left alone; a
 * credit without the photographer's name wouldn't meet Unsplash's guidelines.
 *
 * WHAT --apply DOES, per document with every photo resolved:
 *   - injects the credit block exactly as new flyers get it
 *     (injectPhotoAttribution; print or screen wording from the format)
 *   - fires Unsplash's download ping once per photo, as new flyers do
 *   - re-reads the record before writing and replaces only documents that
 *     haven't changed since they were read
 * Already-printed copies obviously stay as they are. Idempotent: documents
 * that have a credit are skipped. Stops early when Unsplash's remaining
 * hourly quota gets low; re-run later to continue.
 */
import "./load-env"
import { writeFileSync } from "node:fs"
import { Redis } from "@upstash/redis"
import { assertRedisMatchesEnvironment } from "../lib/store"
import { decodeFlyerHtml, encodeFlyerHtml } from "../lib/flyer-data-url"
import { injectPhotoAttribution, type PhotoCredit } from "../lib/agent-pipeline/flyer-html"
import { getFormat } from "../lib/agent-pipeline/formats"
import { findUncreditedUnsplash, photoSlug, searchFromIxid, type StoredCampaign, type StoredFlyer } from "./lib/unsplash-credit-scan"

const APPLY = process.argv.includes("--apply")
const LOOKUP = !process.argv.includes("--no-lookup")
const KEY = process.env.UNSPLASH_ACCESS_KEY
const QUOTA_FLOOR = 5
const redis = Redis.fromEnv()

if ((APPLY || LOOKUP) && !KEY) {
  console.error("UNSPLASH_ACCESS_KEY is required (or pass --no-lookup for a dry run that skips resolving photographers).")
  process.exit(2)
}

type Resolved = PhotoCredit & { downloadLocation: string }
const headers = () => ({ Authorization: `Client-ID ${KEY}`, "Accept-Version": "v1" })
let quotaLow = false

// One search per (query, page) across the whole run.
const searchCache = new Map<string, { urls: { regular: string }; user: { name: string; links: { html: string } }; links: { download_location: string } }[]>()
async function resolve(photoUrl: string): Promise<Resolved | null> {
  const from = searchFromIxid(photoUrl)
  const slug = photoSlug(photoUrl)
  if (!from || !slug || quotaLow) return null
  const pages = [...new Set([Math.max(1, Math.ceil(from.position / 10)), 1])]
  for (const page of pages) {
    const cacheKey = `${from.query}|${page}`
    if (!searchCache.has(cacheKey)) {
      const res = await fetch(
        `https://api.unsplash.com/search/photos?query=${encodeURIComponent(from.query)}&page=${page}&per_page=10&orientation=landscape&content_filter=high`,
        { headers: headers() },
      )
      const remaining = Number(res.headers.get("x-ratelimit-remaining") ?? NaN)
      if (Number.isFinite(remaining) && remaining <= QUOTA_FLOOR) quotaLow = true
      if (!res.ok) return null
      searchCache.set(cacheKey, ((await res.json()) as { results?: [] }).results ?? [])
    }
    const match = searchCache.get(cacheKey)!.find((r) => photoSlug(r.urls.regular) === slug)
    if (match) {
      return { url: photoUrl, photographerName: match.user.name, photographerUrl: match.user.links.html, downloadLocation: match.links.download_location }
    }
  }
  return null
}

async function ping(r: Resolved): Promise<boolean> {
  const res = await fetch(r.downloadLocation, { headers: headers() }).catch(() => null)
  return !!res?.ok
}

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

interface Row {
  account: string
  flyerId: string
  document: "downloadUrl" | "instagram"
  outcome: "would_credit" | "credited" | "unresolved" | "not_looked_up" | "changed_meanwhile"
  photographers?: string[]
}

async function main() {
  if (APPLY) await assertRedisMatchesEnvironment()
  console.log(`${APPLY ? "APPLY" : "DRY RUN"}${LOOKUP ? "" : " (no lookup)"}`)
  const rows: Row[] = []
  let pings = 0

  for (const key of await scanKeys("deliverables:*")) {
    const account = key.slice("deliverables:".length)
    const stored = await redis.get<{ flyers?: StoredFlyer[] }>(key)
    if (!stored?.flyers?.length) continue
    const campaigns = (await redis.get<StoredCampaign[]>(`client:${account}:campaigns`)) ?? []

    const updates = new Map<string, { document: Row["document"]; before: string; after: string; credits: Resolved[] }[]>()
    for (const flyer of stored.flyers) {
      for (const f of findUncreditedUnsplash(flyer, campaigns, decodeFlyerHtml)) {
        if (!f.uncredited) continue
        if (!LOOKUP) {
          rows.push({ account, flyerId: flyer.id, document: f.document, outcome: "not_looked_up" })
          continue
        }
        const credits = (await Promise.all(f.photoUrls.map(resolve))).filter((c): c is Resolved => !!c)
        if (credits.length !== f.photoUrls.length) {
          rows.push({ account, flyerId: flyer.id, document: f.document, outcome: "unresolved" })
          continue
        }
        const photographers = credits.map((c) => c.photographerName)
        if (!APPLY) {
          rows.push({ account, flyerId: flyer.id, document: f.document, outcome: "would_credit", photographers })
          continue
        }
        const before = f.document === "downloadUrl" ? flyer.downloadUrl! : flyer.repurposed!.instagramDownloadUrl!
        const medium = f.document === "instagram" ? "screen" : getFormat(f.formatId).medium
        const after = encodeFlyerHtml(injectPhotoAttribution(decodeFlyerHtml(before)!, credits, medium))
        updates.set(flyer.id, [...(updates.get(flyer.id) ?? []), { document: f.document, before, after, credits }])
      }
    }
    if (!APPLY || updates.size === 0) continue

    // Re-read, and replace only documents still exactly as scanned.
    const fresh = await redis.get<{ flyers: StoredFlyer[] } & Record<string, unknown>>(key)
    if (!fresh?.flyers) continue
    const applied: { flyerId: string; document: Row["document"]; credits: Resolved[] }[] = []
    const flyers = fresh.flyers.map((f) => {
      let next = f
      for (const u of updates.get(f.id) ?? []) {
        const current = u.document === "downloadUrl" ? next.downloadUrl : next.repurposed?.instagramDownloadUrl
        if (current !== u.before) {
          rows.push({ account, flyerId: f.id, document: u.document, outcome: "changed_meanwhile" })
          continue
        }
        next = u.document === "downloadUrl" ? { ...next, downloadUrl: u.after } : { ...next, repurposed: { ...next.repurposed, instagramDownloadUrl: u.after } }
        applied.push({ flyerId: f.id, document: u.document, credits: u.credits })
      }
      return next
    })
    if (!applied.length) continue
    await redis.set(key, { ...fresh, flyers })
    for (const a of applied) {
      rows.push({ account, flyerId: a.flyerId, document: a.document, outcome: "credited", photographers: a.credits.map((c) => c.photographerName) })
      for (const c of a.credits) if (await ping(c)) pings++
    }
  }

  const byOutcome = rows.reduce<Record<string, number>>((a, r) => ((a[r.outcome] = (a[r.outcome] ?? 0) + 1), a), {})
  console.log("documents:", byOutcome)
  if (APPLY) console.log(`download pings fired: ${pings}`)
  if (quotaLow) console.log("Stopped resolving early: Unsplash's hourly quota is nearly used. Re-run later to continue.")
  const report = `backfill-unsplash-credits-${Date.now()}.json`
  writeFileSync(report, JSON.stringify({ apply: APPLY, byOutcome, pings, rows }, null, 2))
  console.log(`report: ${report}`)
  process.exit(0)
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
