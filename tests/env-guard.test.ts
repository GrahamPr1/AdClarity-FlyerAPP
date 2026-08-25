import { describe, it, expect } from "vitest"
import { verdictForMarker, environmentClass } from "@/lib/env"

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

/**
 * Blob reuses the same verdict logic, but its marker names a CLASS: there is
 * one shared non-production store for development and preview, so
 * "nonproduction" is the finest distinction it can honestly make.
 */
describe("Blob store guardrail (class-based marker)", () => {
  it("maps every non-production environment to the same class", () => {
    expect(environmentClass("development")).toBe("nonproduction")
    expect(environmentClass("preview")).toBe("nonproduction")
    expect(environmentClass("production")).toBe("production")
  })

  it("refuses development AND preview against the production Blob store", () => {
    // The bug this closes: BLOB_READ_WRITE_TOKEN was one variable scoped to
    // all three environments, so a laptop wrote customer photos to the live
    // store.
    expect(verdictForMarker(environmentClass("development"), "production")).toBe("refuse")
    expect(verdictForMarker(environmentClass("preview"), "production")).toBe("refuse")
  })

  it("lets development and preview share one non-production store", () => {
    expect(verdictForMarker(environmentClass("development"), "nonproduction")).toBe("ok")
    expect(verdictForMarker(environmentClass("preview"), "nonproduction")).toBe("ok")
  })

  it("lets production use its own store", () => {
    expect(verdictForMarker(environmentClass("production"), "production")).toBe("ok")
  })

  it("never halts production, even pointed at the wrong store", () => {
    expect(verdictForMarker(environmentClass("production"), "nonproduction")).toBe("warn")
  })

  it("claims an unmarked store for whichever class reaches it first", () => {
    expect(verdictForMarker(environmentClass("development"), null)).toBe("claim")
    expect(verdictForMarker(environmentClass("production"), null)).toBe("claim")
  })
})
