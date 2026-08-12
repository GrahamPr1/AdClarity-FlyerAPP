import { Redis } from "@upstash/redis"
import type { ClientRecord, Deliverables, FlyerDeliverable, IntakeSubmission, PlanId } from "./types"
import { FREE_FLYER_LIMIT } from "./types"
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

interface StoredDeliverables {
  planId: PlanId
  planName: string
  billingStatus: Deliverables["billingStatus"]
  intakeStatus: Deliverables["intakeStatus"]
  flyers: FlyerDeliverable[]
}

const DEFAULT_DELIVERABLES: StoredDeliverables = {
  planId: "free",
  planName: "Free",
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

  // A fresh submission starts a fresh deliverable run — clear out any flyers
  // from a previous run so stale entries don't linger alongside new ones.
  const plan = getPlan(submission.planId)
  await writeDeliverables(email, {
    ...DEFAULT_DELIVERABLES,
    intakeStatus: "Submitted",
    flyers: [],
    planId: plan?.id ?? "free",
    planName: plan?.name ?? "Free",
  })

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

  let flyersCreated = 0
  let flyersLimit: number | null = FREE_FLYER_LIMIT

  const client = await getClient(email)
  if (client) {
    flyersCreated = client.flyersCreated
    flyersLimit = client.plan === "pro" ? null : FREE_FLYER_LIMIT
  }

  return { ...stored, email, flyersCreated, flyersLimit }
}

// Admin-session view — the site owner isn't a client themselves, so this
// mirrors whichever email submitted most recently rather than any one
// client's own scoped data. Preserves the dashboard's original behavior for
// the admin login.
export async function getDeliverables(): Promise<Deliverables> {
  const email = await redis.get<string>(LATEST_EMAIL_KEY)
  if (!email) {
    return { ...DEFAULT_DELIVERABLES, email: null, flyersCreated: 0, flyersLimit: FREE_FLYER_LIMIT }
  }
  return getDeliverablesForEmail(email)
}

// Replaces the flyer list with fresh "Pending" placeholders once the Intake
// Agent has determined how many flyers are actually needed and why. Called
// by the pipeline right after Intake completes.
export async function seedFlyerDeliverables(email: string, requests: { id: string; purpose: string }[]): Promise<void> {
  const current = await readDeliverables(email)
  await writeDeliverables(email, {
    ...current,
    flyers: requests.map((r): FlyerDeliverable => ({ id: r.id, title: r.purpose, status: "Pending" })),
  })
}

export async function markAllFlyersInProgress(email: string): Promise<void> {
  const current = await readDeliverables(email)
  await writeDeliverables(email, {
    ...current,
    flyers: current.flyers.map((f) => ({ ...f, status: "In Progress" as const })),
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

/** Marks every flyer for this client that isn't already Ready as Failed — used when the whole batch's generation crashes or times out. */
export async function markPendingFlyersFailed(email: string, reason: string): Promise<void> {
  const current = await readDeliverables(email)
  await writeDeliverables(email, {
    ...current,
    flyers: current.flyers.map((f) => (f.status === "Ready" ? f : { ...f, status: "Failed" as const, error: reason })),
  })
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
  await redis.set(planKey(email), "free")
  return { email, plan: "free", flyersCreated: 0 }
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
