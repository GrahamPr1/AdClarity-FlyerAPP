/**
 * READ-ONLY abuse scan: stored user-supplied values that reach flyer HTML (or
 * the public QR offer page) and look unsafe.
 *
 *   npx tsx scripts/audit-flyer-inputs.ts                 # print findings
 *   npx tsx scripts/audit-flyer-inputs.ts --json out.json # also write them to a file
 *
 * Point it at production by putting production's Redis REST URL and — ideally —
 * its READ-ONLY token in the environment (Upstash console → database → REST API
 * → "Read-Only Token"):
 *
 *   UPSTASH_REDIS_REST_URL=…  UPSTASH_REDIS_REST_TOKEN=<read-only token>  npx tsx scripts/audit-flyer-inputs.ts
 *
 * It never writes: it doesn't import lib/store (whose environment check can
 * write a marker), and every Redis call goes through a wrapper that only
 * permits read commands. With the read-only token, Upstash itself refuses any
 * write as well.
 *
 * What it flags
 *   URL fields (logoUrl, website, *Url / *Urls, photo/link fields): anything
 *     that isn't a plain absolute https:// URL.
 *   Every other text field: any value containing  <  >  "  javascript:  data:
 *     or  onerror  (case-insensitive). A literal " is often innocent (12"
 *     pizza) — those show as "text: contains \"" and can be skimmed.
 *
 * Where it looks — every stored record whose values reach a generated document
 * or the /r/<code> offer page:
 *   client:*:profile          canonical business profile (name, contact, brand.logoUrl, website, …)
 *   client:*:products         products / offers
 *   client:*:campaignDefaults legacy profile answers
 *   client:*:brand-profile    saved brand profile + contact
 *   client:*:businessName
 *   pipeline-state:*          normalized intake used for refine/regenerate
 *   intake:latest             latest raw onboarding submission
 *   tracking:*:record         QR offer-page record (headline, offer, cta, website, phone…)
 * Generated documents themselves (deliverables:*) are output, not input, and
 * are not scanned.
 */
import "./load-env"
import { writeFileSync } from "node:fs"
import { Redis } from "@upstash/redis"

// ---- Read-only Redis ----------------------------------------------------------
const raw = Redis.fromEnv()
const ALLOWED = new Set(["scan", "get", "type", "hgetall", "lrange", "smembers", "zrange", "dbsize"])
const redis = new Proxy(raw, {
  get(target, prop, receiver) {
    const value = Reflect.get(target, prop, receiver)
    if (typeof value !== "function") return value
    if (typeof prop === "string" && !ALLOWED.has(prop)) {
      return () => {
        throw new Error(`audit-flyer-inputs is read-only; refused redis.${prop}()`)
      }
    }
    return value.bind(target)
  },
}) as Redis

// ---- Rules ----------------------------------------------------------------------
const URL_FIELD = /(^|\.)(logo(url)?|website|url|urls|href|link|photourl|photourls|flyerphotourls|existingmaterialsurl|thumbnailurl)(\[\d+\])?$/i
const DANGER: [RegExp, string][] = [
  [/</, "contains <"],
  [/>/, "contains >"],
  [/"/, 'contains "'],
  [/javascript\s*:/i, "contains javascript:"],
  [/data\s*:/i, "contains data:"],
  [/onerror/i, "contains onerror"],
]

function urlProblem(value: string): string | null {
  const v = value.trim()
  if (!v) return null
  let u: URL
  try {
    u = new URL(v)
  } catch {
    return "url: not an absolute URL"
  }
  if (u.protocol !== "https:") return `url: scheme ${u.protocol}`
  if (u.username || u.password) return "url: has credentials"
  const extra = DANGER.filter(([re]) => re.test(v)).map(([, why]) => why)
  return extra.length ? `url: ${extra.join(", ")}` : null
}

function textProblem(value: string): string | null {
  const hits = DANGER.filter(([re]) => re.test(value)).map(([, why]) => why)
  return hits.length ? `text: ${hits.join(", ")}` : null
}

interface Finding {
  key: string
  path: string
  problem: string
  value: string
}
const findings: Finding[] = []

function walk(key: string, node: unknown, path: string) {
  if (typeof node === "string") {
    const problem = URL_FIELD.test(path) ? urlProblem(node) : textProblem(node)
    if (problem) findings.push({ key, path: path || "(value)", problem, value: JSON.stringify(node).slice(0, 160) })
    return
  }
  if (Array.isArray(node)) return node.forEach((v, i) => walk(key, v, `${path}[${i}]`))
  if (node && typeof node === "object") {
    for (const [k, v] of Object.entries(node)) walk(key, v, path ? `${path}.${k}` : k)
  }
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

const PATTERNS = [
  "client:*:profile",
  "client:*:products",
  "client:*:campaignDefaults",
  "client:*:brand-profile",
  "client:*:businessName",
  "pipeline-state:*",
  "tracking:*:record",
]

async function main() {
  const counts: Record<string, number> = {}
  for (const pattern of PATTERNS) {
    const keys = await scanKeys(pattern)
    counts[pattern] = keys.length
    for (const key of keys) {
      if ((await redis.type(key)) !== "string") continue
      walk(key, await redis.get<unknown>(key), "")
    }
  }
  const latest = await redis.get<unknown>("intake:latest")
  counts["intake:latest"] = latest ? 1 : 0
  if (latest) walk("intake:latest", latest, "")

  console.log("records scanned:", counts)
  console.log(`findings: ${findings.length}`)
  const byProblem = findings.reduce<Record<string, number>>((acc, f) => ((acc[f.problem] = (acc[f.problem] ?? 0) + 1), acc), {})
  console.log("by problem:", byProblem)
  for (const f of findings) console.log(`  ${f.key}  ${f.path}  [${f.problem}]  ${f.value}`)

  const out = process.argv[process.argv.indexOf("--json") + 1]
  if (process.argv.includes("--json") && out) {
    writeFileSync(out, JSON.stringify({ counts, byProblem, findings }, null, 2))
    console.log(`written: ${out}`)
  }
  process.exit(0)
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
