import { test, expect } from "@playwright/test"
import { stateFile } from "./auth-paths"

/**
 * The header's "Log In" points straight at /login. Two things have to hold,
 * and the second one is what makes the first safe:
 *
 *  - an anonymous visitor must actually SEE the login form. /login is in the
 *    middleware matcher now, and without an explicit early return it falls
 *    through to the "no session -> redirect to /login" branch, producing
 *    /login?next=/login forever. That would take down the one page an
 *    unauthenticated visitor needs.
 *  - a signed-in visitor should not be shown a form they don't need, since
 *    the old /dashboard link doubled as "take me to my dashboard".
 */
const BASE = "http://localhost:3000"

test("anonymous reaches the login form — no redirect loop", async ({ page }) => {
  const res = await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" })
  expect(res?.status(), "a loop surfaces as an error status").toBe(200)
  expect(new URL(page.url()).pathname).toBe("/login")
  expect(new URL(page.url()).searchParams.get("next"), "next=/login is the loop signature").not.toBe("/login")
  await expect(page.getByLabel(/email/i).first()).toBeVisible()
  console.log("  anonymous /login ->", page.url())
})

test("the header link goes straight to /login", async ({ page }) => {
  await page.goto(BASE, { waitUntil: "networkidle" })
  const link = page.locator("header, nav").first().getByRole("link", { name: /log in/i }).first()
  expect(await link.getAttribute("href")).toBe("/login")
  await link.click()
  await page.waitForURL(/\/login/)
  await expect(page.getByLabel(/email/i).first()).toBeVisible()
  console.log("  header click landed on", page.url())
})

test.describe("already signed in", () => {
  test.use({ storageState: ({}, provide, testInfo) => provide(stateFile("basic", testInfo.project.name)) })

  test("is sent onward instead of shown a login form", async ({ page }) => {
    await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" })
    expect(new URL(page.url()).pathname).toBe("/dashboard")
    console.log("  signed-in /login ->", page.url())
  })

  test("honours ?next= rather than always dumping on the dashboard", async ({ page }) => {
    await page.goto(`${BASE}/login?next=/profile`, { waitUntil: "domcontentloaded" })
    expect(new URL(page.url()).pathname).toBe("/profile")
    console.log("  signed-in /login?next=/profile ->", page.url())
  })

  test("cannot be turned into an open redirect", async ({ page }) => {
    await page.goto(`${BASE}/login?next=https://example.com/evil`, { waitUntil: "domcontentloaded" })
    const u = new URL(page.url())
    expect(u.origin, "must never leave our own origin").toBe(BASE)
    expect(u.pathname).toBe("/dashboard")
    console.log("  signed-in /login?next=<external> ->", page.url())
  })
})
