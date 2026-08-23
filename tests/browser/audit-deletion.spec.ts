import { test, expect, type Page } from "@playwright/test"

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

async function loginAsAdmin(page: Page) {
  await page.goto(`${BASE}/login`)
  await page.getByLabel(/email/i).first().fill("admin-audit@dev.invalid")
  await page.getByLabel(/password/i).first().fill("DevTest!2345")
  await page.getByRole("button", { name: /log in|sign in/i }).first().click()
  await page.waitForURL(/\/(dashboard|admin)/, { timeout: 20000 })
}

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

test("refuses to delete an account the audit considers real", async ({ page }) => {
  await loginAsAdmin(page)
  const { body } = await attemptDelete(page, ["sarah@millerheatingandair.com"])
  expect(body.wouldDelete).toEqual([])
  expect(body.refused[0].reason).toMatch(/not currently flagged/i)
})

test("refuses an address that does not exist", async ({ page }) => {
  await loginAsAdmin(page)
  const { body } = await attemptDelete(page, ["nobody@nowhere.example"])
  expect(body.wouldDelete).toEqual([])
  expect(body.refused).toHaveLength(1)
})

test("refuses to delete the signed-in admin", async ({ page }) => {
  await loginAsAdmin(page)
  const { body } = await attemptDelete(page, ["admin-audit@dev.invalid"])
  expect(body.wouldDelete).toEqual([])
  expect(body.refused[0].reason).toMatch(/signed-in admin/i)
})

test("allows a genuinely flagged row, and reports what would go", async ({ page }, testInfo) => {
  await loginAsAdmin(page)
  const target = `qr-basic-${testInfo.project.name}@dev.invalid`
  const { body } = await attemptDelete(page, [target])
  expect(body.wouldDelete).toContain(target)
  expect(body.details[0].keyCount).toBeGreaterThan(0)
  // Dry run must not have touched anything.
  const after = await attemptDelete(page, [target])
  expect(after.body.wouldDelete).toContain(target)
})

test("rejects a non-admin outright", async ({ request }) => {
  const res = await request.fetch(`${BASE}/api/admin/audit`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    data: { emails: ["anything@dev.invalid"], dryRun: true },
  })
  expect(res.status()).toBe(401)
})
