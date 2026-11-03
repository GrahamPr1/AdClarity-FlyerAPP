import { describe, it, expect } from "vitest"
import { qrEnabled, planIncludesExtras, planAllowsAiPhotos, aiPhotosEnabled, leadCaptureEnabled } from "@/lib/agent-pipeline/plan-features"
import { PLAN_LIMITS } from "@/lib/types"

describe("plan limits", () => {
  it("are the advertised numbers", () => {
    // These are the figures on the pricing page and in the user's spec.
    // A silent change here is a billing/fairness bug, not a refactor.
    expect(PLAN_LIMITS).toEqual({ trial: 3, basic: 25, pro: 50 })
  })
})

describe("qrEnabled", () => {
  it("gives a QR to every plan that asked for one, Trial included", () => {
    expect(qrEnabled("trial", true)).toBe(true)
    expect(qrEnabled("basic", true)).toBe(true)
    expect(qrEnabled("pro", true)).toBe(true)
  })

  it("withholds it when the client declined", () => {
    expect(qrEnabled("trial", false)).toBe(false)
    expect(qrEnabled("basic", false)).toBe(false)
    expect(qrEnabled("pro", false)).toBe(false)
  })

  it("withholds it when the plan is unknown", () => {
    expect(qrEnabled(undefined, true)).toBe(false)
  })
})

describe("leadCaptureEnabled — Basic/Pro, not paused", () => {
  it("is on for active paid plans", () => {
    expect(leadCaptureEnabled({ plan: "basic", pausedAt: null })).toBe(true)
    expect(leadCaptureEnabled({ plan: "pro", pausedAt: null })).toBe(true)
  })

  it("is off on Trial, which is also where a cancelled subscription lands", () => {
    expect(leadCaptureEnabled({ plan: "trial", pausedAt: null })).toBe(false)
  })

  it("is off while paused, on any plan", () => {
    expect(leadCaptureEnabled({ plan: "pro", pausedAt: "2026-11-01T00:00:00.000Z" })).toBe(false)
    expect(leadCaptureEnabled({ plan: "basic", pausedAt: "2026-11-01T00:00:00.000Z" })).toBe(false)
  })

  it("is off when the owner has no record", () => {
    expect(leadCaptureEnabled(null)).toBe(false)
    expect(leadCaptureEnabled(undefined)).toBe(false)
  })
})

describe("aiPhotosEnabled — Pro only, and only on request", () => {
  it("generates for Pro when the client opted in", () => {
    expect(aiPhotosEnabled("pro", true)).toBe(true)
  })

  it("does NOT generate for Basic even with the flag set", () => {
    // The onboarding checkbox is disabled below Pro, but the form is not what
    // enforces this — a hand-crafted POST must not spend credits either.
    expect(aiPhotosEnabled("basic", true)).toBe(false)
  })

  it("does NOT generate for Trial even with the flag set", () => {
    expect(aiPhotosEnabled("trial", true)).toBe(false)
  })

  it("does not generate for Pro without an explicit opt-in", () => {
    // Defaults OFF, unlike QR: this spends real credits and puts invented
    // imagery on someone's marketing.
    expect(aiPhotosEnabled("pro", false)).toBe(false)
  })

  it("does not generate when the plan is unknown", () => {
    expect(aiPhotosEnabled(undefined, true)).toBe(false)
  })
})

describe("plan feature gates stay independent", () => {
  it("declining a QR does not disable the extra channels", () => {
    // Repurposing (Instagram/text/Nextdoor) is gated by plan alone. Folding
    // the QR opt-out into it would silently cost a paying client three
    // deliverables for unticking one box.
    expect(planIncludesExtras("basic")).toBe(true)
    expect(qrEnabled("basic", false)).toBe(false)
  })

  it("keeps AI photos Pro-only", () => {
    expect(planAllowsAiPhotos("pro")).toBe(true)
    expect(planAllowsAiPhotos("basic")).toBe(false)
    expect(planAllowsAiPhotos("trial")).toBe(false)
  })
})
