import { test, expect } from "@playwright/test"
import { stateFile } from "./auth-paths"

/**
 * Pause has to be a real server-side gate, not a hidden button.
 *
 * The point of pausing is that it stops spending WITHOUT destroying anything,
 * so these check both halves: campaigns are refused while paused, and the
 * account's data is still there afterwards.
 */
const BASE = "http://localhost:3000"

test.describe("signed in as a client", () => {
  // Serial, not parallel: both tests act on the SAME seeded account, so one
  // pausing while the other is asserting on the profile UI flips the button
  // it's looking for. Shared mutable fixture — the tests have to take turns.
  test.describe.configure({ mode: "serial" })
  test.use({ storageState: ({}, provide, testInfo) => provide(stateFile("basic", testInfo.project.name)) })

  test.afterEach(async ({ page }) => {
    // Never leave a seeded account paused for the other specs.
    await page.request.fetch(`${BASE}/api/account/pause`, {
      method: "POST", headers: { "Content-Type": "application/json" }, data: { paused: false },
    })
  })

  test("pausing blocks new campaigns server-side and preserves everything", async ({ page }) => {
    const before = await (await page.request.get(`${BASE}/api/deliverables`)).json()
    expect(before.pausedAt).toBeNull()

    const paused = await page.request.fetch(`${BASE}/api/account/pause`, {
      method: "POST", headers: { "Content-Type": "application/json" }, data: { paused: true },
    })
    expect(paused.status()).toBe(200)

    // The gate is the API, not the UI.
    const blocked = await page.request.fetch(`${BASE}/api/quick-prompt`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      data: { prompt: "$500 off a new furnace", format: "Flyer", phone: "(555) 123-4567" },
    })
    expect(blocked.status(), "a paused account must not be able to spend").toBe(403)
    expect((await blocked.json()).error).toBe("account_paused")

    // Nothing destroyed: the account still reports its plan, limit and flyers.
    const during = await (await page.request.get(`${BASE}/api/deliverables`)).json()
    expect(during.pausedAt).not.toBeNull()
    expect(during.planId).toBe(before.planId)
    expect(during.flyersLimit).toBe(before.flyersLimit)
    expect(during.flyers.length).toBe(before.flyers.length)

    const resumed = await page.request.fetch(`${BASE}/api/account/pause`, {
      method: "POST", headers: { "Content-Type": "application/json" }, data: { paused: false },
    })
    expect(resumed.status()).toBe(200)
    expect((await (await page.request.get(`${BASE}/api/deliverables`)).json()).pausedAt).toBeNull()
  })

  test("the profile page offers pause before any cancellation path", async ({ page }) => {
    await page.goto(`${BASE}/profile`)
    await expect(page.getByRole("heading", { name: /Your account/i })).toBeVisible({ timeout: 20000 })
    await page.getByRole("button", { name: /Pause my account/i }).click()
    // The reassurance must be visible at the moment of decision, not after.
    await expect(page.getByText(/Pause, rather than cancel\?/i)).toBeVisible()
    await expect(page.getByText(/keep working, and keep counting scans/i)).toBeVisible()
    await expect(page.getByRole("link", { name: /cancellation policy/i })).toBeVisible()
    await page.getByRole("button", { name: /Never mind/i }).click()
  })
})

test("legal pages are reachable and have real content", async ({ page }) => {
  // Three full page navigations in one test.
  test.slow()
  for (const [path, heading] of [
    ["/privacy", /Privacy Policy/i],
    ["/terms", /Terms of Service/i],
    ["/refund-policy", /Cancellation & Refund Policy/i],
  ] as const) {
    const res = await page.goto(`${BASE}${path}`)
    expect(res?.status(), path).toBe(200)
    await expect(page.getByRole("heading", { name: heading, level: 1 })).toBeVisible()
    const text = await page.locator("main").innerText()
    expect(text.length, `${path} should have substantive content`).toBeGreaterThan(1200)
  }
})

test("the homepage footer links to all three policies", async ({ page }) => {
  await page.goto(BASE)
  for (const name of [/Privacy Policy/i, /Terms of Service/i, /Cancellation & Refunds/i]) {
    await expect(page.getByRole("link", { name }).first()).toBeVisible()
  }
})
