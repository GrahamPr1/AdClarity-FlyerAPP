import { describe, it, expect } from "vitest"
import { settleWithin, resolveTimeoutOutcome, PipelineTimeoutError } from "@/lib/agent-pipeline/pipeline"

/**
 * The bug: PIPELINE_TIMEOUT_MS answers "should we still be waiting?" — a
 * question about our own budget — and was being used to answer "did the
 * generation fail?", a question about the agent. A real run crossed the 285s
 * ceiling and the Flyer Agent returned successfully at 350s; the client was
 * shown Failed, with a retry button that would have burned a second
 * generation on work that was about to land.
 */

const later = <T,>(ms: number, value: T) => new Promise<T>((r) => setTimeout(() => r(value), ms))
const failsLater = (ms: number, msg: string) =>
  new Promise<never>((_, rej) => setTimeout(() => rej(new Error(msg)), ms))
const TIMEOUT = new PipelineTimeoutError("Generation timed out after 285s")

describe("settleWithin observes without abandoning", () => {
  it("reports a late success", async () => {
    expect(await settleWithin(later(10, "done"), 200)).toEqual({ state: "resolved", value: "done" })
  })

  it("reports a late failure as rejected, not as still-pending", async () => {
    const out = await settleWithin(failsLater(10, "model refused"), 200)
    expect(out.state).toBe("rejected")
  })

  it("reports still-pending when the work really is stuck", async () => {
    expect(await settleWithin(later(500, "too late"), 20)).toEqual({ state: "pending" })
  })

  it("does not crash on a rejection that lands after we stop watching", async () => {
    // Without the internal .catch() this surfaces as an unhandled rejection
    // and can take the process down well after the pipeline moved on.
    const doomed = failsLater(30, "late boom")
    expect(await settleWithin(doomed, 5)).toEqual({ state: "pending" })
    await new Promise((r) => setTimeout(r, 60))
  })
})

describe("resolveTimeoutOutcome decides what actually happened", () => {
  it("returns null — record SUCCESS — when work completes during the grace window", async () => {
    // The exact case that was mislabeled Failed.
    expect(await resolveTimeoutOutcome(later(10, undefined), TIMEOUT, "run-1", 200)).toBeNull()
  })

  it("returns the REAL error when the work genuinely failed", async () => {
    const out = await resolveTimeoutOutcome(failsLater(10, "Flyer Agent returned no result"), TIMEOUT, "run-2", 200)
    expect(out).toBeInstanceOf(Error)
    expect((out as Error).message).toBe("Flyer Agent returned no result")
    expect(out).not.toBeInstanceOf(PipelineTimeoutError)
  })

  it("still reports the timeout when the work is genuinely stalled", async () => {
    // The anti-stall guarantee PIPELINE_TIMEOUT_MS exists for. A frozen or
    // reclaimed function must not leave a flyer In Progress forever.
    const out = await resolveTimeoutOutcome(new Promise(() => {}), TIMEOUT, "run-3", 20)
    expect(out).toBe(TIMEOUT)
  })

  it("passes a non-timeout error straight through, untouched", async () => {
    // A real agent error must not be given a grace window — it already
    // failed, and waiting on it would only delay the Failed state.
    const real = new Error("Anthropic 500")
    expect(await resolveTimeoutOutcome(new Promise(() => {}), real, "run-4", 20)).toBe(real)
  })
})
