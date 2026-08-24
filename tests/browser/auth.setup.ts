import { test as setup, expect } from "@playwright/test"
import { adminStateFile } from "./auth-paths"

/**
 * Signs in as the admin once per engine and saves the session for reuse.
 *
 * Sign-in is rate-limited per account (lib/rate-limit.ts) — deliberately, and
 * it works. Logging in inside every test meant four sign-ins per engine per
 * run, which tripped the limiter on back-to-back runs and failed tests for a
 * reason that had nothing to do with what they assert. Authenticating once
 * and reusing the cookie is both the standard Playwright pattern and a
 * better simulation of a real session.
 */
setup("authenticate as admin", async ({ page }, testInfo) => {
  const project = testInfo.project.name.replace(/^setup-/, "")
  await page.goto("http://localhost:3000/login")
  await page.getByLabel(/email/i).first().fill(`admin-audit-${project}@dev.invalid`)
  await page.getByLabel(/password/i).first().fill("DevTest!2345")
  await page.getByRole("button", { name: /log in|sign in/i }).first().click()
  await page.waitForURL(/\/(dashboard|admin)/, { timeout: 30000 })
  await expect(page).toHaveURL(/\/(dashboard|admin)/)
  await page.context().storageState({ path: adminStateFile(project) })
})
