import { test as setup, expect, type Browser } from "@playwright/test"
import { ROLES, accountFor, stateFile, type Role } from "./auth-paths"

/**
 * Signs in once per (role, engine) and saves each session for the specs to
 * reuse.
 *
 * Sign-in is rate-limited per account, deliberately, and it works. Specs that
 * authenticated inside every test burned that budget several times per run and
 * then failed on login timeouts — failures that pointed at nothing real.
 * Authenticating once here is both the standard Playwright pattern and a
 * closer match to how a real session behaves.
 *
 * The four logins run CONCURRENTLY: they're independent accounts, and doing
 * them in sequence took long enough in WebKit (the slowest engine) to exceed
 * the test timeout on its own. The rate limiter keys on IP+email, so parallel
 * logins to different accounts don't contend.
 */
async function saveSession(browser: Browser, role: Role, project: string) {
  const context = await browser.newContext()
  try {
    const page = await context.newPage()
    await page.goto("http://localhost:3000/login")
    await page.getByLabel(/email/i).first().fill(accountFor(role, project))
    await page.getByLabel(/password/i).first().fill("DevTest!2345")
    await page.getByRole("button", { name: /log in|sign in/i }).first().click()
    await page.waitForURL(/\/(dashboard|admin)/, { timeout: 45000 })
    await expect(page).toHaveURL(/\/(dashboard|admin)/)
    await context.storageState({ path: stateFile(role, project) })
  } finally {
    await context.close()
  }
}

setup("authenticate every role", async ({ browser }, testInfo) => {
  setup.setTimeout(120_000)
  const project = testInfo.project.name.replace(/^setup-/, "")
  await Promise.all(ROLES.map((role) => saveSession(browser, role, project)))
})
