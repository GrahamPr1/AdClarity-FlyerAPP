import { test, expect, type Page } from "@playwright/test"
import { adminStateFile } from "./auth-paths"

/**
 * Deleting an account is irreversible, so the property that matters is not
 * "delete works" but "delete REFUSES anything it shouldn't touch".
 *
 * The endpoint deliberately does not trust the list it is given: it re-runs
 * the audit against live data and drops anything its own heuristics rate
 * "looks-real". These tests pin that, because a regression here destroys a
 * paying customer's account rather than merely showing a wrong number.
 *
 * Requires `npm run seed:dev`.
 */

const BASE = "http://localhost:3000"

async function attemptDelete(page: Page, emails: string[]) {
  const res = await page.request.fetch(`${BASE}/api/admin/audit`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    // Always a dry run: these assert the refusal logic, and must never be
    // able to destroy the fixtures they run against.
    data: { emails, dryRun: true },
  })
  return { status: res.status(), body: await res.json() }
}

test.describe("authenticated as admin", () => {
  // `provide`, not `use` — a param named `use` trips the react-hooks lint
  // rule, which reads it as React's use() hook. Playwright does not care.
  test.use({ storageState: ({}, provide, testInfo) => provide(adminStateFile(testInfo.project.name)) })

test("refuses to delete an account the audit considers real", async ({ page }) => {
  const { body } = await attemptDelete(page, ["sarah@millerheatingandair.com"])
  expect(body.wouldDelete).toEqual([])
  expect(body.refused[0].reason).toMatch(/not currently flagged/i)
})

test("refuses an address that does not exist", async ({ page }) => {
  const { body } = await attemptDelete(page, ["nobody@nowhere.example"])
  expect(body.wouldDelete).toEqual([])
  expect(body.refused).toHaveLength(1)
})

test("refuses to delete the signed-in admin", async ({ page }, testInfo) => {
  const { body } = await attemptDelete(page, [`admin-audit-${testInfo.project.name}@dev.invalid`])
  expect(body.wouldDelete).toEqual([])
  expect(body.refused[0].reason).toMatch(/signed-in admin/i)
})

test("allows a genuinely flagged row, and reports what would go", async ({ page }, testInfo) => {
  const target = `qr-basic-${testInfo.project.name}@dev.invalid`
  const { body } = await attemptDelete(page, [target])
  expect(body.wouldDelete).toContain(target)
  expect(body.details[0].keyCount).toBeGreaterThan(0)
  // Dry run must not have touched anything.
  const after = await attemptDelete(page, [target])
  expect(after.body.wouldDelete).toContain(target)
})

})

test("rejects a non-admin outright", async ({ request }) => {
  const res = await request.fetch(`${BASE}/api/admin/audit`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    data: { emails: ["anything@dev.invalid"], dryRun: true },
  })
  expect(res.status()).toBe(401)
})
