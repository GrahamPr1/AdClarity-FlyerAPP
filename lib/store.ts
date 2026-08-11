import { Redis } from "@upstash/redis"
import type { ClientRecord, Deliverables, FlyerDeliverable, IntakeSubmission, PlanId } from "./types"
import { FREE_FLYER_LIMIT } from "./types"
import { getPlan } from "./plans"

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
const DELIVERABLES_KEY = "deliverables:latest"
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

async function readDeliverables(): Promise<StoredDeliverables> {
  const stored = await redis.get<StoredDeliverables>(DELIVERABLES_KEY)
  return stored ?? DEFAULT_DELIVERABLES
}

async function writeDeliverables(data: StoredDeliverables): Promise<void> {
  await redis.set(DELIVERABLES_KEY, data)
}

export async function saveIntake(submission: IntakeSubmission): Promise<IntakeSubmission> {
  const saved: IntakeSubmission = { ...submission, submittedAt: new Date().toISOString() }
  await redis.set(INTAKE_KEY, saved)
  await redis.set(LATEST_EMAIL_KEY, submission.contact.email)

  // A fresh submission starts a fresh deliverable run — clear out any flyers
  // from a previous run so stale entries don't linger alongside new ones.
  const plan = getPlan(submission.planId)
  await writeDeliverables({
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

// Real deliverable state, merged live with the latest submitter's real
// usage (flyersCreated/flyersLimit) so the dashboard's usage indicator is
// never stale relative to the enforcement in incrementFlyersCreated.
export async function getDeliverables(): Promise<Deliverables> {
  const stored = await readDeliverables()
  const email = await redis.get<string>(LATEST_EMAIL_KEY)

  let flyersCreated = 0
  let flyersLimit: number | null = FREE_FLYER_LIMIT

  if (email) {
    const client = await getClient(email)
    if (client) {
      flyersCreated = client.flyersCreated
      flyersLimit = client.plan === "pro" ? null : FREE_FLYER_LIMIT
    }
  }

  return { ...stored, email: email ?? null, flyersCreated, flyersLimit }
}

// Replaces the flyer list with fresh "Pending" placeholders once the Intake
// Agent has determined how many flyers are actually needed and why. Called
// by the pipeline right after Intake completes.
export async function seedFlyerDeliverables(requests: { id: string; purpose: string }[]): Promise<void> {
  const current = await readDeliverables()
  await writeDeliverables({
    ...current,
    flyers: requests.map((r): FlyerDeliverable => ({ id: r.id, title: r.purpose, status: "Pending" })),
  })
}

export async function markAllFlyersInProgress(): Promise<void> {
  const current = await readDeliverables()
  await writeDeliverables({
    ...current,
    flyers: current.flyers.map((f) => ({ ...f, status: "In Progress" as const })),
  })
}

// Update a flyer deliverable's status/fields — used by both the
// /api/agent-callback webhook and the in-process agent pipeline.
export async function updateDeliverable(payload: {
  type: "flyer"
  id: string
  status?: string
  thumbnailUrl?: string
  downloadUrl?: string
}): Promise<FlyerDeliverable | null> {
  if (payload.type !== "flyer") return null
  const current = await readDeliverables()
  const flyer = current.flyers.find((f) => f.id === payload.id)
  if (!flyer) return null
  if (payload.status) flyer.status = payload.status as FlyerDeliverable["status"]
  if (payload.thumbnailUrl) flyer.thumbnailUrl = payload.thumbnailUrl
  if (payload.downloadUrl) flyer.downloadUrl = payload.downloadUrl
  await writeDeliverables(current)
  return flyer
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
