import { test, expect, type Page } from "@playwright/test"

/**
 * "Add a QR code to your flyer?" must be a visible question while filling in
 * flyer details — not buried in the collapsed optional section — and it must
 * reflect the plan honestly rather than promising Trial users a QR code the
 * server will not produce for them (see qrEnabled in plan-features.ts).
 */

const BASE = "http://localhost:3000"

/**
 * Each engine gets its own seeded account. Sharing one across the three
 * projects tripped the per-account sign-in rate limiter (a real protection
 * working correctly) and failed the tests for reasons unrelated to the QR
 * question. Seeded by the dev-data script, see docs/local-development.md.
 */
function accountFor(role: "basic" | "trial" | "intake", project: string) {
  return `qr-${role}-${project}@dev.invalid`
}

async function reachPromotionStep(page: Page, email: string) {
  await page.goto(`${BASE}/login`)
  await page.getByLabel(/email/i).first().fill(email)
  await page.getByLabel(/password/i).first().fill("DevTest!2345")
  await page.getByRole("button", { name: /log in|sign in/i }).first().click()
  await page.waitForURL(/\/dashboard/, { timeout: 20000 })

  await page.goto(`${BASE}/onboarding`)
  await page.getByRole("button", { name: /Guided Setup/i }).click()
  await page.getByRole("button", { name: /No, I'll answer a few questions/i }).click()

  await expect(page.getByText(/STEP 1 OF 3/i)).toBeVisible({ timeout: 15000 })
  await page.getByRole("button", { name: /^Contractor$/ }).click()
  await page.getByLabel(/business name/i).fill("Miller Heating & Air")
  await page.getByLabel(/what do you do/i).fill("HVAC repair and installation")
  // The service inputs carry their own aria-label ("Service 1"), which wins
  // over the visible "Main services" label.
  await page.getByLabel(/^Service 1$/).fill("Furnace repair")

  const cont = page.getByRole("button", { name: /^Continue$/ })
  await expect(cont).toBeEnabled({ timeout: 10000 })
  await cont.click()
  await expect(page.getByText(/STEP 2 OF 3/i)).toBeVisible({ timeout: 15000 })
}

test("Basic plan: QR question is visible, defaults on, and can be declined", async ({ page }, testInfo) => {
  await reachPromotionStep(page, accountFor("basic", testInfo.project.name))

  await expect(page.getByText(/Add a QR code to your flyer\?/i)).toBeVisible()

  const box = page.getByRole("checkbox", { name: /scannable QR code/i })
  await expect(box).toBeVisible()
  await expect(box).toBeEnabled()
  await expect(box, "QR should default to on").toBeChecked()

  await box.uncheck()
  await expect(box).not.toBeChecked()
  await box.check()
  await expect(box).toBeChecked()
})

test("Trial plan: question is shown but disabled, with an upgrade path", async ({ page }, testInfo) => {
  await reachPromotionStep(page, accountFor("trial", testInfo.project.name))

  await expect(page.getByText(/Add a QR code to your flyer\?/i)).toBeVisible()
  const box = page.getByRole("checkbox", { name: /scannable QR code/i })
  await expect(box).toBeDisabled()
  await expect(box, "must not promise a QR the plan won't produce").not.toBeChecked()
  await expect(page.getByRole("link", { name: /Upgrade to Basic/i })).toBeVisible()
})

test("the client's QR answer actually reaches /api/intake", async ({ page }, testInfo) => {
  await reachPromotionStep(page, accountFor("intake", testInfo.project.name))

  // Intercept rather than let it through: the real route starts a paid
  // generation run. What's under test is the payload, not the pipeline.
  let body: Record<string, unknown> | null = null
  await page.route("**/api/intake", async (route) => {
    body = route.request().postDataJSON()
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, flyerIds: [] }) })
  })

  await page.getByLabel(/what are you promoting/i).fill("$500 off a new furnace this month")
  await page.getByLabel(/who are you trying to reach/i).fill("Homeowners with aging furnaces")

  // Decline the QR code, then walk to the end and submit.
  await page.getByRole("checkbox", { name: /scannable QR code/i }).uncheck()
  await page.getByRole("button", { name: /^Continue$/ }).click()
  await expect(page.getByText(/STEP 3 OF 3/i)).toBeVisible({ timeout: 15000 })
  await page.getByLabel(/phone/i).first().fill("(555) 123-4567")

  await page.getByRole("button", { name: /generate|create|finish|submit/i }).first().click()
  await expect.poll(() => body, { timeout: 20000 }).not.toBeNull()

  expect(body!.wantsQrCode, "the declined answer must survive to the API").toBe(false)
})
