import { Redis } from "@upstash/redis"
import type { BusinessCategory, BusinessProfileRecord, ClientRecord, Deliverables, FlyerDeliverable, FormFillRequest, GenerationLogEntry, IntakeSubmission, PlanId, PrintRequest, RepurposedFlyerContent, TrackingRecord, TrackingStats } from "./types"
import { PLAN_LIMITS } from "./types"
import { getPlan } from "./plans"
import { sha256Hex } from "./auth"
import type { NormalizedIntake } from "./agent-pipeline/schemas/intake"
import type { FlyerRequest } from "./agent-pipeline/schemas/flyer"

// ---------------------------------------------------------------------------
// Persistent storage via Upstash Redis (@upstash/redis). Replaces the old
// in-memory object, which reset on every server restart and wouldn't
// reliably persist AT ALL on Vercel's serverless functions (no guaranteed
// shared memory between invocations).
//
// Requires UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN in env — see
// .env.example. Every function here throws a clear error if they're missing
// rather than silently falling back to in-memory state, since a usage limit
// built on storage that doesn't actually persist is worse than no limit at
// all.
// ---------------------------------------------------------------------------

const redis = Redis.fromEnv()

const INTAKE_KEY = "intake:latest"
const LATEST_EMAIL_KEY = "latest-email"

// planId/planName are NOT stored here — they used to be captured from
// whatever a client picked at signup (IntakeSubmission.planId), which drifted
// out of sync with reality the moment an admin actually changed their real
// plan (e.g. upgrading someone to Basic still showed "Free Trial" on their
// dashboard, since nothing re-derived it). Always computed fresh from the
// real ClientRecord.plan in getDeliverablesForEmail/getDeliverables below.
interface StoredDeliverables {
  billingStatus: Deliverables["billingStatus"]
  intakeStatus: Deliverables["intakeStatus"]
  flyers: FlyerDeliverable[]
}

const DEFAULT_DELIVERABLES: StoredDeliverables = {
  billingStatus: "Active",
  intakeStatus: "Not started",
  flyers: [],
}

function deliverablesKey(email: string) {
  return `deliverables:${email}`
}

async function readDeliverables(email: string): Promise<StoredDeliverables> {
  const stored = await redis.get<StoredDeliverables>(deliverablesKey(email))
  return stored ?? DEFAULT_DELIVERABLES
}

async function writeDeliverables(email: string, data: StoredDeliverables): Promise<void> {
  await redis.set(deliverablesKey(email), data)
}

export async function saveIntake(submission: IntakeSubmission): Promise<IntakeSubmission> {
  const saved: IntakeSubmission = { ...submission, submittedAt: new Date().toISOString() }
  const email = submission.contact.email
  await redis.set(INTAKE_KEY, saved)
  await redis.set(LATEST_EMAIL_KEY, email)

  // Preserves existing flyers — a client can submit more than once (up to
  // their plan's flyer limit), and every prior flyer should stay visible on
  // their dashboard. This used to reset flyers: [] on every submission,
  // which silently wiped a client's flyer history (and its status/download
  // links) the moment they submitted again, even though the separate
  // lifetime flyersCreated counter kept accumulating correctly — the
  // mismatch between "used: N" and an N-flyer-shorter visible list was
  // exactly that bug.
  const current = await readDeliverables(email)
  await writeDeliverables(email, { ...current, intakeStatus: "Submitted" })

  return saved
}

export async function getIntake(): Promise<IntakeSubmission | null> {
  return (await redis.get<IntakeSubmission>(INTAKE_KEY)) ?? null
}

// Real deliverable state for ONE client, merged live with their real usage
// (flyersCreated/flyersLimit) so the dashboard's usage indicator is never
// stale relative to the enforcement in incrementFlyersCreated. This is what
// a client's own dashboard session reads — scoped to their email only.
export async function getDeliverablesForEmail(email: string): Promise<Deliverables> {
  const stored = await readDeliverables(email)

  const client = await getClient(email)
  const planId: PlanId = client?.plan ?? "trial"
  const periodStart = client?.periodStart ?? Date.now()

  const printRequests = await getPrintRequestsForEmail(email)
  const businessCategoryIsDefaulted = !(await hasExplicitBusinessCategory(email))

  return {
    ...stored,
    email,
    planId,
    planName: getPlan(planId)?.name ?? "Free Trial",
    flyersCreated: client?.flyersCreated ?? 0,
    flyersLimit: PLAN_LIMITS[planId],
    flyersResetAt: new Date(periodStart + RESET_PERIOD_MS).toISOString(),
    printRequests,
    businessCategory: client?.businessCategory ?? "Other",
    isRealEstate: client?.isRealEstate ?? false,
    businessCategoryIsDefaulted,
  }
}

