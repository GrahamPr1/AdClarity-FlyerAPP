import { getAppEnvironment } from "./lib/env"

/**
 * Runs once per server process, before it serves anything (Next.js
 * instrumentation hook).
 *
 * Its only job is the environment guardrail: confirm the Redis instance this
 * process is about to use actually belongs to this environment. Placed here
 * rather than in a request path so it costs one GET per process instead of
 * one per request, and so a development server pointed at production fails at
 * boot — loudly, before it can write a single key — instead of quietly
 * corrupting live data.
 *
 * Production only ever warns (see assertRedisMatchesEnvironment): a marker
 * mismatch must never be able to take a live deployment down.
 */
export async function register() {
  // Guard is Node-only; the edge runtime has no Redis client here.
  if (process.env.NEXT_RUNTIME !== "nodejs") return

  const { assertRedisMatchesEnvironment } = await import("./lib/store")
  try {
    await assertRedisMatchesEnvironment()
  } catch (err) {
    // Rethrow in development so the server refuses to start. In any other
    // environment this has already been downgraded to a warning upstream.
    if (getAppEnvironment() === "development") throw err
    console.error("[env]", err instanceof Error ? err.message : err)
  }
}
