import { Redis } from "@upstash/redis"
import { createHash, randomBytes } from "node:crypto"
import { NOP_TEMPLATES, priceValues, readKitContent, versionStamp, type KitContent } from "./kit"

// NOP flyer content (prices, effective date) without a code deploy.
//
// The content.json shipped in the kit is version "bundled-{kit}" and is used
// until an admin publishes an upload. Uploaded versions are immutable; the
// live pointer says which one agents get. Only prices, program.effective_date
// and _note may differ from the bundled file — everything else (enroll
// domain, template mapping, logo, kit version, stamp format) is a code
// change. Any price change needs a LATER effective month, so the printed
// version stamp (MM/YYYY) tells old and new printed flyers apart.
//
//   nop-content:live          live version id ("c3"); absent = bundled
//   nop-content:seq           last version number issued
//   nop-content:v:{id}        ContentVersion (immutable)
//   nop-content:versions      version ids, newest first
//   nop-content:events        publish/rollback history, newest first
//   nop-content:draft:{id}    ContentDraft, 24 h TTL

const redis = Redis.fromEnv()

const LIVE_KEY = "nop-content:live"
const SEQ_KEY = "nop-content:seq"
const VERSIONS_KEY = "nop-content:versions"
const EVENTS_KEY = "nop-content:events"
const versionKey = (id: string) => `nop-content:v:${id}`
const draftKey = (id: string) => `nop-content:draft:${id}`
export const DRAFT_TTL_SECONDS = 24 * 60 * 60
export const MAX_CONTENT_BYTES = 64 * 1024

export interface LiveContent {
  version: string
  content: KitContent
  sha: string
}

export interface ContentVersion {
  id: string
  content: KitContent
  sha: string
  uploadedBy: string
  uploadedAt: string
  note: string
}

export interface ContentEvent {
  type: "publish" | "rollback"
  version: string
  /** The version that was live before. */
  from: string
  actor: string
  at: string
}

export interface ContentDraft {
  id: string
  content: KitContent
  sha: string
  uploadedBy: string
  uploadedAt: string
  /** The live version it was validated against. */
  baseVersion: string
  changes: string[]
  /** Templates whose preview rendered successfully with this draft. */
  previewed: string[]
}

export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex")
const canonical = (c: unknown) => JSON.stringify(c)

export function bundledContent(): LiveContent {
  const content = readKitContent()
  return { version: `bundled-${content.program.kit_version}`, content, sha: sha256(canonical(content)) }
}

// Read from Redis every time, deliberately not cached in memory: a process
// must never serve prices from a version Redis no longer holds under that id.
export async function getContentVersion(id: string): Promise<ContentVersion | null> {
  return (await redis.get<ContentVersion>(versionKey(id))) ?? null
}

/** What agents get right now. Read on every render, so a publish applies to the very next request. */
export async function getLiveContent(): Promise<LiveContent> {
  const id = await redis.get<string>(LIVE_KEY)
  if (!id) return bundledContent()
  const v = await getContentVersion(id)
  if (!v) {
    // Never serve nothing: fall back to the shipped prices, loudly.
    console.error(`[nop-content] live version ${id} is missing; serving the bundled content`)
    return bundledContent()
  }
  return { version: v.id, content: v.content, sha: v.sha }
}

// ---- Validation -------------------------------------------------------------

/** "$0.00" format: no commas or leading zeros, at most $9999.99 — the widest measured to fit every template's price box (NOP_ALL_*, three columns). */
export const PRICE_RE = /^\$(0|[1-9]\d{0,3})\.\d{2}$/
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/