// Admin-session view — the site owner isn't a client themselves, so this
// mirrors whichever email submitted most recently rather than any one
// client's own scoped data. Preserves the dashboard's original behavior for
// the admin login.
export async function getDeliverables(): Promise<Deliverables> {
  const email = await redis.get<string>(LATEST_EMAIL_KEY)
  if (!email) {
    return {
      ...DEFAULT_DELIVERABLES,
      email: null,
      planId: "trial",
      planName: "Free Trial",
      flyersCreated: 0,
      flyersLimit: PLAN_LIMITS.trial,
      flyersResetAt: new Date(Date.now() + RESET_PERIOD_MS).toISOString(),
      printRequests: [],
      businessCategory: "Other",
      isRealEstate: false,
      businessCategoryIsDefaulted: true,
    }
  }
  return getDeliverablesForEmail(email)
}

// Appends fresh "Pending" placeholders for THIS batch once the Intake Agent
// has determined how many flyers are actually needed and why — added to
// any existing flyers, not replacing them, so earlier submissions stay
// visible. Called by the pipeline right after Intake completes. Relies on
// the caller having given each request a globally-unique id (see
// crypto.randomUUID() in /api/intake) — the Intake Agent's own ids restart
// at "flyer-1" for every batch, which would collide across submissions.
export async function seedFlyerDeliverables(email: string, requests: { id: string; purpose: string }[]): Promise<void> {
  const current = await readDeliverables(email)
  const newFlyers = requests.map((r): FlyerDeliverable => ({ id: r.id, title: r.purpose, status: "Pending" }))
  await writeDeliverables(email, {
    ...current,
    flyers: [...current.flyers, ...newFlyers],
  })
}

/** Marks only THIS batch's flyers (by id) In Progress — never touches other batches' already-Ready or Failed flyers. */
export async function markFlyersInProgress(email: string, ids: string[]): Promise<void> {
  const idSet = new Set(ids)
  const current = await readDeliverables(email)
  await writeDeliverables(email, {
    ...current,
    flyers: current.flyers.map((f) => (idSet.has(f.id) ? { ...f, status: "In Progress" as const } : f)),
  })
}

// Update a flyer deliverable's status/fields — called directly by the
// in-process agent pipeline as each stage completes.
export async function updateDeliverable(
  email: string,
  payload: {
    type: "flyer"
    id: string
    status?: string
    thumbnailUrl?: string
    downloadUrl?: string
    repurposed?: RepurposedFlyerContent
    trackingCode?: string
  },
): Promise<FlyerDeliverable | null> {
  if (payload.type !== "flyer") return null
  const current = await readDeliverables(email)
  const flyer = current.flyers.find((f) => f.id === payload.id)
  if (!flyer) return null
  if (payload.status) {
    flyer.status = payload.status as FlyerDeliverable["status"]
    if (flyer.status !== "Failed") delete flyer.error // clear a stale error once a retry moves past it
  }
  if (payload.thumbnailUrl) flyer.thumbnailUrl = payload.thumbnailUrl
  if (payload.downloadUrl) flyer.downloadUrl = payload.downloadUrl
  if (payload.repurposed) flyer.repurposed = payload.repurposed
  if (payload.trackingCode) flyer.trackingCode = payload.trackingCode
  await writeDeliverables(email, current)
  return flyer
}

/** Marks one flyer Failed with a reason — used by the pipeline's timeout/error path and left in place for a client-triggered retry. */
export async function markFlyerFailed(email: string, id: string, reason: string): Promise<void> {
  const current = await readDeliverables(email)
  const flyer = current.flyers.find((f) => f.id === id)
  if (!flyer) return
  flyer.status = "Failed"
  flyer.error = reason
  await writeDeliverables(email, current)
}

