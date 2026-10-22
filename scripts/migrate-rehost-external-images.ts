/**
 * ONE-TIME MIGRATION — copy external logos / AI photos already stored before
 * rehosting existed into our Blob store, and point stored data at the copies.
 *
 *   npx tsx scripts/migrate-rehost-external-images.ts            # dry run (default): report only
 *   npx tsx scripts/migrate-rehost-external-images.ts --apply    # rehost + rewrite
 *   ... --apply --clear-failed   # also blank a profile/intake logo whose rehost failed
 *
 * Needs the TARGET environment's Redis + Blob credentials in the process env
 * (UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN / BLOB_READ_WRITE_TOKEN,
 * and APP_ENV matching the database's environment marker — the store refuses
 * to touch a database labelled for another environment). Production's values
 * are "sensitive" in Vercel and can't be pulled; take them from the Upstash
 * and Vercel Blob dashboards into a temporary env file, never into .env.local.
 *
 * WHY. Documents used to reference a logo at the client's own website, or an
 * AI photo at Higgsfield's host. The PDF renderer now fetches only from an
 * allow-list (lib/pdf/request-policy.ts) that includes neither, so those
 * images are missing from PDFs of older flyers (they still show on screen) —
 * and future campaigns from a profile with an external logo would get no logo
 * in the PDF either. Rehosting fixes both.
 *
 * WHAT IT TOUCHES — every place an external image URL can be stored:
 *   client:<email>:profile          brand.logoUrl                (canonical profile)
 *   pipeline-state:<email>          intake.brandAssets.logoUrl   (used by refine/regenerate)
 *   intake:latest                   logoUrl                      (latest raw submission)
 *   deliverables:<email>            flyers[].downloadUrl and
 *                                   flyers[].repurposed.instagramDownloadUrl
 *                                   (data:text/html documents — <img src> / url() rewritten)
 *
 * "External" = an https image URL that is NOT our photo route, NOT
 * images.unsplash.com (Unsplash requires hotlinking; it's on the allow-list),
 * NOT Google Fonts, and NOT a data: URL.
 *
 * SAFETY. Each unique URL is fetched once, through the same guarded fetcher
 * as live traffic (https only, no private IPs, png/jpeg/webp only, 2 MB, 5 s).
 * Records are re-read immediately before each write and only the URL strings
 * are replaced. Idempotent: our own URLs are skipped, so a re-run only retries
 * failures. A failed rehost leaves the stored value as it was (and is listed)
 * unless --clear-failed is passed, which blanks profile/intake logos only —
 * never document HTML. A JSON report is written to
 * migrate-rehost-report-<timestamp>.json.
 */
import "./load-env"
import { writeFileSync } from "node:fs"
import { Redis } from "@upstash/redis"
import { assertRedisMatchesEnvironment } from "../lib/store"
import { decodeFlyerHtml, encodeFlyerHtml } from "../lib/flyer-data-url"
import { isOwnPhotoUrl, rehostExternalImage, type RehostPurpose } from "../lib/rehost-image"

const APPLY = process.argv.includes("--apply")
const CLEAR_FAILED = process.argv.includes("--clear-failed")
const redis = Redis.fromEnv()

const ALWAYS_OK_HOSTS = new Set(["images.unsplash.com", "fonts.googleapis.com", "fonts.gstatic.com"])

function isExternalImage(url: string | null | undefined): url is string {
  if (!url || url.startsWith("data:")) return false
  try {
    const u = new URL(url)
    if (u.protocol !== "https:" && u.protocol !== "http:") return false
    if (ALWAYS_OK_HOSTS.has(u.hostname)) return false
    return !isOwnPhotoUrl(u.href)
  } catch {
    return false
  }
}

const purposeFor = (url: string): RehostPurpose => (/(^|\.)higgsfield\.ai$/.test(new URL(url).hostname) ? "ai-photo" : "logo")

// One fetch per unique URL across the whole run.
const cache = new Map<string, string | null>()
async function rehostOnce(url: string): Promise<string | null> {
  if (!APPLY) return null
  if (!cache.has(url)) cache.set(url, await rehostExternalImage(url, purposeFor(url)))
  return cache.get(url)!
}

const hostOf = (url: string) => {
  try {
    return new URL(url).host
  } catch {
    return "(unparseable)"
  }
}

interface Finding {
  key: string
  field: string
  host: string
  outcome: "would_rehost" | "rehosted" | "failed_left_as_is" | "failed_cleared"
}
const findings: Finding[] = []

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

/** Rewrites one stored logo field; returns the value to store. */
async function migrateLogoField(key: string, field: string, value: string): Promise<string | null> {
  if (!APPLY) {
    findings.push({ key, field, host: hostOf(value), outcome: "would_rehost" })
    return value
  }
  const copy = await rehostOnce(value)
  if (copy) {
    findings.push({ key, field, host: hostOf(value), outcome: "rehosted" })
    return copy
  }
  findings.push({ key, field, host: hostOf(value), outcome: CLEAR_FAILED ? "failed_cleared" : "failed_left_as_is" })
  return CLEAR_FAILED ? null : value
}

/** All external image URLs referenced by <img src> or CSS url() in a document. */
function externalImagesIn(html: string): string[] {
  const urls = new Set<string>()
  for (const m of html.matchAll(/\bsrc\s*=\s*["']([^"']+)["']/gi)) urls.add(m[1].replace(/&amp;/g, "&"))
  for (const m of html.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/gi)) urls.add(m[1].replace(/&amp;/g, "&"))
  return [...urls].filter(isExternalImage)
}