function isRealDate(s: string): boolean {
  const m = DATE_RE.exec(s)
  if (!m) return false
  const d = new Date(`${s}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v)

/** Paths (dot-joined) a content upload may change. Everything else must equal the bundled file. */
function isEditablePath(path: string[]): boolean {
  if (path.length === 1 && path[0] === "_note") return true
  if (path.length === 2 && path[0] === "program" && path[1] === "effective_date") return true
  if (path.length === 3 && path[0] === "prices") return true
  return false
}

/** Every difference in shape, or in a value outside the editable fields, between candidate and bundled. */
function lockedDifferences(candidate: unknown, bundled: unknown, path: string[] = []): string[] {
  const where = path.join(".") || "(top level)"
  if (isEditablePath(path)) return typeof candidate === "string" ? [] : [`${where} must be text`]
  if (isObject(bundled)) {
    if (!isObject(candidate)) return [`${where} must be an object`]
    const out: string[] = []
    for (const k of Object.keys(bundled)) {
      if (!(k in candidate)) out.push(`${[...path, k].join(".")} is missing`)
      else out.push(...lockedDifferences(candidate[k], bundled[k], [...path, k]))
    }
    for (const k of Object.keys(candidate)) if (!(k in bundled)) out.push(`${[...path, k].join(".")} is not a field of content.json`)
    return out
  }
  if (canonical(candidate) !== canonical(bundled)) return [`${where} can't be changed here (it is a code change); it must stay ${canonical(bundled)}`]
  return []
}

const yearMonth = (date: string) => date.slice(0, 7)

export interface ContentValidation {
  ok: boolean
  errors: string[]
  /** Human-readable differences from the live version. */
  changes: string[]
  content?: KitContent
}

/**
 * Validates an uploaded content.json against the bundled schema and the
 * live version. Only prices, program.effective_date and _note may differ
 * from the bundled file; prices must be "$0.00" format and above zero;
 * every template's price fields must resolve; a price change needs a later
 * effective month than live; the effective date never moves backwards.
 */
export function validateContentUpload(
  raw: string,
  live: LiveContent,
  /** Every version ever published, and the bundled one: a printed MM/YYYY must always identify ONE set of prices. */
  history: { version: string; content: KitContent }[] = [],
  bundled: KitContent = readKitContent(),
): ContentValidation {
  const fail = (errors: string[]): ContentValidation => ({ ok: false, errors, changes: [] })
  if (raw.length > MAX_CONTENT_BYTES) return fail(["The file is too large for a content.json."])
  let candidate: unknown
  try {
    candidate = JSON.parse(raw)
  } catch (err) {
    return fail([`Not valid JSON: ${err instanceof Error ? err.message : String(err)}`])
  }
  if (!isObject(candidate)) return fail(["content.json must be a JSON object."])

  const errors = lockedDifferences(candidate, bundled)
  if (errors.length > 0) return fail(errors)
  const c = candidate as unknown as KitContent

  for (const [pkg, kinds] of Object.entries(c.prices)) {
    for (const [kind, value] of Object.entries(kinds)) {
      if (!PRICE_RE.test(value)) errors.push(`prices.${pkg}.${kind} is "${value}"; prices must look like $0.00 (dollar sign, digits, a dot, two decimals, no commas), at most $9999.99`)
      else if (Number(value.slice(1)) <= 0) errors.push(`prices.${pkg}.${kind} must be more than $0.00`)
    }
  }
  for (const id of NOP_TEMPLATES) {
    try {
      priceValues(c, id)
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err))
    }
  }
  const date = c.program.effective_date
  if (!isRealDate(date)) errors.push(`program.effective_date is "${date}"; it must be a real date as YYYY-MM-DD`)
  if (errors.length > 0) return fail(errors)

  const changes: string[] = []
  const priceChanges: string[] = []
  for (const [pkg, kinds] of Object.entries(c.prices)) {
    for (const [kind, value] of Object.entries(kinds)) {
      const was = live.content.prices[pkg]?.[kind]
      if (was !== value) priceChanges.push(`${pkg}.${kind}: ${was} → ${value}`)
    }
  }
  changes.push(...priceChanges)
  const liveDate = live.content.program.effective_date
  if (date !== liveDate) changes.push(`effective_date: ${liveDate} → ${date}`)
  const stampBefore = versionStamp(live.content, "NOP_P1_EN")
  const stampAfter = versionStamp(c, "NOP_P1_EN")
  if (stampBefore !== stampAfter) changes.push(`printed version stamp: ${stampBefore} → ${stampAfter}`)
  if ((c as unknown as { _note?: string })._note !== (live.content as unknown as { _note?: string })._note) changes.push("_note changed")

  if (date < liveDate) errors.push(`program.effective_date ${date} is earlier than the live ${liveDate}; it can't move backwards`)
  if (priceChanges.length > 0 && yearMonth(date) <= yearMonth(liveDate)) {
    errors.push(
      `Prices changed, so program.effective_date must be in a later month than the live ${liveDate}: the printed version stamp shows only MM/YYYY, and it has to change so old and new printed flyers can be told apart.`,
    )
  }
  const samePrices = (a: KitContent) => canonical(a.prices) === canonical(c.prices)
  for (const h of history) {
    if (yearMonth(h.content.program.effective_date) === yearMonth(date) && !samePrices(h.content)) {
      errors.push(`Version ${h.version} already printed the stamp ${versionStamp(h.content, "NOP_P1_EN")} with different prices; use a later effective month.`)
      break
    }
  }
  if (changes.length === 0) errors.push("This is identical to the live version; nothing to publish.")
  if (errors.length > 0) return { ok: false, errors, changes }
  return { ok: true, errors: [], changes, content: c }
}

