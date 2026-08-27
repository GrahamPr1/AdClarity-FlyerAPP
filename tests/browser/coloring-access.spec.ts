import { test, expect } from "@playwright/test"
import { stateFile } from "./auth-paths"

/**
 * Coloring pages are Pro-only, and they are LISTED to everyone rather than
 * hidden — someone on Basic should be able to see what upgrading buys. That
 * makes the server the only thing actually enforcing it, so these check the
 * API refuses a non-Pro account directly, not just that a button is missing.
 */
const BASE = "http://localhost:3000"

const REQUEST = { subject: "A friendly dragon reading a book", audience: "young-child", theme: null, caption: null }

test.describe("on Basic", () => {
  test.use({ storageState: ({}, provide, testInfo) => provide(stateFile("basic", testInfo.project.name)) })

  test("the API refuses a hand-crafted request", async ({ page }) => {
    const res = await page.request.fetch(`${BASE}/api/coloring-page`, {
      method: "POST", headers: { "Content-Type": "application/json" }, data: REQUEST,
    })
    expect(res.status(), "the UI is not what enforces this").toBe(403)
    expect((await res.json()).error).toBe("pro_plan_required")
  })

  test("the page explains the gate rather than bouncing them", async ({ page }) => {
    await page.goto(`${BASE}/coloring-page`)
    await expect(page.getByText(/Coloring pages are part of the Pro plan/i)).toBeVisible()
    await expect(page.getByRole("link", { name: /See the Pro plan/i })).toBeVisible()
    // The form must not be reachable.
    await expect(page.getByLabel(/What should the coloring page show/i)).toHaveCount(0)
  })

  test("it is still LISTED in guided setup, marked Pro", async ({ page }) => {
    await page.goto(`${BASE}/onboarding`)
    await page.getByRole("button", { name: /Guided Setup/i }).click()
    await page.getByRole("button", { name: /No, I'll answer a few questions/i }).click()
    await page.getByRole("button", { name: /^Contractor$/ }).click()
    await page.getByLabel(/business name/i).fill("Miller Heating")
    await page.getByLabel(/what do you do/i).fill("HVAC")
    await page.getByLabel(/^Service 1$/).fill("Furnace repair")
    await page.getByRole("button", { name: /^Continue$/ }).click()
    await expect(page.getByText(/STEP 2 OF 3/i)).toBeVisible({ timeout: 20000 })

    const entry = page.getByRole("link", { name: /Coloring page/i })
    await expect(entry).toBeVisible()
    expect(await entry.getAttribute("href")).toBe("/coloring-page")
    console.log("  guided setup lists it, linking to its own intake")
  })
})

test.describe("on Pro", () => {
  test.use({ storageState: ({}, provide, testInfo) => provide(stateFile("intake", testInfo.project.name)) })

  test("the form is available", async ({ page }) => {
    await page.goto(`${BASE}/coloring-page`)
    await expect(page.getByLabel(/What should the coloring page show/i)).toBeVisible()
    await expect(page.getByText(/Coloring pages are part of the Pro plan/i)).toHaveCount(0)
    console.log("  Pro sees the real form")
  })
})
