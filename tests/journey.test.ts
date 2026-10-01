import { describe, expect, it } from "vitest"
import {
  deriveJourney,
  journeyComplete,
  nextStep,
  type JourneyFacts,
  type JourneyStepId,
} from "@/lib/journey"

/**
 * The journey must never claim work that did not happen.
 *
 * That is the whole point of it — the scan Control Center earned trust by
 * refusing to tick a box for a logo it never found, and a progress strip
 * across the rest of the product is only worth having if it holds the same
 * line. These tests are mostly about what it must NOT say.
 */

const nothing: JourneyFacts = {
  hasProfile: false,
  profileComplete: false,
  scannedPages: 0,
  scanDeclined: false,
  productCount: 0,
  readyFlyerCount: 0,
  generatingFlyerCount: 0,
  generationStage: null,
  hasExported: false,
  qrScans: 0,
  hasTrackingCodes: false,
}

const status = (facts: Partial<JourneyFacts>) =>
  Object.fromEntries(deriveJourney({ ...nothing, ...facts }).map((s) => [s.id, s.status])) as Record<
    JourneyStepId,
    string
  >

const detail = (facts: Partial<JourneyFacts>, id: JourneyStepId) =>
  deriveJourney({ ...nothing, ...facts }).find((s) => s.id === id)?.detail

describe("a brand new account", () => {
  it("starts on the scan and nothing is claimed", () => {
    const s = status({})
    expect(s.scan).toBe("current")
    expect(s.profile).toBe("pending")
    expect(s.product).toBe("blocked")
    expect(s.options).toBe("blocked")
    expect(s.export).toBe("blocked")
  })

  it("has exactly one next action", () => {
    expect(nextStep(deriveJourney(nothing))?.id).toBe("scan")
    expect(deriveJourney(nothing).filter((s) => s.status === "current")).toHaveLength(1)
  })

  it("is not complete", () => {
    expect(journeyComplete(deriveJourney(nothing))).toBe(false)
  })
})

describe("the scan step", () => {
  it("counts only pages a crawl really read", () => {
    expect(detail({ scannedPages: 4, hasProfile: true, profileComplete: true }, "scan")).toBe("4 pages read")
    expect(detail({ scannedPages: 1, hasProfile: true, profileComplete: true }, "scan")).toBe("1 page read")
  })

  it("is SKIPPED, not done and not failed, when there was no website to scan", () => {
    // A client with no website has not failed at anything. Showing a tick
    // would claim a scan happened; showing a cross would blame them.
    const s = status({ scanDeclined: true, hasProfile: true, profileComplete: true })
    expect(s.scan).toBe("skipped")
    expect(detail({ scanDeclined: true, hasProfile: true, profileComplete: true }, "scan")).toBe("Filled in by hand")
  })

  it("is skipped for an established account whose profile predates the scanner", () => {
    // Backfilled profile, no scannedPages. It must not say a scan ran.
    expect(status({ hasProfile: true, profileComplete: true }).scan).toBe("skipped")
  })

  it("never shows as done without pages", () => {
    for (const facts of [{}, { hasProfile: true }, { scanDeclined: true }]) {
      expect(status(facts).scan).not.toBe("done")
    }
  })
})

describe("the profile step", () => {
  it("is not done just because a profile record exists", () => {
    // A half-filled profile is the case that silently produces bad flyers.
    const s = status({ hasProfile: true, profileComplete: false })
    expect(s.profile).toBe("current")
    expect(detail({ hasProfile: true, profileComplete: false }, "profile")).toBe("Needs a few details")
  })

  it("is done when the profile carries what a flyer needs", () => {
    expect(status({ hasProfile: true, profileComplete: true, scannedPages: 2 }).profile).toBe("done")
  })
})

describe("the product step", () => {
  it("is blocked, with the reason, until there is a business profile", () => {
    expect(status({ hasProfile: true, profileComplete: false }).product).toBe("blocked")
    expect(detail({}, "product")).toBe("Needs your business profile first")
  })

  it("counts what is actually saved", () => {
    const facts = { hasProfile: true, profileComplete: true, productCount: 2 }
    expect(status(facts).product).toBe("done")
    expect(detail(facts, "product")).toBe("2 saved")
  })
})

