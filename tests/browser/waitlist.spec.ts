import { test, expect } from "@playwright/test"
import { stateFile } from "./auth-paths"

/**
 * Early Access replaces checkout while Stripe isn't connected.
 *
 * The properties worth pinning: joining never changes a plan, a non-admin
 * client cannot read the list (the UI hiding a link is not access control),
 * and the success copy only claims "we've started you on the free tier" to
 * someone who actually has an account.
 */
const BASE = "http://localhost:3000"

test("paid tiers offer Early Access, not a fake checkout", async ({ page }) => {
  await page.goto(`${BASE}/#pricing`, { waitUntil: "networkidle" })
  await expect(page.getByRole("button", { name: /Join Basic Early Access/i })).toBeVisible()
  await expect(page.getByRole("button", { name: /Join Pro Early Access/i })).toBeVisible()
  // Free tier untouched — it works today, so it still just goes.
  await expect(page.getByRole("link", { name: /Start Free|Create My First Campaign/i }).first()).toBeVisible()
  expect(await page.getByText(/Billing coming soon/i).count()).toBe(2)
})

test("anonymous join gets honest copy — no claim of an account", async ({ page }, testInfo) => {
  await page.goto(`${BASE}/#pricing`, { waitUntil: "networkidle" })
  await page.getByRole("button", { name: /Join Pro Early Access/i }).click()
  await expect(page.getByRole("dialog")).toBeVisible()
  // Unique per run and per engine: a fixed address makes the SECOND run hit
  // the duplicate path, where the heading reads "already on the list" and this
  // assertion misses. Test isolation, not a product issue.
  await page.getByLabel("Email").fill(`browser.anon.${testInfo.project.name}.${Date.now()}@example.com`)
  await page.getByRole("button", { name: /^Join Early Access$/i }).click()
  await expect(page.getByText(/You're on the list/i)).toBeVisible({ timeout: 20000 })
  // Must NOT tell an anonymous visitor we started them on anything.
  await expect(page.getByText(/We've started you on the free tier/i)).toHaveCount(0)
  await expect(page.getByRole("link", { name: /Start free now/i })).toBeVisible()
})

test("modal fits a phone without overflowing", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  const page = await ctx.newPage()
  await page.goto(`${BASE}/#pricing`, { waitUntil: "networkidle" })
  await page.getByRole("button", { name: /Join Pro Early Access/i }).click()
  await expect(page.getByRole("dialog")).toBeVisible()
  const o = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }))
  expect(o.sw, "modal must not cause horizontal overflow").toBeLessThanOrEqual(o.cw + 1)
  const box = await page.getByRole("dialog").boundingBox()
  expect(box!.height, "dialog must fit the viewport").toBeLessThanOrEqual(844)
  await ctx.close()
})

test.describe("a signed-in NON-admin client", () => {
  test.use({ storageState: ({}, provide, testInfo) => provide(stateFile("basic", testInfo.project.name)) })

  test("is refused the admin waitlist API", async ({ page }) => {
    const res = await page.request.get(`${BASE}/api/admin/waitlist`)
    expect(res.status(), "a logged-in client is not an admin").toBe(401)
    const csv = await page.request.get(`${BASE}/api/admin/waitlist?format=csv`)
    expect(csv.status()).toBe(401)
  })

  test("joining does not change their plan", async ({ page }) => {
    const before = await (await page.request.get(`${BASE}/api/deliverables`)).json()
    const res = await page.request.fetch(`${BASE}/api/waitlist`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      data: { email: before.email, desiredPlan: "pro", billingInterval: "monthly" },
    })
    expect(res.status()).toBe(200)
    const after = await (await page.request.get(`${BASE}/api/deliverables`)).json()
    expect(after.planId, "plan must be untouched").toBe(before.planId)
    expect(after.waitlist.length, "their entry should surface on the dashboard payload").toBeGreaterThan(0)
  })
})

test.describe("as admin", () => {
  test.use({ storageState: ({}, provide, testInfo) => provide(stateFile("admin", testInfo.project.name)) })

  test("can read the list, and CSV downloads with real rows", async ({ page }) => {
    const res = await page.request.get(`${BASE}/api/admin/waitlist`)
    expect(res.status()).toBe(200)
    const json = await res.json()
    console.log(`  waitlist count: ${json.summary.total} (basic ${json.summary.basic} / pro ${json.summary.pro}, monthly ${json.summary.monthly} / annual ${json.summary.annual}, not notified ${json.summary.notNotified})`)
    expect(json.summary.total).toBeGreaterThan(0)

    const csv = await page.request.get(`${BASE}/api/admin/waitlist?format=csv`)
    expect(csv.status()).toBe(200)
    expect(csv.headers()["content-type"]).toContain("text/csv")
    expect(csv.headers()["content-disposition"]).toContain("oneflyer-waitlist.csv")
    const body = await csv.text()
    const lines = body.trim().split("\n")
    console.log(`  CSV: ${lines.length - 1} data rows, header = ${lines[0]}`)
    expect(lines.length - 1).toBe(json.summary.total)
  })

  test("the admin page renders the table", async ({ page }) => {
    await page.goto(`${BASE}/admin/waitlist`)
    await expect(page.getByRole("heading", { name: /Early Access waitlist/i })).toBeVisible({ timeout: 20000 })
    await expect(page.getByRole("link", { name: /Export CSV/i })).toBeVisible()
    await expect(page.getByRole("table")).toBeVisible()
  })

  test("notify stamps notifiedAt once and is idempotent", async ({ page }) => {
    const list = await (await page.request.get(`${BASE}/api/admin/waitlist`)).json()
    const target = list.entries.find((e: { notifiedAt: string | null }) => !e.notifiedAt)
    test.skip(!target, "everyone already notified")
    const first = await page.request.fetch(`${BASE}/api/admin/waitlist/notify`, {
      method: "POST", headers: { "Content-Type": "application/json" }, data: { ids: [target.id] },
    })
    expect((await first.json()).updated).toBe(1)
    const second = await page.request.fetch(`${BASE}/api/admin/waitlist/notify`, {
      method: "POST", headers: { "Content-Type": "application/json" }, data: { ids: [target.id] },
    })
    expect((await second.json()).updated, "re-notifying must not rewrite history").toBe(0)
  })
})
