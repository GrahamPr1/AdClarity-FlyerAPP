import { describe, it, expect } from "vitest"
import fs from "node:fs"
import path from "node:path"

/**
 * The Print button loads the flyer into a hidden iframe and calls print() on
 * it. A sandbox without `allow-modals` blocks that dialog outright, so the
 * header is load-bearing for the feature.
 *
 * `allow-scripts` must stay absent. The HTML is model-written and served from
 * our own origin; with scripting it could reach this origin's cookies. These
 * assert the exact policy rather than a browser behaviour, because a CSP
 * `sandbox` directive is ignored in a <meta> tag and can only be tested for
 * real through the served header — which the route source is the source of
 * truth for.
 */
const ROUTE = fs.readFileSync(path.join(process.cwd(), "app/api/flyers/[id]/view/route.ts"), "utf8")
const CSP = /"Content-Security-Policy":\s*"([^"]+)"/.exec(ROUTE)?.[1] ?? ""

describe("flyer view sandbox", () => {
  it("declares a sandbox at all", () => {
    expect(CSP).toMatch(/^sandbox\b/)
  })

  it("allows the print dialog", () => {
    expect(CSP, "without allow-modals the Print button silently does nothing").toContain("allow-modals")
  })

  it("keeps same-origin so the parent can reach the frame to print it", () => {
    expect(CSP).toContain("allow-same-origin")
  })

  it("does NOT allow scripts — model-written HTML must stay inert", () => {
    expect(CSP).not.toContain("allow-scripts")
  })

  it("does not allow popups, forms, or top-level navigation", () => {
    for (const capability of ["allow-popups", "allow-forms", "allow-top-navigation", "allow-downloads"]) {
      expect(CSP, `${capability} has no reason to be granted`).not.toContain(capability)
    }
  })

  it("applies the print/scroll injection on read, so stored flyers benefit too", () => {
    expect(ROUTE).toMatch(/ensureScrollable\(/)
  })
})
