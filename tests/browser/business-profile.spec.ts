import { test, expect } from "@playwright/test"
import { stateFile } from "./auth-paths"

// This suite has no Playwright baseURL — every spec names the dev server
// explicitly. Same convention here.
const BASE = "http://localhost:3000"

/**
 * The Business Profile fields added for the "business brain" groundwork:
 * targetAudience, serviceArea and pastOffers on the EXISTING CampaignDefaults
 * record (client:{email}:campaignDefaults). Deliberately not a new record —
 * see the note on CampaignDefaults in lib/types.ts for why this app already
 * has three things called some variant of "profile".
 *
 * The point of most of these assertions is that the guards live on the
 * SERVER. The add/remove UI enforces the same rules, but a client can post
 * whatever it likes straight to the route, and pastOffers ends up inside an
 * AI prompt.
 */

test.describe("business profile", () => {
  // Serial, not parallel. playwright.config.ts sets fullyParallel, and every
  // test here mutates ONE server-side record for ONE seeded account — run
  // concurrently, each test's afterEach clears the record another is mid-way
  // through asserting on. This is shared mutable state, not slow tests.
  test.describe.configure({ mode: "serial" })

  test.use({
    storageState: ({}, provide, testInfo) => provide(stateFile("basic", testInfo.project.name)),
  })

  // Leave the account as we found it: these seeded accounts have no
  // campaignDefaults record, and a leftover targetAudience would silently
  // pre-fill the onboarding form for every other spec that walks it.
  test.afterEach(async ({ page }) => {
    await page.request.post(`${BASE}/api/campaign-defaults`, { data: {} }).catch(() => {})
  })

  test("new fields round-trip through Redis and survive a reload", async ({ page }) => {
    await page.goto(`${BASE}/profile`)
    await expect(page.getByRole("heading", { name: "Your brand details" })).toBeVisible()

    // Tone of voice was ALREADY here before this change — asserted so a
    // future edit can't quietly drop the field the Brand Agent reads.
    await expect(page.locator("#voice")).toBeVisible()

    await page.locator("#audience").fill("homeowners 35-65 with aging roofs")
    await page.locator("#serviceArea").fill("Louisville + 30 miles")

    for (const offer of ["$500 off a new roof", "Free inspection"]) {
      await page.locator("#pastOffer").fill(offer)
      await page.getByRole("button", { name: "Add", exact: true }).click()
    }
    await expect(page.locator('button[aria-label^="Remove"]')).toHaveCount(2)

    await page.getByRole("button", { name: /Save details/ }).click()
    await expect(page.getByText(/Saved\. Your next campaign/)).toBeVisible()

    await page.reload()
    await expect(page.locator("#audience")).toHaveValue("homeowners 35-65 with aging roofs")
    await expect(page.locator("#serviceArea")).toHaveValue("Louisville + 30 miles")
    await expect(page.locator('button[aria-label^="Remove"]')).toHaveCount(2)
  })

  test("the offer list rejects blanks and case-insensitive duplicates", async ({ page }) => {
    await page.goto(`${BASE}/profile`)
    await expect(page.getByRole("heading", { name: "Your brand details" })).toBeVisible()

    const add = page.getByRole("button", { name: "Add", exact: true })
    await expect(add).toBeDisabled() // nothing typed yet

    await page.locator("#pastOffer").fill("   ")
    await expect(add).toBeDisabled() // whitespace is not an offer

    await page.locator("#pastOffer").fill("$500 off a new roof")
    await add.click()
    await page.locator("#pastOffer").fill("$500 OFF A NEW ROOF")
    await add.click()
    await expect(page.locator('button[aria-label^="Remove"]')).toHaveCount(1)

    // Enter adds the offer without submitting anything or navigating away.
    await page.locator("#pastOffer").fill("Fall tune-up special")
    await page.locator("#pastOffer").press("Enter")
    await expect(page.locator('button[aria-label^="Remove"]')).toHaveCount(2)
    expect(new URL(page.url()).pathname).toBe("/profile")

    await page.locator('button[aria-label^="Remove"]').first().click()
    await expect(page.locator('button[aria-label^="Remove"]')).toHaveCount(1)
  })

  test("the API enforces its own limits — the UI is not the guard", async ({ page }) => {
    const post = async (data: Record<string, unknown>) => {
      const res = await page.request.post(`${BASE}/api/campaign-defaults`, { data })
      expect(res.ok()).toBe(true)
      return (await res.json()).defaults as {
        pastOffers: string[]
        targetAudience: string
        serviceArea: string
      }
    }

    // Unbounded input here would be an unbounded token bill and a lever for
    // pushing arbitrary text into an AI prompt.
    expect((await post({ pastOffers: Array.from({ length: 50 }, (_, i) => `offer ${i}`) })).pastOffers).toHaveLength(20)
    expect((await post({ pastOffers: ["x".repeat(500)] })).pastOffers[0]).toHaveLength(120)
    expect((await post({ pastOffers: "not-an-array" })).pastOffers).toEqual([])
    expect((await post({ pastOffers: [1, null, { a: 1 }, "  ", "Real offer"] })).pastOffers).toEqual(["Real offer"])

    const capped = await post({ targetAudience: "y".repeat(400), serviceArea: "z".repeat(400) })
    expect(capped.targetAudience).toHaveLength(200)
    expect(capped.serviceArea).toHaveLength(200)

    // Every field stays optional — an empty save is valid and clears them,
    // which is what the afterEach hook relies on.
    const cleared = await post({})
    expect(cleared.targetAudience).toBe("")
    expect(cleared.pastOffers).toEqual([])
  })

  test("a record saved before these fields existed still loads", async ({ page }) => {
    // Exactly the shape the route wrote before this change. The form spreads
    // over EMPTY, so the absent keys must come back as blanks rather than
    // rendering `undefined` into the inputs or throwing.
    const res = await page.request.post(`${BASE}/api/campaign-defaults`, {
      data: {
        yearsInBusiness: "7",
        brandColors: "navy, gold",
        preferredStyle: "modern",
        voiceTone: "friendly, no-nonsense",
        contactName: "Sarah Miller",
        website: "millerheatingandair.com",
        address: "12 Oak St, Louisville",
        socialHandles: "@millerhvac",
      },
    })
    expect(res.ok()).toBe(true)

    await page.goto(`${BASE}/profile`)
    await expect(page.getByRole("heading", { name: "Your brand details" })).toBeVisible()
    await expect(page.locator("#voice")).toHaveValue("friendly, no-nonsense")
    await expect(page.locator("#audience")).toHaveValue("")
    await expect(page.locator("#serviceArea")).toHaveValue("")
    await expect(page.locator('button[aria-label^="Remove"]')).toHaveCount(0)
  })

  test("a saved audience pre-fills onboarding, and typing over it still wins", async ({ page }) => {
    await page.request.post(`${BASE}/api/campaign-defaults`, {
      data: { targetAudience: "homeowners 35-65 with aging HVAC systems" },
    })

    await page.goto(`${BASE}/onboarding`)
    await page.getByText("Guided Setup").click()
    await page.getByRole("button", { name: /No, I'll answer/i }).click()

    // Step 0 gates Continue until the genuinely required fields are set.
    await page.getByRole("button", { name: "Contractor", exact: true }).click()
    await page.locator("#businessName").fill("Miller Heating & Air")
    await page.locator("#industry").fill("HVAC")
    await page.locator("#service-0").fill("Furnace repair")
    await page.getByRole("button", { name: /^Continue$/ }).first().click()

    await expect(page.locator("#audience")).toHaveValue("homeowners 35-65 with aging HVAC systems")

    // Pre-filling must not become a restriction: this is about saving typing,
    // not pinning a business to one audience forever.
    await page.locator("#audience").fill("commercial property managers only")
    await expect(page.locator("#audience")).toHaveValue("commercial property managers only")
  })
})