// ---- Drafts, publishing, history ----------------------------------------------

export async function createDraft(content: KitContent, uploadedBy: string, live: LiveContent, changes: string[]): Promise<ContentDraft> {
  const draft: ContentDraft = {
    id: randomBytes(12).toString("base64url"),
    content,
    sha: sha256(canonical(content)),
    uploadedBy,
    uploadedAt: new Date().toISOString(),
    baseVersion: live.version,
    changes,
    previewed: [],
  }
  await redis.set(draftKey(draft.id), draft, { ex: DRAFT_TTL_SECONDS })
  return draft
}

export async function getDraft(id: string): Promise<ContentDraft | null> {
  if (!/^[A-Za-z0-9_-]{8,40}$/.test(id)) return null
  return (await redis.get<ContentDraft>(draftKey(id))) ?? null
}

export async function markDraftPreviewed(id: string, template: string): Promise<void> {
  const draft = await getDraft(id)
  if (!draft || draft.previewed.includes(template)) return
  const ttl = await redis.ttl(draftKey(id))
  await redis.set(draftKey(id), { ...draft, previewed: [...draft.previewed, template] }, { ex: ttl > 0 ? ttl : DRAFT_TTL_SECONDS })
}

export type PublishResult = { ok: true; version: string } | { ok: false; error: string; errors?: string[] }

/**
 * Publishes a draft as a new immutable version. Refused unless all 8
 * templates previewed successfully with it, and unless it still validates
 * against whatever is live NOW (someone may have published meanwhile).
 */
export async function publishDraft(draftId: string, actor: string, note: string): Promise<PublishResult> {
  const draft = await getDraft(draftId)
  if (!draft) return { ok: false, error: "This upload has expired (uploads last 24 hours). Upload it again." }
  const missing = NOP_TEMPLATES.filter((t) => !draft.previewed.includes(t))
  if (missing.length > 0) return { ok: false, error: `Preview all 8 flyers before publishing. Not yet previewed: ${missing.join(", ")}.` }
  const live = await getLiveContent()
  const check = validateContentUpload(canonical(draft.content), live, await contentHistory())
  if (!check.ok) return { ok: false, error: "This upload no longer passes against the live version (it changed since you uploaded).", errors: check.errors }

  const n = await redis.incr(SEQ_KEY)
  const id = `c${n}`
  const version: ContentVersion = { id, content: draft.content, sha: draft.sha, uploadedBy: draft.uploadedBy, uploadedAt: draft.uploadedAt, note }
  await redis.set(versionKey(id), version)
  await redis.lpush(VERSIONS_KEY, id)
  await redis.set(LIVE_KEY, id)
  await redis.lpush(EVENTS_KEY, { type: "publish", version: id, from: live.version, actor, at: new Date().toISOString() } satisfies ContentEvent)
  await redis.del(draftKey(draftId))
  return { ok: true, version: id }
}

/** Makes an earlier version (or the bundled content) live again. It is that version, unchanged, so its stamp matches its prices. */
export async function rollbackTo(versionId: string, actor: string): Promise<PublishResult> {
  const live = await getLiveContent()
  if (versionId === live.version) return { ok: false, error: `${versionId} is already live.` }
  const bundled = bundledContent()
  if (versionId === bundled.version) {
    await redis.del(LIVE_KEY)
  } else {
    if (!(await getContentVersion(versionId))) return { ok: false, error: `No content version ${versionId}.` }
    await redis.set(LIVE_KEY, versionId)
  }
  await redis.lpush(EVENTS_KEY, { type: "rollback", version: versionId, from: live.version, actor, at: new Date().toISOString() } satisfies ContentEvent)
  return { ok: true, version: versionId }
}

export async function listContentVersions(): Promise<ContentVersion[]> {
  const ids = (await redis.lrange<string>(VERSIONS_KEY, 0, -1)).map(String)
  const versions = await Promise.all(ids.map(getContentVersion))
  return versions.filter((v): v is ContentVersion => v !== null)
}

/** The bundled content and every published version, for the stamp-uniqueness rule. */
export async function contentHistory(): Promise<{ version: string; content: KitContent }[]> {
  const b = bundledContent()
  return [{ version: b.version, content: b.content }, ...(await listContentVersions()).map((v) => ({ version: v.id, content: v.content }))]
}

export async function listContentEvents(limit = 100): Promise<ContentEvent[]> {
  return redis.lrange<ContentEvent>(EVENTS_KEY, 0, limit - 1)
}
