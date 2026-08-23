// ---------------------------------------------------------------------------
// Environment resolution and configuration guardrails.
//
// Motivating incident: local development and production were pointed at the
// SAME Upstash instance and signed sessions with the SAME secret. Running the
// dev server therefore wrote to live customer data, and a leak of a laptop's
// .env.local would have let anyone forge a production session for any email.
//
// Nothing here hardcodes a credential or a hostname. Instead each Redis
// instance is asked to identify itself (see assertRedisMatchesEnvironment in
// lib/store.ts): the database stores a marker saying which environment it
// belongs to, and development refuses to run against one that says
// "production". That works the moment a second database exists, without this
// file ever needing to know a connection string.
// ---------------------------------------------------------------------------

export type AppEnvironment = "development" | "preview" | "production"

/**
 * Which environment this process is running as.
 *
 * VERCEL_ENV is authoritative on Vercel and is exactly the three values we
 * want. APP_ENV is an explicit override for local use (e.g. deliberately
 * running a local process against preview). NODE_ENV is the last resort,
 * because Next sets it to "production" for a local `next build`, which is a
 * build mode rather than a deployment target.
 */
export function getAppEnvironment(): AppEnvironment {
  const vercel = process.env.VERCEL_ENV
  if (vercel === "production" || vercel === "preview" || vercel === "development") return vercel

  const explicit = process.env.APP_ENV
  if (explicit === "production" || explicit === "preview" || explicit === "development") return explicit

  return process.env.NODE_ENV === "production" ? "production" : "development"
}

export function isProduction(): boolean {
  return getAppEnvironment() === "production"
}

/** What to do when a database's self-declared marker doesn't match this process. */
export type MarkerVerdict =
  /** Marker matches — proceed. */
  | "ok"
  /** Unmarked database — label it for this environment and proceed. */
  | "claim"
  /** Hard stop: refuse to touch this database at all. */
  | "refuse"
  /** Mismatch worth shouting about, but not worth halting for. */
  | "warn"

/**
 * The environment guardrail's decision, as a pure function so it can be
 * tested without a Redis connection.
 *
 * The rule that matters: anything that is not production REFUSES a database
 * marked "production". That covers a laptop (the incident that prompted this)
 * and preview deployments (which previously only warned, so any pull request
 * ran against live customer data).
 *
 * Production itself only ever warns. A marker mismatch is a configuration
 * error, and taking the live site down over one is worse than the mismatch.
 */
export function verdictForMarker(expected: AppEnvironment, actual: string | null): MarkerVerdict {
  if (actual === null) return "claim"
  if (actual === expected) return "ok"
  if (actual === "production" && expected !== "production") return "refuse"
  return "warn"
}

/** Variables without which the app cannot function at all. */
const REQUIRED = ["UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN", "SESSION_SECRET"] as const

/**
 * Variables the app degrades without but still runs: generation, email, and
 * uploads each fail closed with their own handled errors rather than
 * preventing boot.
 */
const OPTIONAL = ["ANTHROPIC_API_KEY", "RESEND_API_KEY", "BLOB_READ_WRITE_TOKEN", "DASHBOARD_PASSWORD", "NEXT_PUBLIC_SITE_URL"] as const

export interface EnvReport {
  environment: AppEnvironment
  /** Names only — never values. */
  missingRequired: string[]
  missingOptional: string[]
  /** Non-secret, non-identifying fingerprint so two environments can be compared without revealing anything. */
  sessionSecretFingerprint: string
  redisHostFingerprint: string
}

/**
 * A short, non-reversible fingerprint. Enough to answer "are these two
 * environments using the same value?" without disclosing any part of it.
 * Truncated deliberately: it is a comparison aid, not a credential.
 */
function fingerprint(value: string | undefined): string {
  if (!value) return "unset"
  let h = 2166136261
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0).toString(16).padStart(8, "0").slice(0, 8)
}

export function describeEnvironment(): EnvReport {
  return {
    environment: getAppEnvironment(),
    missingRequired: REQUIRED.filter((k) => !process.env[k]?.trim()),
    missingOptional: OPTIONAL.filter((k) => !process.env[k]?.trim()),
    sessionSecretFingerprint: fingerprint(process.env.SESSION_SECRET),
    // Host only, hashed — the token is never involved.
    redisHostFingerprint: fingerprint(process.env.UPSTASH_REDIS_REST_URL),
  }
}

/**
 * Throws when a required variable is missing. Called by the diagnostic script
 * rather than at import time: a hard failure during module load would take
 * the whole deployment down for a missing OPTIONAL-adjacent value, and
 * lib/store.ts and lib/auth.ts already fail clearly on their own.
 */
export function assertRequiredEnv(): void {
  const missing = describeEnvironment().missingRequired
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`)
  }
}
