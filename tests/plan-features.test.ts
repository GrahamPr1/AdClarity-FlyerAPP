import { describe, it, expect } from "vitest"
import { qrEnabled, planIncludesExtras, planAllowsAiPhotos, aiPhotosEnabled, coloringPagesEnabled } from "@/lib/agent-pipeline/plan-features"
import { PLAN_LIMITS } from "@/lib/types"

describe("plan limits", () => {
  it("are the advertised numbers", () => {
    // These are the figures on the pricing page and in the user's spec.
    // A silent change here is a billing/fairness bug, not a refactor.
    expect(PLAN_LIMITS).toEqual({ trial: 3, basic: 25, pro: 50 })
  })
})

describe("qrEnabled", () => {
  it("gives a QR to paid plans that asked for one", () => {
    expect(qrEnabled("basic", true)).toBe(true)
    expect(qrEnabled("pro", true)).toBe(true)
  })

  it("withholds it when a paid client declined", () => {
    expect(qrEnabled("basic", false)).toBe(false)
    expect(qrEnabled("pro", false)).toBe(false)
  })

  it("withholds it on trial even when the submitted flag says true", () => {
    // The onboarding checkbox is disabled on Trial, but the form is not what
    // enforces this — a hand-crafted POST must not get a QR either.
    expect(qrEnabled("trial", true)).toBe(false)
  })

  it("withholds it when the plan is unknown", () => {
    expect(qrEnabled(undefined, true)).toBe(false)
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

describe("coloringPagesEnabled — Pro only", () => {
  it("allows Pro", () => {
    expect(coloringPagesEnabled("pro")).toBe(true)
  })

  it("refuses Basic and Trial", () => {
    // The pickers show it locked rather than hiding it, so a Basic client can
    // see what upgrading buys — which means the server is the only thing
    // actually stopping them.
    expect(coloringPagesEnabled("basic")).toBe(false)
    expect(coloringPagesEnabled("trial")).toBe(false)
  })

  it("refuses an unknown plan", () => {
    expect(coloringPagesEnabled(undefined)).toBe(false)
  })

  it("is a tier gate, not an allowance change", () => {
    // A coloring page still costs one campaign credit; that was decided
    // separately and is unchanged. This only answers "which tier".
    expect(coloringPagesEnabled("pro")).toBe(true)
    expect(PLAN_LIMITS.pro).toBe(50)
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