/** Replaces raw and &amp;-escaped occurrences of each URL. */
function rewriteHtml(html: string, map: Map<string, string>): string {
  let out = html
  for (const [from, to] of map) {
    out = out.split(from).join(to)
    const fromEsc = from.replace(/&/g, "&amp;")
    if (fromEsc !== from) out = out.split(fromEsc).join(to.replace(/&/g, "&amp;"))
  }
  return out
}

async function migrateDocument(key: string, field: string, dataUrl: string | undefined): Promise<string | undefined> {
  if (!dataUrl?.startsWith("data:text/html")) return dataUrl
  const html = decodeFlyerHtml(dataUrl)
  if (!html) return dataUrl
  const externals = externalImagesIn(html)
  if (!externals.length) return dataUrl
  const map = new Map<string, string>()
  for (const url of externals) {
    if (!APPLY) {
      findings.push({ key, field, host: hostOf(url), outcome: "would_rehost" })
      continue
    }
    const copy = await rehostOnce(url)
    findings.push({ key, field, host: hostOf(url), outcome: copy ? "rehosted" : "failed_left_as_is" })
    if (copy) map.set(url, copy)
  }
  return map.size ? encodeFlyerHtml(rewriteHtml(html, map)) : dataUrl
}

async function main() {
  await assertRedisMatchesEnvironment()
  console.log(`${APPLY ? "APPLY" : "DRY RUN"}${CLEAR_FAILED ? " + clear-failed" : ""}`)

  // 1. Canonical profiles
  for (const key of await scanKeys("client:*:profile")) {
    const profile = await redis.get<{ brand?: { logoUrl?: string | null } }>(key)
    const logo = profile?.brand?.logoUrl
    if (!isExternalImage(logo)) continue
    const next = await migrateLogoField(key, "brand.logoUrl", logo)
    if (APPLY && next !== logo) {
      const fresh = await redis.get<{ brand: { logoUrl: string | null } }>(key)
      if (fresh?.brand?.logoUrl === logo) await redis.set(key, { ...fresh, brand: { ...fresh.brand, logoUrl: next } })
    }
  }

  // 2. Pipeline state (refine / regenerate read the logo from here)
  for (const key of await scanKeys("pipeline-state:*")) {
    const state = await redis.get<{ intake?: { brandAssets?: { logoUrl?: string | null } } }>(key)
    const logo = state?.intake?.brandAssets?.logoUrl
    if (!isExternalImage(logo)) continue
    const next = await migrateLogoField(key, "intake.brandAssets.logoUrl", logo)
    if (APPLY && next !== logo) {
      const fresh = await redis.get<{ intake: { brandAssets: { logoUrl: string | null } } }>(key)
      if (fresh?.intake?.brandAssets?.logoUrl === logo) {
        await redis.set(key, { ...fresh, intake: { ...fresh.intake, brandAssets: { ...fresh.intake.brandAssets, logoUrl: next } } })
      }
    }
  }

  // 3. Latest raw submission
  const intake = await redis.get<{ logoUrl?: string }>("intake:latest")
  if (isExternalImage(intake?.logoUrl)) {
    const next = await migrateLogoField("intake:latest", "logoUrl", intake!.logoUrl!)
    if (APPLY && next !== intake!.logoUrl) await redis.set("intake:latest", { ...intake, logoUrl: next ?? undefined })
  }

  // 4. Generated documents
  type Flyer = { id: string; downloadUrl?: string; repurposed?: { instagramDownloadUrl?: string } }
  for (const key of await scanKeys("deliverables:*")) {
    const stored = await redis.get<{ flyers?: Flyer[] }>(key)
    if (!stored?.flyers?.length) continue
    const replacements = new Map<string, { downloadUrl?: string; instagram?: string }>()
    for (const f of stored.flyers) {
      const downloadUrl = await migrateDocument(key, `flyers[${f.id}].downloadUrl`, f.downloadUrl)
      const instagram = await migrateDocument(key, `flyers[${f.id}].repurposed.instagramDownloadUrl`, f.repurposed?.instagramDownloadUrl)
      if (downloadUrl !== f.downloadUrl || instagram !== f.repurposed?.instagramDownloadUrl) replacements.set(f.id, { downloadUrl, instagram })
    }
    if (!APPLY || !replacements.size) continue
    // Re-read and patch only the changed documents, so a flyer the pipeline
    // updated in the meantime keeps its newer state.
    const fresh = await redis.get<{ flyers: Flyer[] }>(key)
    if (!fresh?.flyers) continue
    const flyers = fresh.flyers.map((f) => {
      const r = replacements.get(f.id)
      const original = stored.flyers!.find((o) => o.id === f.id)
      if (!r || !original) return f
      return {
        ...f,
        ...(f.downloadUrl === original.downloadUrl ? { downloadUrl: r.downloadUrl } : {}),
        ...(f.repurposed && f.repurposed.instagramDownloadUrl === original.repurposed?.instagramDownloadUrl
          ? { repurposed: { ...f.repurposed, instagramDownloadUrl: r.instagram } }
          : {}),
      }
    })
    await redis.set(key, { ...fresh, flyers })
  }

  const byOutcome = findings.reduce<Record<string, number>>((acc, f) => ((acc[f.outcome] = (acc[f.outcome] ?? 0) + 1), acc), {})
  const byHost = findings.reduce<Record<string, number>>((acc, f) => ((acc[f.host] = (acc[f.host] ?? 0) + 1), acc), {})
  console.log("outcomes:", byOutcome)
  console.log("external hosts:", byHost)
  const report = `migrate-rehost-report-${Date.now()}.json`
  writeFileSync(report, JSON.stringify({ apply: APPLY, clearFailed: CLEAR_FAILED, byOutcome, byHost, findings }, null, 2))
  console.log(`report: ${report}`)
  process.exit(0)
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