/** Marks THIS batch's flyers (by id) that aren't already Ready as Failed — never touches other batches. Used when a batch's generation crashes or times out. */
export async function markFlyersFailed(email: string, ids: string[], reason: string): Promise<void> {
  const idSet = new Set(ids)
  const current = await readDeliverables(email)
  await writeDeliverables(email, {
    ...current,
    flyers: current.flyers.map((f) => (idSet.has(f.id) && f.status !== "Ready" ? { ...f, status: "Failed" as const, error: reason } : f)),
  })
}

/**
 * Removes a flyer from a client's visible deliverables. Deliberately does
 * NOT touch flyersCreated (a separate Redis key, incremented once at
 * generation time and never decremented) — a client "hiding" a flyer they
 * don't like still used up that generation against their plan's lifetime
 * limit, and shouldn't get it back by deleting the result.
 */
export async function deleteFlyerDeliverable(email: string, id: string): Promise<boolean> {
  const current = await readDeliverables(email)
  const next = current.flyers.filter((f) => f.id !== id)
  if (next.length === current.flyers.length) return false
  await writeDeliverables(email, { ...current, flyers: next })
  return true
}

// ---- Pipeline state (for retry) -------------------------------------------
//
// The normalized Intake Agent output + flyer requests for a client's most
// recent submission, saved right before Brand/Flyer generation starts. If
// generation later fails or times out, a retry needs this to regenerate a
// specific flyer without re-running the Intake Agent (which could raise new
// clarification questions the client already answered). Not saved for
// submissions that predate this — retrying one of those returns a clear
// "nothing to retry" error rather than a crash.

interface StoredPipelineState {
  intake: NormalizedIntake
  flyerRequests: FlyerRequest[]
}

function pipelineStateKey(email: string) {
  return `pipeline-state:${email}`
}

export async function savePipelineState(email: string, intake: NormalizedIntake, flyerRequests: FlyerRequest[]): Promise<void> {
  await redis.set(pipelineStateKey(email), { intake, flyerRequests } satisfies StoredPipelineState)
}

export async function getPipelineState(email: string): Promise<StoredPipelineState | null> {
  return (await redis.get<StoredPipelineState>(pipelineStateKey(email))) ?? null
}

// ---- Print requests ---------------------------------------------------------
//
// Same accumulate-don't-replace pattern as flyers/form-fills. Not a real
// order — see the note on PrintRequest in lib/types.ts.

function printRequestsKey(email: string) {
  return `print-requests:${email}`
}

async function readPrintRequests(email: string): Promise<PrintRequest[]> {
  return (await redis.get<PrintRequest[]>(printRequestsKey(email))) ?? []
}

export async function getPrintRequestsForEmail(email: string): Promise<PrintRequest[]> {
  return readPrintRequests(email)
}

export async function seedPrintRequest(email: string, request: PrintRequest): Promise<void> {
  const current = await readPrintRequests(email)
  await redis.set(printRequestsKey(email), [...current, request])
}

/** Admin-only status change — see /api/print-requests/status. */
export async function updatePrintRequestStatus(email: string, id: string, status: PrintRequest["status"]): Promise<boolean> {
  const current = await readPrintRequests(email)
  const request = current.find((r) => r.id === id)
  if (!request) return false
  request.status = status
  await redis.set(printRequestsKey(email), current)
  return true
}

// ---- Form Fill requests (Pro-only) -----------------------------------------
//
// Same accumulate-don't-replace pattern as flyers (see seedFlyerDeliverables)
// — a client's past form fills stay visible after a new one, rather than
// each new request wiping the list.

function formFillsKey(email: string) {
  return `formfills:${email}`
}

async function readFormFills(email: string): Promise<FormFillRequest[]> {
  return (await redis.get<FormFillRequest[]>(formFillsKey(email))) ?? []
}

export async function getFormFillsForEmail(email: string): Promise<FormFillRequest[]> {
  return readFormFills(email)
}

export async function seedFormFillRequest(email: string, request: FormFillRequest): Promise<void> {
  const current = await readFormFills(email)
  await redis.set(formFillsKey(email), [...current, request])
}

export async function updateFormFillRequest(
  email: string,
  id: string,
  updates: Partial<Pick<FormFillRequest, "status" | "resultUrl" | "error" | "unfilledNotes">>,
): Promise<void> {
  const current = await readFormFills(email)
  const next = current.map((r) => (r.id === id ? { ...r, ...updates } : r))
  await redis.set(formFillsKey(email), next)
}

