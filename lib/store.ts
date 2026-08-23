import { Redis } from "@upstash/redis"
import type { BusinessCategory, BusinessProfileRecord, CampaignDefaults, ClientRecord, Deliverables, FlyerDeliverable, FormFillRequest, GenerationLogEntry, IntakeSubmission, PlanId, PrintRequest, RepurposedFlyerContent, SavedBrandProfile, TrackingRecord, TrackingStats } from "./types"
import { PLAN_LIMITS } from "./types"
import { getPlan } from "./plans"
import { getAppEnvironment, verdictForMarker } from "./env"
import { sha256Hex } from "./auth"
import type { NormalizedIntake } from "./agent-pipeline/schemas/intake"
import type { FlyerRequest } from "./agent-pipeline/schemas/flyer"
import type { BrandProfile } from "./agent-pipeline/schemas/brand"

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

// ---------------------------------------------------------------------------
// Environment guardrail.
//
// Each Redis instance stores a marker naming the environment it belongs to.
// NOTHING outside production may talk to an instance that says "production" —
// that is the actual enforcement behind "only production touches live data",
// rather than trusting whoever last edited an env var.
//
// This covers preview as well as development, and deliberately so: preview
// deployments ran against the production database while only logging a
// warning, so any pull request could read and write live customer records.
// A preview that refuses to boot is a far smaller problem than one that
// quietly mutates real data.
//
// Deliberately NOT enforced in production: a marker mismatch there should be
// loud but must never take a live deployment down, so it warns instead. The
// check is lazy and memoised, so it costs one GET per process, not per query.
// ---------------------------------------------------------------------------
const ENV_MARKER_KEY = "__oneflyer_environment"

let envCheck: Promise<void> | null = null

export function assertRedisMatchesEnvironment(): Promise<void> {
  envCheck ??= (async () => {
    const expected = getAppEnvironment()
    let actual: string | null = null
    try {
      actual = await redis.get<string>(ENV_MARKER_KEY)
    } catch {
      return // A transient Redis error is the caller's problem to surface, not this guard's.
    }

    // Decision lives in lib/env.ts so it can be unit-tested without Redis.
    const verdict = verdictForMarker(expected, actual)
    if (verdict === "ok") return

    if (verdict === "claim") {
      // Unmarked instance — claim it for this environment. First writer wins,
      // so a brand-new dev database labels itself the first time it's used.
      await redis.set(ENV_MARKER_KEY, expected).catch(() => {})
      return
    }

    const message =
      `Redis environment mismatch: this process is "${expected}" but the connected ` +
      `Redis instance is marked "${actual}". Check UPSTASH_REDIS_REST_URL for this environment.`

    if (verdict === "refuse") {
      throw new Error(
        `${message}\n\nRefusing to run ${expected} against the production database. ` +
          `Point UPSTASH_REDIS_REST_URL for the ${expected} environment at its own instance, ` +
          `or set APP_ENV explicitly if this is genuinely intentional.`,
      )
    }
    console.warn(`[env] ${message}`)
  })()
  return envCheck
}

/** Labels the connected instance. Used by scripts/env-check.ts on a fresh database. */
export async function setRedisEnvironmentMarker(environment: string): Promise<void> {
  await redis.set(ENV_MARKER_KEY, environment)
}

/** Reads the marker without asserting — for diagnostics. */
export async function readRedisEnvironmentMarker(): Promise<string | null> {
  return (await redis.get<string>(ENV_MARKER_KEY)) ?? null
}

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
  // Lowercased to match how EVERY other key for this client is written
  // (signup lowercases, and /api/intake authorizes against the lowercased
  // form). Using the raw value here meant a submission with "Me@Example.com"
  // passed the ownership check but then wrote deliverables to a
  // differently-cased key — orphaning the record so the client's own
  // dashboard couldn't find it and the admin "latest client" view pointed at
  // something that didn't exist.
  const email = submission.contact.email.trim().toLowerCase()
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
    isAdmin: client?.isAdmin ?? false,
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
      isAdmin: false,
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

// ---- Saved brand profile (Quick Prompt) -------------------------------------
//
// See SavedBrandProfile in lib/types.ts for why this is distinct from
// BusinessProfileRecord above despite the similar name. Refreshed after
// every successful guided-flow Brand Agent run (see updateSavedBrandProfileFromGuidedRun
// in lib/agent-pipeline/pipeline.ts); on the Quick Prompt path it's only
// ever written once, on explicit opt-in.

function brandProfileKey(email: string) {
  return `client:${email}:brand-profile`
}

