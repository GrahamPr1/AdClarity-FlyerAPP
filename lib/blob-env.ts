import { list, put } from "@vercel/blob"
import { getAppEnvironment, environmentClass, verdictForMarker } from "./env"

/**
 * The same guardrail as Redis, applied to Vercel Blob.
 *
 * BLOB_READ_WRITE_TOKEN used to be a single variable scoped to production,
 * preview AND development, so a laptop running `npm run dev` wrote customer
 * photos straight into the live store — the identical shape of bug that had
 * development sharing production's Redis. Credentials are now split, and this
 * makes the split ENFORCED rather than remembered: the store says which class
 * of environment it belongs to, and a non-production process refuses to start
 * against one marked "production".
 *
 * Marker by CLASS, not by exact environment. Unlike Redis there is one shared
 * non-production store for both development and preview, so "nonproduction"
 * is the finest distinction the marker can honestly make. The rule being
 * enforced is unchanged — see verdictForMarker in lib/env.ts, which both
 * resources share.
 *
 * Stored as an empty blob whose PATHNAME carries the marker
 * (`__environment/production`). Reading it is then a single `list()` — one
 * advanced operation, no download and no Blob Data Transfer — rather than a
 * fetch of the object's contents on every cold start.
 */
const MARKER_PREFIX = "__environment/"

let blobCheck: Promise<void> | null = null

/** Reads the store's marker without asserting. Returns null on an unmarked store. */
export async function readBlobEnvironmentMarker(): Promise<string | null> {
  const { blobs } = await list({ prefix: MARKER_PREFIX, limit: 10 })
  if (blobs.length === 0) return null
  // Deterministic if a store somehow carries two markers: the alphabetically
  // first wins, and "production" sorts before "nonproduction" is false — so
  // prefer an explicit production marker to avoid ever treating a production
  // store as safe on a tie.
  const names = blobs.map((b) => b.pathname.slice(MARKER_PREFIX.length)).filter(Boolean)
  return names.includes("production") ? "production" : (names[0] ?? null)
}

/** Labels the connected store. Used by scripts/env-check.ts on a fresh store. */
export async function setBlobEnvironmentMarker(marker: string): Promise<void> {
  await put(`${MARKER_PREFIX}${marker}`, Buffer.alloc(0), {
    access: "private",
    contentType: "text/plain",
    addRandomSuffix: false,
  })
}

/**
 * Throws when a non-production process is pointed at the production store.
 *
 * Memoised, so it costs one list() per server process rather than one per
 * upload. Silently returns when Blob isn't configured at all — uploads
 * already fail closed with their own clear error, and a missing optional
 * integration must not stop the app booting.
 */
export function assertBlobMatchesEnvironment(): Promise<void> {
  blobCheck ??= (async () => {
    if (!process.env.BLOB_READ_WRITE_TOKEN?.trim()) return

    const environment = getAppEnvironment()
    const expected = environmentClass(environment)

    let actual: string | null = null
    try {
      actual = await readBlobEnvironmentMarker()
    } catch {
      return // A transient Blob error is the caller's problem, not this guard's.
    }

    const verdict = verdictForMarker(expected, actual)
    if (verdict === "ok") return

    if (verdict === "claim") {
      // Unmarked store — claim it. First writer wins, same as Redis, so a
      // brand-new non-production store labels itself on first use.
      await setBlobEnvironmentMarker(expected).catch(() => {})
      return
    }

    const message =
      `Blob environment mismatch: this process is "${environment}" (${expected}) but the connected ` +
      `Blob store is marked "${actual}". Check BLOB_READ_WRITE_TOKEN for this environment.`

    if (verdict === "refuse") {
      throw new Error(
        `${message}\n\nRefusing to run ${environment} against the production Blob store. ` +
          `Point BLOB_READ_WRITE_TOKEN for this environment at the non-production store ` +
          `(see docs/local-development.md), or set APP_ENV explicitly if this is genuinely intentional.`,
      )
    }

    console.warn(`[env] ${message}`)

    // Production keeps running on a mismatch for the same reason it does for
    // Redis — a dark site is the worse failure — which is exactly why nobody
    // would otherwise notice that uploads are landing in the wrong store.
    if (environment === "production") {
      try {
        const { sendOperationalAlert } = await import("./email")
        const result = await sendOperationalAlert("OneFlyer: production is using the WRONG Blob store", [
          message,
          "Customer photo uploads are being written to a non-production store, and photos already on live flyers may not resolve.",
          "Production deliberately does not refuse to boot on this condition, so it will keep serving until BLOB_READ_WRITE_TOKEN for Production is corrected.",
        ])
        console.error(
          result.sent
            ? "[env] Alert email sent: wrong Blob store"
            : `[env] Alert email NOT sent (${result.reason}): wrong Blob store`,
        )
      } catch (err) {
        console.error("[env] Blob alerting failed:", err instanceof Error ? err.message : err)
      }
    }
  })()
  return blobCheck
}