// ---- Business profile (Pro-only) -------------------------------------------
//
// A saved default info source for form-fill, so a client doesn't have to
// re-upload the same file/link every time. One per client — saving a new
// one replaces the old.

function businessProfileKey(email: string) {
  return `client:${email}:business-profile`
}

export async function getBusinessProfile(email: string): Promise<BusinessProfileRecord | null> {
  return (await redis.get<BusinessProfileRecord>(businessProfileKey(email))) ?? null
}

export async function saveBusinessProfile(email: string, profile: BusinessProfileRecord): Promise<void> {
  await redis.set(businessProfileKey(email), profile)
}

export async function deleteBusinessProfile(email: string): Promise<void> {
  await redis.del(businessProfileKey(email))
}

// ---- Client records (usage limits) ---------------------------------------
//
// plan and flyersCreated are stored as separate keys (not one JSON blob) so
// flyersCreated can be incremented atomically via Redis INCRBY — a
// read-modify-write on a JSON blob would have a race window under
// concurrent requests from the same client, which matters for a real usage
// limit.

const RESET_PERIOD_MS = 30 * 24 * 60 * 60 * 1000

function planKey(email: string) {
  return `client:${email}:plan`
}
function countKey(email: string) {
  return `client:${email}:flyersCreated`
}
function periodStartKey(email: string) {
  return `client:${email}:periodStart`
}
function businessCategoryKey(email: string) {
  return `client:${email}:businessCategory`
}

function deriveIsRealEstate(category: BusinessCategory): boolean {
  return category === "Real Estate / Wholesaling"
}

/** True only once a category has been explicitly set (signup's Category step, or the dashboard's one-time banner) — distinct from getClient's businessCategory, which always returns a real value ("Other" by default) so callers never have to null-check it. */
export async function hasExplicitBusinessCategory(email: string): Promise<boolean> {
  return (await redis.get<BusinessCategory>(businessCategoryKey(email))) !== null
}

/**
 * Lazily rolls a client into a fresh 30-day period (resetting flyersCreated
 * to 0) if their current one has expired — checked on read rather than via
 * a cron, since Redis has no scheduled-job primitive here. Also backfills
 * periodStart for records created before this existed, treating "unknown
 * start" as "start now" rather than assuming they're already overdue.
 */
async function rollPeriodIfExpired(email: string, flyersCreated: number, periodStart: number | null): Promise<{ flyersCreated: number; periodStart: number }> {
  const now = Date.now()
  if (periodStart !== null && now - periodStart < RESET_PERIOD_MS) {
    return { flyersCreated, periodStart }
  }
  await redis.set(countKey(email), 0)
  await redis.set(periodStartKey(email), now)
  return { flyersCreated: 0, periodStart: now }
}

/** Returns null if this email has no record yet — use getOrCreateClient to upsert. */
export async function getClient(email: string): Promise<ClientRecord | null> {
  const plan = await redis.get<PlanId>(planKey(email))
  if (!plan) return null
  const storedCount = (await redis.get<number>(countKey(email))) ?? 0
  const storedPeriodStart = await redis.get<number>(periodStartKey(email))
  const { flyersCreated, periodStart } = await rollPeriodIfExpired(email, storedCount, storedPeriodStart ?? null)
  // Defaults to "Other" for accounts created before this field existed —
  // never null, so every caller (including feature #2-#6's isRealEstate
  // checks) gets a real value without having to null-check. Whether this
  // was ever explicitly set is a separate question (see
  // hasExplicitBusinessCategory), used only to drive the dashboard banner.
  const businessCategory = (await redis.get<BusinessCategory>(businessCategoryKey(email))) ?? "Other"
  return { email, plan, flyersCreated, periodStart, businessCategory, isRealEstate: deriveIsRealEstate(businessCategory) }
}

export async function getOrCreateClient(email: string): Promise<ClientRecord> {
  const existing = await getClient(email)
  if (existing) return existing
  const periodStart = Date.now()
  await redis.set(planKey(email), "trial")
  await redis.set(periodStartKey(email), periodStart)
  return { email, plan: "trial", flyersCreated: 0, periodStart, businessCategory: "Other", isRealEstate: false }
}

