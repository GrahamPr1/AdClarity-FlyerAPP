import { describe, it, expect } from "vitest"
import fs from "node:fs"
import path from "node:path"

/**
 * GA4 is opt-in by configuration. These pin the two properties that keep it
 * from becoming a liability: it must not run without an explicit Measurement
 * ID (so dev and preview traffic can't pollute production's numbers, and no
 * cookie is set on a visitor before the ID exists), and EEA/UK visitors must
 * default to storage denied.
 */
const SRC = fs.readFileSync(path.join(process.cwd(), "components/google-analytics.tsx"), "utf8")

describe("Google Analytics wiring", () => {
  it("reads the Measurement ID from the environment, never hardcoded", () => {
    expect(SRC).toContain("process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID")
    // A hardcoded G-XXXX in source is exactly what "don't ship a test ID by
    // accident" means.
    expect(SRC).not.toMatch(/["']G-[A-Z0-9]{6,}["']/)
  })

  it("renders nothing at all when the ID is absent", () => {
    expect(SRC).toMatch(/if \(!id\) return null/)
  })

  it("sets consent defaults BEFORE loading gtag.js", () => {
    const consentAt = SRC.indexOf("gtag('consent','default'")
    const libAt = SRC.indexOf("googletagmanager.com/gtag/js")
    expect(consentAt).toBeGreaterThan(-1)
    expect(libAt).toBeGreaterThan(-1)
    expect(consentAt, "a default applied after gtag.js loads is too late").toBeLessThan(libAt)
  })

  it("denies analytics storage for the EEA and UK by default", () => {
    expect(SRC).toMatch(/analytics_storage:'denied'/)
    for (const cc of ["DE", "FR", "IE", "GB"]) expect(SRC).toContain(`"${cc}"`)
  })

  it("denies advertising signals everywhere, unconditionally", () => {
    // This site runs no ads; there is nothing for these to enable.
    const tail = SRC.slice(SRC.lastIndexOf("gtag('consent','default'"))
    expect(tail).toMatch(/ad_storage:'denied'/)
    expect(tail).toMatch(/ad_user_data:'denied'/)
    expect(tail).toMatch(/ad_personalization:'denied'/)
  })
})

describe("privacy policy matches what we actually run", () => {
  const PRIVACY = fs.readFileSync(path.join(process.cwd(), "app/privacy/page.tsx"), "utf8")

  it("discloses Google Analytics", () => {
    expect(PRIVACY).toMatch(/Google Analytics/)
  })

  it("no longer claims we run no third-party analytics", () => {
    // The page said "no third-party analytics pixels" before GA4 existed.
    // Shipping GA4 without changing that would have made the policy false.
    expect(PRIVACY).not.toMatch(/no third-party analytics/i)
  })

  it("still promises no ad retargeting, which remains true", () => {
    expect(PRIVACY).toMatch(/no ad retargeting/i)
  })
})