export async function getSavedBrandProfile(email: string): Promise<SavedBrandProfile | null> {
  return (await redis.get<SavedBrandProfile>(brandProfileKey(email))) ?? null
}

export async function saveBrandProfile(email: string, brandProfile: BrandProfile, contact: NormalizedIntake["contact"]): Promise<void> {
  const record: SavedBrandProfile = { savedAt: new Date().toISOString(), brandProfile, contact }
  await redis.set(brandProfileKey(email), record)
}

// Scratch storage for a Quick Prompt generation's inferred brand — written
// only on the Quick Prompt path (never guided, which auto-saves the real
// thing above instead), keyed by flyerId rather than email so it doesn't
// collide with whatever the client's ACTUAL saved brand is. Two uses: the
// "save this as your brand?" one-time offer (POST /api/brand-profile/save-from-generation)
// and natural-language refinement's need for the same brandProfile/contact
// a follow-up edit should stay consistent with. 24h TTL — long enough for
// either to matter, not permanent since it's disposable if never accepted.
const PENDING_BRAND_PROFILE_TTL_SECONDS = 24 * 60 * 60

function pendingBrandProfileKey(flyerId: string) {
  return `quick-prompt-pending-brand:${flyerId}`
}

export async function savePendingBrandProfile(flyerId: string, brandProfile: BrandProfile, contact: NormalizedIntake["contact"]): Promise<void> {
  const record: SavedBrandProfile = { savedAt: new Date().toISOString(), brandProfile, contact }
  await redis.set(pendingBrandProfileKey(flyerId), record, { ex: PENDING_BRAND_PROFILE_TTL_SECONDS })
}