// Real enforcement only ever changes here — never inferred from an
// IntakeSubmission's planId (see the note on PlanId in lib/types.ts). Doesn't
// touch the usage period — upgrading/downgrading doesn't grant an early reset.
export async function setClientPlan(email: string, plan: PlanId): Promise<ClientRecord> {
  await redis.set(planKey(email), plan)
  const storedCount = (await redis.get<number>(countKey(email))) ?? 0
  const storedPeriodStart = await redis.get<number>(periodStartKey(email))
  const { flyersCreated, periodStart } = await rollPeriodIfExpired(email, storedCount, storedPeriodStart ?? null)
  const businessCategory = (await redis.get<BusinessCategory>(businessCategoryKey(email))) ?? "Other"
  return { email, plan, flyersCreated, periodStart, businessCategory, isRealEstate: deriveIsRealEstate(businessCategory) }
}

// Set at signup (see IntakeSubmission.businessCategory, written by
// /api/intake) or, for an account that predates this field, once via the
// dashboard's non-blocking banner (POST /api/business-category — see
// hasExplicitBusinessCategory for how that banner knows to stop showing).
export async function setClientBusinessCategory(email: string, category: BusinessCategory): Promise<ClientRecord> {
  await redis.set(businessCategoryKey(email), category)
  const client = await getOrCreateClient(email)
  return { ...client, businessCategory: category, isRealEstate: deriveIsRealEstate(category) }
}

/** Atomic increment — safe under concurrent requests from the same email. */
export async function incrementFlyersCreated(email: string, by: number): Promise<number> {
  return await redis.incrby(countKey(email), by)
}

/** Every client's full deliverable state — the admin-only "everyone's flyers" roster view. Never used for a client's own session. */
export async function listClientsWithDeliverables(): Promise<Deliverables[]> {
  let cursor = "0"
  const emails: string[] = []
  do {
    const [next, keys] = await redis.scan(cursor, { match: "client:*:plan", count: 100 })
    cursor = next
    for (const key of keys) {
      emails.push(key.slice("client:".length, key.length - ":plan".length))
    }
  } while (cursor !== "0")

  return Promise.all(emails.map((email) => getDeliverablesForEmail(email)))
}

// ---- Client passwords -------------------------------------------------------
//
// Real per-client credential, separate from ClientRecord (plan/category/
// usage) the same way businessCategory's storage is separate — a client can
// exist (have deliverables, a plan) with no password yet, if their account
// predates this system; getClientPasswordHash returning null is exactly how
// /api/auth/client-login tells "wrong password" apart from "never set one,
// use forgot-password to set it".

function passwordHashKey(email: string) {
  return `client:${email}:passwordHash`
}

export async function getClientPasswordHash(email: string): Promise<string | null> {
  return (await redis.get<string>(passwordHashKey(email))) ?? null
}

export async function setClientPasswordHash(email: string, passwordHash: string): Promise<void> {
  await redis.set(passwordHashKey(email), passwordHash)
}

// ---- Password reset tokens ---------------------------------------------------
//
// Emailed as a link (see lib/email.ts), not typed back in by hand like the
// old client-access codes were — long and URL-safe rather than short and
// human-typeable, since nothing about this needs to be read aloud or
// re-entered manually. Stored as a SHA-256 hash with a short TTL and deleted
// on first successful use, same reasoning as before: never stored or logged
// in plaintext, never reusable. Doubles as the "set your first password"
// mechanism for any client whose account predates this system — there's no
// separate migration path, since requesting a reset and setting an initial
// password are the same action from the client's side.

const RESET_TOKEN_TTL_SECONDS = 30 * 60

function resetTokenKey(email: string) {
  return `password-reset:${email}`
}

function generateResetToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return Buffer.from(bytes).toString("base64url")
}

/** Generates a fresh reset token, stores its hash, and returns the plaintext token to email once. Overwrites any previous unconsumed token for this email, so only the most recently requested link works. */
export async function issuePasswordResetToken(email: string): Promise<string> {
  const token = generateResetToken()
  await redis.set(resetTokenKey(email), await sha256Hex(token), { ex: RESET_TOKEN_TTL_SECONDS })
  return token
}

