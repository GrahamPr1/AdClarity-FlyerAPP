import { test, expect } from "@playwright/test"
import { stateFile } from "./auth-paths"

/**
 * Early Access USED to replace checkout while Stripe wasn't connected. It has
 * been reverted (REVERT_TO_STRIPE.md): the paid CTAs now go to /checkout, and
 * the modal is gone. The waitlist DATA is deliberately kept — POST
 * /api/waitlist, /admin/waitlist and the CSV export all stay live — so the
 * properties still worth pinning are the data ones below: joining never
 * changes a plan, and a non-admin client cannot read the list.
 */
const BASE = "http://localhost:3000"

test("paid tiers go to checkout (via sign-up), not an Early Access modal", async ({ page }) => {
  await page.goto(`${BASE}/#pricing`, { waitUntil: "networkidle" })
  await expect(page.getByRole("button", { name: /Early Access/i })).toHaveCount(0)
  expect(await page.getByText(/Billing coming soon/i).count()).toBe(0)
  await page.getByRole("button", { name: "Get the Pro Plan" }).click()
  // Signed out: /checkout bounces to sign-up with the plan carried in ?next=.
  await page.waitForURL(/\/login\?next=%2Fcheckout%3Fplan%3Dpro%26interval%3Dmonthly/)
  await expect(page.getByRole("heading", { name: /Create your account/i })).toBeVisible()
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
