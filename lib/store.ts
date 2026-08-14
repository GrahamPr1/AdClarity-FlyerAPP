import { Redis } from "@upstash/redis"
import type { ClientRecord, Deliverables, FlyerDeliverable, FormFillRequest, IntakeSubmission, PlanId } from "./types"
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

  return {
    ...stored,
    email,
    planId,
    planName: getPlan(planId)?.name ?? "Free Trial",
    flyersCreated: client?.flyersCreated ?? 0,
    flyersLimit: PLAN_LIMITS[planId],
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

// Update a flyer deliverable's status/fields — used by both the
// /api/agent-callback webhook and the in-process agent pipeline.
export async function updateDeliverable(
  email: string,
  payload: {
    type: "flyer"
    id: string
    status?: string
    thumbnailUrl?: string
    downloadUrl?: string
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

// ---- Client records (usage limits) ---------------------------------------
//
// plan and flyersCreated are stored as separate keys (not one JSON blob) so
// flyersCreated can be incremented atomically via Redis INCRBY — a
// read-modify-write on a JSON blob would have a race window under
// concurrent requests from the same client, which matters for a real usage
// limit.

function planKey(email: string) {
  return `client:${email}:plan`
}
function countKey(email: string) {
  return `client:${email}:flyersCreated`
}

/** Returns null if this email has no record yet — use getOrCreateClient to upsert. */
export async function getClient(email: string): Promise<ClientRecord | null> {
  const plan = await redis.get<PlanId>(planKey(email))
  if (!plan) return null
  const flyersCreated = (await redis.get<number>(countKey(email))) ?? 0
  return { email, plan, flyersCreated }
}

export async function getOrCreateClient(email: string): Promise<ClientRecord> {
  const existing = await getClient(email)
  if (existing) return existing
  await redis.set(planKey(email), "trial")
  return { email, plan: "trial", flyersCreated: 0 }
}

// Real enforcement only ever changes here — never inferred from an
// IntakeSubmission's planId (see the note on PlanId in lib/types.ts).
export async function setClientPlan(email: string, plan: PlanId): Promise<ClientRecord> {
  await redis.set(planKey(email), plan)
  const flyersCreated = (await redis.get<number>(countKey(email))) ?? 0
  return { email, plan, flyersCreated }
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

// ---- Client self-serve access codes ---------------------------------------
//
// There's no email/SMS delivery wired up, so a client can't be sent a
// magic link — instead they type their email into the login page and the
// app hands them a short-lived one-time code directly on screen, which they
// immediately re-enter to sign in. The code is stored as a SHA-256 hash
// with a short TTL and deleted on first successful use (or expiry) — never
// stored or logged in plaintext, and never reusable, so knowing an old code
// doesn't help anyone.

const CLIENT_CODE_TTL_SECONDS = 15 * 60
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789" // no 0/O or 1/I — avoids misread codes
const CODE_LENGTH = 6

function clientCodeKey(email: string) {
  return `client-code:${email}`
}

function generateCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(CODE_LENGTH))
  return Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("")
}

/** Generates a fresh one-time access code for this client, stores its hash, and returns the plaintext code to show them once. */
export async function issueClientAccessCode(email: string): Promise<string> {
  const code = generateCode()
  await redis.set(clientCodeKey(email), await sha256Hex(code), { ex: CLIENT_CODE_TTL_SECONDS })
  return code
}

/** Verifies a submitted code against the stored hash and consumes it (single-use) on success. */
export async function verifyAndConsumeClientAccessCode(email: string, code: string): Promise<boolean> {
  const key = clientCodeKey(email)
  const storedHash = await redis.get<string>(key)
  if (!storedHash) return false

  const submittedHash = await sha256Hex(code.trim().toUpperCase())
  if (submittedHash !== storedHash) return false

  await redis.del(key)
  return true
}