/** Verifies a submitted token against the stored hash and consumes it (single-use) on success. */
export async function verifyAndConsumePasswordResetToken(email: string, token: string): Promise<boolean> {
  const key = resetTokenKey(email)
  const storedHash = await redis.get<string>(key)
  if (!storedHash) return false

  const submittedHash = await sha256Hex(token)
  if (submittedHash !== storedHash) return false

  await redis.del(key)
  return true
}

// ---- QR tracking ------------------------------------------------------------

function trackingRecordKey(code: string) {
  return `tracking:${code}:record`
}
function trackingScansKey(code: string) {
  return `tracking:${code}:scans`
}
function trackingClicksKey(code: string) {
  return `tracking:${code}:clicks`
}

export async function createTrackingRecord(code: string, record: TrackingRecord): Promise<void> {
  await redis.set(trackingRecordKey(code), record)
}

export async function getTrackingRecord(code: string): Promise<TrackingRecord | null> {
  return (await redis.get<TrackingRecord>(trackingRecordKey(code))) ?? null
}

/** Backfills the content fields once the Flyer Agent responds — the record is created before the agent call (see the note on TrackingRecord in lib/types.ts), so this only ever fills in previously-null fields. */
export async function updateTrackingRecordContent(
  code: string,
  content: Pick<TrackingRecord, "headline" | "offer" | "cta" | "disclaimer">,
): Promise<void> {
  const existing = await getTrackingRecord(code)
  if (!existing) return
  await redis.set(trackingRecordKey(code), { ...existing, ...content })
}

/** Atomic — safe under concurrent scans of the same code. */
export async function incrementTrackingScan(code: string): Promise<number> {
  return await redis.incr(trackingScansKey(code))
}

export async function incrementTrackingClick(code: string): Promise<number> {
  return await redis.incr(trackingClicksKey(code))
}

export async function getTrackingStats(code: string): Promise<TrackingStats> {
  const [scans, clicks] = await Promise.all([
    redis.get<number>(trackingScansKey(code)),
    redis.get<number>(trackingClicksKey(code)),
  ])
  return { scans: scans ?? 0, clicks: clicks ?? 0 }
}

// ---- AI generation cost log -------------------------------------------------
//
// One row per real Claude API call in the Intake/Brand/Flyer pipeline (see
// GenerationLogEntry in lib/types.ts and estimateCostUsd in
// lib/agent-pipeline/pricing.ts) — not one row per flyer, so admin cost
// views can break spend down by pipeline stage. Stored as a sorted set
// scored by createdAt (epoch ms), not a plain list, so time-window queries
// ("this week", "last 90 days") are a single ZRANGE-by-score rather than a
// full scan-and-filter — every later admin cost/revenue view depends on
// this being cheap. Mirrored into a per-email sorted set too, so the
// admin's per-user drill-down doesn't need to scan the entire global log.

const GENERATION_LOG_KEY = "generation-log"

function generationLogByEmailKey(email: string) {
  return `generation-log:${email}`
}

export async function recordGenerationLogEntry(entry: Omit<GenerationLogEntry, "id">): Promise<void> {
  const full: GenerationLogEntry = { ...entry, id: crypto.randomUUID() }
  const score = new Date(full.createdAt).getTime()
  // The client (de)serializes the member value itself (same as redis.get/set
  // elsewhere in this file) — passing an already-JSON.stringify'd string as
  // member double-encodes it, and reading it back double-decodes into a
  // string that isn't valid JSON.
  await Promise.all([
    redis.zadd<GenerationLogEntry>(GENERATION_LOG_KEY, { score, member: full }),
    redis.zadd<GenerationLogEntry>(generationLogByEmailKey(entry.email), { score, member: full }),
  ])
}

/** All log entries with createdAt in [since, until] (epoch ms), oldest first — the global log, for admin-wide cost views. */
export async function getGenerationLog(since: number, until: number = Date.now()): Promise<GenerationLogEntry[]> {
  return await redis.zrange<GenerationLogEntry[]>(GENERATION_LOG_KEY, since, until, { byScore: true })
}

/** One client's full generation history, oldest first — the admin per-user drill-down. */
export async function getGenerationLogForEmail(email: string): Promise<GenerationLogEntry[]> {
  return await redis.zrange<GenerationLogEntry[]>(generationLogByEmailKey(email), 0, -1)
}
