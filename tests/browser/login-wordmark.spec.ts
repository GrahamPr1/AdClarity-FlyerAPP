import { test, expect } from "@playwright/test"

const BASE = "http://localhost:3000"

test("login page wordmark navigates back to the homepage", async ({ page }) => {
  await page.goto(`${BASE}/login`)
  const mark = page.getByRole("link", { name: /OneFlyer — back to homepage/i })
  await expect(mark).toBeVisible()
  await mark.click()
  await page.waitForURL(`${BASE}/`)
  expect(new URL(page.url()).pathname).toBe("/")
})

test("account-creation page wordmark navigates back too", async ({ page }) => {
  // signup mode — the ?next=/onboarding variant the CTAs actually link to
  await page.goto(`${BASE}/login?next=/onboarding`)
  await expect(page.getByRole("heading").first()).toBeVisible()
  await page.getByRole("link", { name: /OneFlyer — back to homepage/i }).click()
  await page.waitForURL(`${BASE}/`)
  expect(new URL(page.url()).pathname).toBe("/")
})

test("wordmark is reachable and activatable by keyboard", async ({ page }) => {
  await page.goto(`${BASE}/login`)
  const mark = page.getByRole("link", { name: /OneFlyer — back to homepage/i })
  await mark.focus()
  await expect(mark).toBeFocused()
  await page.keyboard.press("Enter")
  await page.waitForURL(`${BASE}/`)
  expect(new URL(page.url()).pathname).toBe("/")
})