export async function getPendingBrandProfile(flyerId: string): Promise<SavedBrandProfile | null> {
  return (await redis.get<SavedBrandProfile>(pendingBrandProfileKey(flyerId))) ?? null
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
function isAdminKey(email: string) {
  return `client:${email}:isAdmin`
}
function businessNameKey(email: string) {
  return `client:${email}:businessName`
}
function campaignDefaultsKey(email: string) {
  return `client:${email}:campaignDefaults`
}

function createdAtKey(email: string) {
  return `client:${email}:createdAt`
}
// Retention counters. Deliberately SEPARATE from countKey above: that one is
// a usage-window counter that resets to 0 every 30 days (see
// rollPeriodIfExpired), so it structurally cannot answer "how many campaigns
// has this account ever made" or "did they come back". These never reset.
function lifetimeCountKey(email: string) {
  return `client:${email}:lifetimeFlyersCreated`
}
function lastCampaignAtKey(email: string) {
  return `client:${email}:lastCampaignAt`
}

function deriveIsRealEstate(category: BusinessCategory): boolean {
  return category === "Real Estate / Wholesaling"
}

/** True only once a category has been explicitly set (signup's Category step, or the dashboard's one-time banner) — distinct from getClient's businessCategory, which always returns a real value ("Other" by default) so callers never have to null-check it. */
export async function hasExplicitBusinessCategory(email: string): Promise<boolean> {
  return (await redis.get<BusinessCategory>(businessCategoryKey(email))) !== null
}

// Fields that live on every ClientRecord but aren't part of the real
// plan/usage enforcement core (plan, flyersCreated, periodStart) — fetched
// together via one helper so getClient/getOrCreateClient/setClientPlan
// don't each hand-roll the same four-key Promise.all.
async function getClientExtras(
  email: string,
): Promise<
  Pick<
    ClientRecord,
    "businessCategory" | "isRealEstate" | "isAdmin" | "businessName" | "createdAt" | "lifetimeFlyersCreated" | "lastCampaignAt"
  >
> {
  const [businessCategory, isAdmin, businessName, createdAt, lifetimeFlyersCreated, lastCampaignAt] = await Promise.all([
    redis.get<BusinessCategory>(businessCategoryKey(email)),
    redis.get<boolean>(isAdminKey(email)),
    redis.get<string>(businessNameKey(email)),
    redis.get<string>(createdAtKey(email)),
    redis.get<number>(lifetimeCountKey(email)),
    redis.get<string>(lastCampaignAtKey(email)),
  ])
  return {
    businessCategory: businessCategory ?? "Other",
    isRealEstate: deriveIsRealEstate(businessCategory ?? "Other"),
    isAdmin: isAdmin ?? false,
    businessName: businessName ?? null,
    createdAt: createdAt ?? null,
    // 0/null for accounts that predate these counters — deliberately not
    // backfilled from flyersCreated, which would be wrong (that number is
    // this period's usage, not lifetime).
    lifetimeFlyersCreated: lifetimeFlyersCreated ?? 0,
    lastCampaignAt: lastCampaignAt ?? null,
  }
}

/** Records the real signup timestamp — the FIRST time this email ever gets a real password credential (a fresh signup, or claiming a pre-password-era account via reset-password). Never overwritten on later calls, so a password reset doesn't reset "signup date". */
export async function recordClientCreatedAtIfUnset(email: string): Promise<void> {
  const existing = await redis.get<string>(createdAtKey(email))
  if (existing) return
  await redis.set(createdAtKey(email), new Date().toISOString())
}

// Set directly from the raw onboarding submission by /api/intake — same
// treatment as businessCategory, never touched by the AI pipeline. There's
// no per-submission history kept, only the most recent name, same as
// businessCategory.
/**
 * A client's reusable brand/contact answers — see CampaignDefaults in
 * lib/types.ts. Null until they've completed the optional profile step, which
 * is exactly why every field the onboarding form pulls from here has to stay
 * optional at the API level: a first campaign is generated before this exists.
 */
export async function getCampaignDefaults(email: string): Promise<CampaignDefaults | null> {
  return (await redis.get<CampaignDefaults>(campaignDefaultsKey(email))) ?? null
}

export async function saveCampaignDefaults(
  email: string,
  defaults: Omit<CampaignDefaults, "savedAt">,
): Promise<CampaignDefaults> {
  const record: CampaignDefaults = { ...defaults, savedAt: new Date().toISOString() }
  await redis.set(campaignDefaultsKey(email), record)
  return record
}

export async function setClientBusinessName(email: string, businessName: string): Promise<void> {
  await redis.set(businessNameKey(email), businessName)
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
  const extras = await getClientExtras(email)
  return { email, plan, flyersCreated, periodStart, ...extras }
}

export async function getOrCreateClient(email: string): Promise<ClientRecord> {
  const existing = await getClient(email)
  if (existing) return existing
  const periodStart = Date.now()
  await redis.set(planKey(email), "trial")
  await redis.set(periodStartKey(email), periodStart)
  return { email, plan: "trial", flyersCreated: 0, periodStart, businessCategory: "Other", isRealEstate: false, isAdmin: false, businessName: null, createdAt: null, lifetimeFlyersCreated: 0, lastCampaignAt: null }
}

// Real enforcement only ever changes here — never inferred from an
// IntakeSubmission's planId (see the note on PlanId in lib/types.ts). Doesn't
// touch the usage period — upgrading/downgrading doesn't grant an early reset.
export async function setClientPlan(email: string, plan: PlanId): Promise<ClientRecord> {
  await redis.set(planKey(email), plan)
  const storedCount = (await redis.get<number>(countKey(email))) ?? 0
  const storedPeriodStart = await redis.get<number>(periodStartKey(email))
  const { flyersCreated, periodStart } = await rollPeriodIfExpired(email, storedCount, storedPeriodStart ?? null)
  const extras = await getClientExtras(email)
  return { email, plan, flyersCreated, periodStart, ...extras }
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

// Grants/revokes access to /admin/* (see app/admin/layout.tsx) for a real
// client account, on top of the always-admin ADMIN_SUB site-owner login.
// Only ever called from POST /api/admin/set-admin, itself gated to the
// ADMIN_SUB session — deliberately not self-service, so an isAdmin account
// can't grant admin to further accounts on its own.
export async function setClientIsAdmin(email: string, isAdmin: boolean): Promise<ClientRecord> {
  await redis.set(isAdminKey(email), isAdmin)
  const client = await getOrCreateClient(email)
  return { ...client, isAdmin }
}

/**
 * Raw increment with NO limit enforcement.
 *
 * Every credit-consuming route now uses reserveFlyerQuota instead — this
 * grants usage without checking the plan ceiling, so reaching for it
 * reintroduces the over-granting bug. Kept only for callers that have
 * already reserved, or that deliberately bypass the limit.
 *
 * Atomic increment — safe under concurrent requests from the same email.
 *
 * Also bumps the two retention counters, which is the whole reason they
 * exist: the returned/plan-enforcing count resets every 30 days, so on its
 * own it can't distinguish "made one campaign and never came back" from
 * "makes three every month". Written alongside rather than in a separate
 * call so a caller can't accidentally record usage without recording
 * retention.
 */
/**
 * Atomically claims `count` flyers against the client's plan limit.
 *
 * Replaces a genuine check-then-act race. Both /api/intake and
 * /api/quick-prompt read flyersCreated, compared it to the limit, and only
 * incremented much later — in intake's case ~20-30s later, because the real
 * flyer count isn't known until the Intake Agent has run. Two submissions
 * landing in that window both saw the same stale count, both passed, and both
 * incremented, so a 3-flyer Trial could produce more than 3.
 *
 * INCRBY is atomic, so incrementing FIRST and rolling back on overshoot makes
 * the reservation itself the point of decision — there's no window left
 * between deciding and claiming. A rollback can briefly leave the counter
 * high for a competing reader, which errs toward rejecting rather than
 * over-granting, and self-corrects immediately.
 */
export async function reserveFlyerQuota(
  email: string,
  count: number,
  limit: number,
): Promise<{ ok: true; flyersCreated: number } | { ok: false; flyersCreated: number; remaining: number }> {
  const after = await redis.incrby(countKey(email), count)
  if (after > limit) {
    const rolledBackTo = await redis.incrby(countKey(email), -count)
    return { ok: false, flyersCreated: rolledBackTo, remaining: Math.max(0, limit - rolledBackTo) }
  }
  // Retention counters only move on a reservation that actually succeeded.
  await Promise.all([
    redis.incrby(lifetimeCountKey(email), count),
    redis.set(lastCampaignAtKey(email), new Date().toISOString()),
  ])
  return { ok: true, flyersCreated: after }
}

export async function incrementFlyersCreated(email: string, by: number): Promise<number> {
  const [periodCount] = await Promise.all([
    redis.incrby(countKey(email), by),
    redis.incrby(lifetimeCountKey(email), by),
    redis.set(lastCampaignAtKey(email), new Date().toISOString()),
  ])
  return periodCount
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

/**
 * Every email that has ever set a real password — the true definition of
 * "a user" now that login requires one (see /api/auth/signup and
 * /api/auth/reset-password). Deliberately NOT the client:*:plan scan
 * listClientsWithDeliverables uses above: a freshly signed-up account has
 * a password but no ClientRecord yet (getOrCreateClient only runs when
 * something — onboarding, an admin action — actually needs one), so that
 * scan would silently miss anyone who's signed up but not yet onboarded.
 */
export async function listAllUserEmails(): Promise<string[]> {
  let cursor = "0"
  const emails: string[] = []
  do {
    const [next, keys] = await redis.scan(cursor, { match: "client:*:passwordHash", count: 100 })
    cursor = next
    for (const key of keys) {
      emails.push(key.slice("client:".length, key.length - ":passwordHash".length))
    }
  } while (cursor !== "0")
  return emails
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

// ---- Quick Prompt regenerate / refinement allowances -------------------------
//
// Two separate counters per flyerId, both server-side (never trust a
// client-reported count) — "Try Again" (a full re-roll) and natural-
// language refinement are distinct actions with distinct free allowances
// per the spec, so they get distinct keys rather than sharing one counter.

const REGENERATE_FREE_LIMIT = 2
const REGENERATE_WINDOW_SECONDS = 10 * 60
const REFINEMENT_FREE_LIMIT = 3
const REFINEMENT_WINDOW_SECONDS = 60 * 60

function regenerateCountKey(flyerId: string) {
  return `quick-prompt-regen:${flyerId}`
}
function refinementCountKey(flyerId: string) {
  return `quick-prompt-refine:${flyerId}`
}

/**
 * Atomically increments this flyer's regenerate count and reports whether
 * THIS attempt is still within the free allowance — the TTL starts
 * counting from the first regenerate call (not the original generation),
 * so a client who comes back well after 10 minutes gets a fresh free
 * allowance rather than being permanently capped at 2 for that flyer.
 */
export async function incrementAndCheckRegenerateAllowance(flyerId: string): Promise<{ isFree: boolean; countSoFar: number }> {
  const count = await redis.incr(regenerateCountKey(flyerId))
  if (count === 1) await redis.expire(regenerateCountKey(flyerId), REGENERATE_WINDOW_SECONDS)
  return { isFree: count <= REGENERATE_FREE_LIMIT, countSoFar: count }
}

/** Same shape as the regenerate allowance, for natural-language refinement (see POST /api/quick-prompt/refine). */
export async function incrementAndCheckRefinementAllowance(flyerId: string): Promise<{ isFree: boolean; countSoFar: number }> {
  const count = await redis.incr(refinementCountKey(flyerId))
  if (count === 1) await redis.expire(refinementCountKey(flyerId), REFINEMENT_WINDOW_SECONDS)
  return { isFree: count <= REFINEMENT_FREE_LIMIT, countSoFar: count }
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
