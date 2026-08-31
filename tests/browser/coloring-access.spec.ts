import { test, expect } from "@playwright/test"
import { stateFile } from "./auth-paths"

/**
 * Coloring pages are available on EVERY plan. They cost one campaign credit
 * from the same monthly allowance as a flyer — the allowance is the limit,
 * not the tier.
 *
 * This file previously asserted a Pro-only gate. That gate was never asked
 * for; it was an assumption, and these now pin the opposite so it can't creep
 * back in.
 */
const BASE = "http://localhost:3000"

test.describe("on the free trial", () => {
  test.use({ storageState: ({}, provide, testInfo) => provide(stateFile("trial", testInfo.project.name)) })

  test("can reach the real form — no upgrade wall", async ({ page }) => {
    await page.goto(`${BASE}/coloring-page`)
    await expect(page.getByLabel(/What should the coloring page show/i)).toBeVisible()
    await expect(page.getByText(/part of the Pro plan/i)).toHaveCount(0)
    await expect(page.getByRole("link", { name: /See the Pro plan/i })).toHaveCount(0)
  })

  test("the API does not refuse it on plan grounds", async ({ page }) => {
    const res = await page.request.fetch(`${BASE}/api/coloring-page`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // Deliberately invalid so this never starts a real generation: what's
      // under test is WHICH rejection comes back, not the drawing.
      data: { subject: "", audience: "young-child", theme: null, caption: null },
    })
    const body = await res.json()
    expect(body.error, "must fail validation, never on plan").not.toBe("pro_plan_required")
    expect(res.status(), "422 = it got past the plan check to validation").toBe(422)
  })
})

test.describe("on Basic", () => {
  test.use({ storageState: ({}, provide, testInfo) => provide(stateFile("basic", testInfo.project.name)) })

  test("sees it in the format picker, positioned after Proposal, unbadged", async ({ page }) => {
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

    // Ordering: it must follow Proposal, and no "Pro" badge anywhere on it.
    const labels = await page.locator('button[aria-pressed], a[href="/coloring-page"]').allInnerTexts()
    const order = labels.map((t) => t.split("\n")[0].trim())
    console.log("  picker order:", JSON.stringify(order))
    expect(order.indexOf("Coloring page")).toBe(order.indexOf("Proposal") + 1)
    expect((await entry.innerText()).toLowerCase()).not.toContain("pro")
  })
})
