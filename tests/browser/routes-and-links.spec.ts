import { test, expect } from "@playwright/test"
/**
 * Vanity redirects, SEO files, and the cross-links between login and signup.
 * Checked by navigating as a real anonymous visitor rather than reading the
 * config, because a redirect that resolves in next.config can still land
 * somewhere useless once auth middleware has had its turn.
 */
const BASE = "http://localhost:3000"

test("redirects, as a fresh anonymous visitor", async ({ page }) => {
  for (const [from, expected] of [
    ["/signup", "/onboarding"],
    ["/register", "/onboarding"],
    ["/create", "/onboarding"],
    ["/demo", "/onboarding"],
    ["/faq", "/#faq"],
  ] as const) {
    const res = await page.goto(`${BASE}${from}`, { waitUntil: "domcontentloaded" })
    const landed = new URL(page.url())
    // /onboarding requires auth, so it bounces on to /login?next=/onboarding.
    const ok = landed.pathname + landed.hash === expected || landed.searchParams.get("next")?.startsWith(expected)
    console.log(`  ${from.padEnd(12)} -> ${landed.pathname}${landed.search}${landed.hash}  ${ok ? "OK" : "UNEXPECTED"}  (${res?.status()})`)
    expect(ok, `${from} should reach ${expected}`).toBeTruthy()
  }
})

test("/app anonymous goes to login pointed at the dashboard", async ({ page }) => {
  await page.goto(`${BASE}/app`, { waitUntil: "domcontentloaded" })
  const u = new URL(page.url())
  console.log(`  /app (anon) -> ${u.pathname}?next=${u.searchParams.get("next")}`)
  expect(u.pathname).toBe("/login")
  expect(u.searchParams.get("next")).toBe("/dashboard")
})

test("sitemap and robots", async ({ page }) => {
  const sm = await page.request.get(`${BASE}/sitemap.xml`)
  const rb = await page.request.get(`${BASE}/robots.txt`)
  const smBody = await sm.text()
  const rbBody = await rb.text()
  console.log(`  sitemap.xml ${sm.status()}  urls=${(smBody.match(/<url>/g) ?? []).length}`)
  console.log(`  robots.txt  ${rb.status()}  sitemap line: ${/Sitemap:/i.test(rbBody)}`)
  expect(sm.status()).toBe(200)
  expect(rb.status()).toBe(200)
  expect(rbBody).toMatch(/Sitemap:/i)
  expect(smBody).toContain("<urlset")
})

test("login page cross-link and password hints", async ({ page }) => {
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" })
  const signup = page.getByRole("link", { name: /Don't have an account\? Sign up/i })
  await expect(signup).toBeVisible()
  expect(await signup.getAttribute("href")).toBe("/onboarding")
  await expect(page.getByRole("button", { name: /forgot password/i })).toBeVisible()
  console.log("  login: signup link -> /onboarding, forgot-password present")

  await page.goto(`${BASE}/login?next=/onboarding`, { waitUntil: "networkidle" })
  await expect(page.getByText(/Must be at least 8 characters/i)).toBeVisible()
  await page.getByLabel("Password", { exact: true }).fill("abc")
  await expect(page.getByText(/5 more characters needed/i)).toBeVisible()
  await page.getByLabel("Password", { exact: true }).fill("abcdefgh")
  await expect(page.getByText(/Long enough/i)).toBeVisible()
  console.log("  signup: live password requirement feedback works")
})

test("contact page delivers a real form", async ({ page }) => {
  await page.goto(`${BASE}/contact`, { waitUntil: "networkidle" })
  await expect(page.getByRole("heading", { name: /Contact us/i })).toBeVisible()
  await expect(page.getByText(/within one business day/i)).toBeVisible()
  await expect(page.getByText(/support@oneflyer.org/i).first()).toBeVisible()
  for (const l of [/Your name/i, /Your email/i, /How can we help/i]) {
    await expect(page.getByLabel(l)).toBeVisible()
  }
  console.log("  contact: heading, response-time promise, address, all three fields present")
})

test("homepage header has a Log In link", async ({ page }) => {
  await page.goto(BASE, { waitUntil: "networkidle" })
  const header = page.locator("header, nav").first()
  const login = header.getByRole("link", { name: /log in/i }).first()
  await expect(login).toBeVisible()
  console.log("  header Log In ->", await login.getAttribute("href"))
})
