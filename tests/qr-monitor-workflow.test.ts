import { describe, it, expect } from "vitest"
import fs from "node:fs"
import path from "node:path"

/** The hourly QR monitor stays QR-only, reads its settings, covers both hosts, and can't pass unconfigured. */
const yml = fs.readFileSync(path.join(process.cwd(), ".github/workflows/qr-canary.yml"), "utf8")
const steps = yml.split("\n").filter((l) => !l.trim().startsWith("#")).join("\n")

describe("the QR monitor workflow", () => {
  it("runs hourly and can be started by hand", () => {
    expect(steps).toContain('cron: "17 * * * *"')
    expect(steps).toContain("workflow_dispatch")
  })

  it("reads the code and business name from repository variables", () => {
    expect(steps).toContain("QR_CHECK_CODE: ${{ vars.QR_CHECK_CODE }}")
    expect(steps).toContain("QR_CHECK_TEXT: ${{ vars.QR_CHECK_TEXT }}")
  })

  it("fails when either is missing, before it checks anything", () => {
    expect(steps).toMatch(/-z "\$QR_CHECK_CODE" \] \|\| \[ -z "\$QR_CHECK_TEXT"[\s\S]*exit 1/)
    expect(steps.indexOf("exit 1")).toBeLessThan(steps.indexOf("check-legacy-domain.mjs --canary"))
  })

  it("checks both hosts every time: neither check depends on the other passing", () => {
    for (const id of ["legacy", "canonical"]) {
      const step = steps.slice(steps.indexOf(`id: ${id}`), steps.indexOf("run:", steps.indexOf(`id: ${id}`)))
      // Runs whatever the other host did, but not when setup itself failed,
      // which would otherwise read as "QR codes are down on both hosts".
      expect(step, id).toContain("if: ${{ !cancelled() && steps.settings.outcome == 'success' && steps.node.outcome == 'success' }}")
    }
  })

  it("keeps the one-minute retry on each host", () => {
    expect(steps.match(/\|\| \(sleep 60 && node scripts\/check-legacy-domain\.mjs/g)).toHaveLength(2)
  })

  it("names the failing host: older flyers, newer flyers, or both", () => {
    expect(steps).toContain("LEGACY: ${{ steps.legacy.outcome }}")
    expect(steps).toContain("CANONICAL: ${{ steps.canonical.outcome }}")
    expect(steps).toContain("failing on BOTH hosts")
    expect(steps).toContain("OLDER printed flyers")
    expect(steps).toContain("NEWER flyers")
    expect(steps).toContain("GITHUB_STEP_SUMMARY")
  })

  it("is QR-only, on both hosts: every check runs in --canary mode", () => {
    const runs = [...steps.matchAll(/node scripts\/check-legacy-domain\.mjs[^|\n)]*/g)].map((m) => m[0])
    expect(runs.length).toBeGreaterThan(0)
    for (const run of runs) expect(run).toContain("--canary")
    expect(runs.some((r) => r.includes("--legacy https://oneflyer.org"))).toBe(true)
    expect(runs.some((r) => !r.includes("--legacy"))).toBe(true)
  })
})
