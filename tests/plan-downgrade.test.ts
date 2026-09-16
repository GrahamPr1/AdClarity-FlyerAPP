import { describe, it, expect } from "vitest"
import { isPlanUpgrade, PLAN_RANK, PLAN_LIMITS, type PlanId } from "@/lib/types"

/**
 * /onboarding?plan= applied whatever plan the URL named. A plain GET to
 * /onboarding?plan=trial therefore revoked a paid tier — and with Early Access
 * on, the free-trial card is the only live pricing CTA, so "Start Free Trial"
 * silently undid an admin's upgrade with no record of why.
 */
describe("plan ordering", () => {
  it("ranks every plan, with no ties", () => {
    const ranks = Object.values(PLAN_RANK)
    expect(new Set(ranks).size).toBe(ranks.length)
    expect(Object.keys(PLAN_RANK).sort()).toEqual(Object.keys(PLAN_LIMITS).sort())
  })

  it("treats moving up as an upgrade", () => {
    expect(isPlanUpgrade("trial", "basic")).toBe(true)
    expect(isPlanUpgrade("trial", "pro")).toBe(true)
    expect(isPlanUpgrade("basic", "pro")).toBe(true)
  })

  it("does NOT treat a downgrade as an upgrade — the actual bug", () => {
    expect(isPlanUpgrade("pro", "trial")).toBe(false)
    expect(isPlanUpgrade("pro", "basic")).toBe(false)
    expect(isPlanUpgrade("basic", "trial")).toBe(false)
  })

  it("treats a no-op as not an upgrade, so nothing is rewritten", () => {
    for (const p of Object.keys(PLAN_RANK) as PlanId[]) {
      expect(isPlanUpgrade(p, p)).toBe(false)
    }
  })
})

describe("the onboarding ?plan= guard", () => {
  // Mirrors app/onboarding/page.tsx: apply only when it is an upgrade.
  const applyParam = (current: PlanId, param: PlanId): PlanId =>
    isPlanUpgrade(current, param) ? param : current

  it("keeps Pro when the free-trial CTA is clicked afterwards", () => {
    expect(applyParam("pro", "trial")).toBe("pro")
  })

  it("still upgrades a trial account that picks Pro", () => {
    expect(applyParam("trial", "pro")).toBe("pro")
  })

  it("never lowers a plan for any pairing", () => {
    const plans = Object.keys(PLAN_RANK) as PlanId[]
    for (const current of plans) {
      for (const param of plans) {
        expect(PLAN_RANK[applyParam(current, param)]).toBeGreaterThanOrEqual(PLAN_RANK[current])
      }
    }
  })
})