describe("the options step", () => {
  const ready = { hasProfile: true, profileComplete: true, productCount: 1 }

  it("reports the pipeline's own stage while generating, not a guess", () => {
    const facts = { ...ready, generatingFlyerCount: 3, generationStage: "Designing your flyer" }
    expect(status(facts).options).toBe("current")
    expect(detail(facts, "options")).toBe("Designing your flyer")
  })

  it("does not claim options exist while they are still generating", () => {
    expect(status({ ...ready, generatingFlyerCount: 3 }).options).not.toBe("done")
    expect(detail({ ...ready, generatingFlyerCount: 3 }, "options")).toBe("Generating…")
  })

  it("is done only once something is actually Ready", () => {
    const facts = { ...ready, readyFlyerCount: 3 }
    expect(status(facts).options).toBe("done")
    expect(detail(facts, "options")).toBe("3 ready to pick")
  })
})

describe("the export step", () => {
  const options = { hasProfile: true, profileComplete: true, productCount: 1, readyFlyerCount: 2 }

  it("is blocked, with the reason, while nothing is finished", () => {
    expect(status({ hasProfile: true, profileComplete: true, productCount: 1 }).export).toBe("blocked")
    expect(detail({}, "export")).toBe("Nothing finished to export yet")
  })

  it("is not done until a real export was served", () => {
    expect(status(options).export).toBe("current")
  })

  it("is done once one was, and then reports real scans", () => {
    expect(status({ ...options, hasExported: true }).export).toBe("done")
    expect(detail({ ...options, hasExported: true, qrScans: 12, hasTrackingCodes: true }, "export")).toBe(
      "12 QR scans so far",
    )
    expect(detail({ ...options, hasExported: true, qrScans: 1, hasTrackingCodes: true }, "export")).toBe(
      "1 QR scan so far",
    )
  })

  it("says how scans would appear rather than inventing a number", () => {
    expect(detail({ ...options, hasExported: true, qrScans: 0, hasTrackingCodes: true }, "export")).toBe(
      "Share it and QR scans show up here",
    )
  })

  it("does not promise QR scans to an account whose flyers carry no code", () => {
    // QR tracking is a paid feature. A Free Trial flyer has no code on it,
    // so telling them scans will "show up here" sells them something their
    // plan does not include.
    expect(detail({ ...options, hasExported: true, qrScans: 0, hasTrackingCodes: false }, "export")).toBe(
      "Ready to hand out",
    )
  })
})

describe("the whole journey", () => {
  const finished: JourneyFacts = {
    ...nothing,
    hasProfile: true,
    profileComplete: true,
    scannedPages: 5,
    productCount: 1,
    readyFlyerCount: 3,
    hasExported: true,
    qrScans: 7,
    hasTrackingCodes: true,
  }

  it("completes", () => {
    expect(journeyComplete(deriveJourney(finished))).toBe(true)
    expect(nextStep(deriveJourney(finished))).toBeNull()
  })

  it("counts a skipped scan as complete — it is not outstanding work", () => {
    const noWebsite = { ...finished, scannedPages: 0, scanDeclined: true }
    expect(journeyComplete(deriveJourney(noWebsite))).toBe(true)
  })

  it("never shows two next actions at once, in any reachable state", () => {
    const axes: Partial<JourneyFacts>[] = [
      {}, { hasProfile: true }, { hasProfile: true, profileComplete: true },
      { hasProfile: true, profileComplete: true, productCount: 1 },
      { hasProfile: true, profileComplete: true, productCount: 1, generatingFlyerCount: 2 },
      { hasProfile: true, profileComplete: true, productCount: 1, readyFlyerCount: 2 },
      { ...finished }, { scanDeclined: true }, { scannedPages: 3 },
      // Out-of-order states a real account can reach: a product saved
      // before the profile was finished, flyers from before products
      // existed, an export with everything else since deleted.
      { productCount: 1 }, { readyFlyerCount: 4 }, { hasExported: true },
      { hasExported: true, readyFlyerCount: 0, productCount: 0 },
    ]
    for (const facts of axes) {
      const steps = deriveJourney({ ...nothing, ...facts })
      expect(
        steps.filter((s) => s.status === "current").length,
        `${JSON.stringify(facts)} produced ${steps.filter((s) => s.status === "current").map((s) => s.id)}`,
      ).toBeLessThanOrEqual(1)
    }
  })

  it("keeps the steps in the order the product presents them", () => {
    expect(deriveJourney(finished).map((s) => s.id)).toEqual([
      "scan", "profile", "product", "options", "export",
    ])
  })
})
