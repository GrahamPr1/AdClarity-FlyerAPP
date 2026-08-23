import { describe, it, expect } from "vitest"
import { verdictForMarker } from "@/lib/env"

/**
 * The rule this pins: nothing outside production may touch a database marked
 * "production".
 *
 * Preview is the case this file exists for. It used to only warn, so a
 * preview deployment wired to the production Redis served pull-request code
 * against live customer records — reading them, and writing them.
 */

describe("environment guardrail verdicts", () => {
  it("refuses development against the production database", () => {
    expect(verdictForMarker("development", "production")).toBe("refuse")
  })

  it("refuses PREVIEW against the production database", () => {
    // Regression guard: this was "warn", which meant it booted anyway.
    expect(verdictForMarker("preview", "production")).toBe("refuse")
  })

  it("lets each environment use its own database", () => {
    expect(verdictForMarker("development", "development")).toBe("ok")
    expect(verdictForMarker("preview", "preview")).toBe("ok")
    expect(verdictForMarker("production", "production")).toBe("ok")
  })

  it("never halts production, even on a mismatch", () => {
    // A misconfigured live site that still serves is better than a dark one.
    expect(verdictForMarker("production", "preview")).toBe("warn")
    expect(verdictForMarker("production", "development")).toBe("warn")
  })

  it("claims an unmarked database for whoever gets there first", () => {
    expect(verdictForMarker("development", null)).toBe("claim")
    expect(verdictForMarker("preview", null)).toBe("claim")
    expect(verdictForMarker("production", null)).toBe("claim")
  })

  it("warns on non-production mismatches rather than blocking", () => {
    // Crossing dev and preview wires is a mistake, but neither holds live
    // data, so there is nothing to protect by refusing to start.
    expect(verdictForMarker("development", "preview")).toBe("warn")
    expect(verdictForMarker("preview", "development")).toBe("warn")
  })

  it("treats an unrecognised marker as a non-blocking mismatch", () => {
    expect(verdictForMarker("preview", "staging")).toBe("warn")
  })
})
