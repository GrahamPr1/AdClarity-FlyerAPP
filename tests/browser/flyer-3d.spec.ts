import { test, expect, type Page } from "@playwright/test"
import { stateFile } from "./auth-paths"

// This suite has no Playwright baseURL — every spec names the dev server
// explicitly. Same convention here.
const BASE = "http://localhost:3000"

/**
 * The interactive 3D flyer — the homepage hero showpiece, and the same shell
 * wrapped around every flyer on a client's dashboard.
 *
 * IMPORTANT for anyone adding tests here: the hero card runs an infinite
 * `flyer3d-idle` transform, so its bounding box never settles and Playwright's
 * actionability checks (click, hover, scrollIntoViewIfNeeded) time out on it
 * and on anything inside it — "element is not stable", 30s, every time. Drive
 * it with page.evaluate + mouse.move at explicit coordinates, as below. The
 * dashboard cards do NOT idle, so they behave normally.
 */

/** Reads the tilt the component wrote, without touching the element. */
function tilt(page: Page, selector = ".flyer3d-card") {
  return page.evaluate((sel) => {
    const c = document.querySelector<HTMLElement>(sel)
    if (!c) return null
    return {
      rx: c.style.getPropertyValue("--rx"),
      ry: c.style.getPropertyValue("--ry"),
      glare: c.style.getPropertyValue("--glare-angle"),
      tracking: c.classList.contains("is-tracking"),
      idle: c.classList.contains("flyer3d-idle"),
    }
  }, selector)
}

/**
 * Moves the pointer to a FRACTION of the scene box and waits for the component
 * to react.
 *
 * Takes fractions rather than pixels, and re-measures immediately before
 * moving, because a box captured once goes stale: three engines share one dev
 * server, fonts and the reveal observers land late, and the resulting shift
 * moved the target outside the element — the pointer then left the scene and
 * the tilt reset, which reads as "tracking never turned on".
 *
 * Polls rather than sleeping: the pointer event and the rAF that services it
 * are not synchronous with mouse.move resolving.
 */
async function tiltAfterPointer(
  page: Page,
  fx: number,
  fy: number,
  sceneSel = ".flyer3d-scene",
  cardSel = ".flyer3d-card",
) {
  // Re-send the pointer on every poll iteration rather than moving once and
  // waiting. A single move that lands before React attaches its handler is
  // simply lost — the mouse never moves again, so no further pointermove is
  // ever produced and polling a missed event waits forever. Re-measuring each
  // time also absorbs any late layout shift.
  await expect
    .poll(
      async () => {
        const b = await boxOf(page, sceneSel)
        const x = b.x + b.w * fx
        const y = b.y + b.h * fy
        await page.mouse.move(x, y)
        // A second, 1px-offset move guarantees a delta even if the pointer was
        // already parked on this exact pixel. 1px of ~336 shifts the tilt by
        // <0.1deg, far below anything asserted here.
        await page.mouse.move(x + 1, y)
        return (await tilt(page, cardSel))?.tracking
      },
      { timeout: 20_000, intervals: [100, 200, 400, 800] },
    )
    .toBe(true)
  return (await tilt(page, cardSel))!
}

function boxOf(page: Page, selector: string) {
  return page.evaluate((sel) => {
    const r = document.querySelector(sel)!.getBoundingClientRect()
    return { x: r.x, y: r.y, w: r.width, h: r.height }
  }, selector)
}

test.describe("homepage hero flyer", () => {
  test("tilts toward the pointer, in both axes, and returns to idle", async ({ page }) => {
    await page.goto(BASE)
    await page.waitForSelector(".flyer3d-card")
    // Fonts change metrics; letting them settle stops the scene from moving
    // under the pointer mid-test.
    await page.evaluate(() => document.fonts.ready)
    // behavior:"instant" is load-bearing: globals.css sets
    // `html { scroll-behavior: smooth }`, so a default scrollIntoView animates
    // and every coordinate measured before it settles points somewhere else by
    // the time the pointer gets there.
    await page.evaluate(() =>
      document
        .querySelector(".flyer3d-scene")!
        .scrollIntoView({ block: "center", behavior: "instant" as ScrollBehavior }),
    )

    // Untouched: drifting, not tracking. Polled because the idle class is
    // applied by the client component, so it only lands after hydration.
    await expect.poll(async () => (await tilt(page))?.idle, { timeout: 10_000 }).toBe(true)

    const topRight = await tiltAfterPointer(page, 0.9, 0.15)
    expect(topRight.idle).toBe(false)
    const ryRight = parseFloat(topRight.ry)
    const rxTop = parseFloat(topRight.rx)

    const bottomLeft = await tiltAfterPointer(page, 0.1, 0.85)
    const ryLeft = parseFloat(bottomLeft.ry)
    const rxBottom = parseFloat(bottomLeft.rx)

    // Opposite corners must tilt opposite ways on BOTH axes — a component that
    // only wired up one axis, or inverted one, still "moves" and would pass a
    // weaker assertion.
    expect(ryRight).toBeGreaterThan(0)
    expect(ryLeft).toBeLessThan(0)
    expect(rxTop).toBeGreaterThan(0)
    expect(rxBottom).toBeLessThan(0)

    // Within the configured maxTilt (12deg -> +/-24 at the extremes).
    expect(Math.abs(ryRight)).toBeLessThanOrEqual(24)
    expect(Math.abs(rxBottom)).toBeLessThanOrEqual(24)

    // The specular sweep tracks the pointer too, rather than sitting fixed.
    expect(topRight.glare).not.toBe("")
    expect(bottomLeft.glare).not.toBe(topRight.glare)

    // Leaving clears the inline tilt and hands back to the idle drift.
    await page.mouse.move(2, 2)
    await expect
      .poll(async () => (await tilt(page))?.tracking, { timeout: 10_000 })
      .toBe(false)
    const left = (await tilt(page))!
    expect(left.rx).toBe("")
    expect(left.idle).toBe(true)
  })

  test("honours prefers-reduced-motion: no drift, no tracking", async ({ browser }) => {
    const page = await (await browser.newContext({ reducedMotion: "reduce" })).newPage()
    await page.goto(BASE)
    await page.waitForSelector(".flyer3d-card")
    // Fonts change metrics; letting them settle stops the scene from moving
    // under the pointer mid-test.
    await page.evaluate(() => document.fonts.ready)
    // behavior:"instant" is load-bearing: globals.css sets
    // `html { scroll-behavior: smooth }`, so a default scrollIntoView animates
    // and every coordinate measured before it settles points somewhere else by
    // the time the pointer gets there.
    await page.evaluate(() =>
      document
        .querySelector(".flyer3d-scene")!
        .scrollIntoView({ block: "center", behavior: "instant" as ScrollBehavior }),
    )
    // Give hydration the same chance the positive test gets — if the class
    // were going to appear, it would have by the time tracking could work.
    await page.waitForFunction(() => !!document.querySelector(".flyer3d-card"))
    await page.waitForTimeout(700)
    expect((await tilt(page))!.idle).toBe(false)

    const b = await boxOf(page, ".flyer3d-scene")
    await page.mouse.move(b.x + b.w * 0.9, b.y + b.h * 0.2)
    await page.waitForTimeout(700)
    const t = (await tilt(page))!
    expect(t.tracking).toBe(false)
    expect(t.rx).toBe("")
    expect(t.ry).toBe("")

    await page.close()
  })

  test("the flyer still renders with JavaScript disabled", async ({ browser }) => {
    // The hero is the LCP element. If it depended on hydration to exist, a
    // slow phone would show an empty stage where the product should be.
    const page = await (await browser.newContext({ javaScriptEnabled: false })).newPage()
    await page.goto(BASE)
    await expect(page.locator(".flyer3d-card")).toHaveCount(1)
    await expect(page.getByText("Bluegrass Roofing").first()).toBeVisible()
    await page.close()
  })
})

test.describe("dashboard flyers", () => {
  test.use({
    storageState: ({}, provide, testInfo) => provide(stateFile("basic", testInfo.project.name)),
  })

  test("every ready flyer gets the same 3D shell, and it does not idle", async ({ page }) => {
    await page.goto(`${BASE}/dashboard`)
    // Wait for the page itself, NOT for the flyer grid: the seeded per-engine
    // accounts have no campaigns, so the dashboard legitimately renders its
    // empty state and "Flyers & Pages" never appears.
    await expect(page.getByRole("heading", { name: "Your campaigns" })).toBeVisible({
      timeout: 30_000,
    })

    // The flyer list arrives via SWR, so counting straight after the heading
    // renders counts an empty grid. seed:dev gives every `basic` account two
    // ready flyers (see scripts/seed-dev-accounts.ts) — wait for them.
    await expect
      .poll(async () => await page.locator(".flyer3d-card").count(), { timeout: 30_000 })
      .toBeGreaterThan(0)

    // One 3D shell per rendered flyer thumbnail — that is the whole claim:
    // the treatment is applied to every flyer, not just the first.
    const shells = await page.locator(".flyer3d-card").count()
    const thumbs = await page.getByRole("link", { name: /Open .* in a new tab/ }).count()
    console.log(`  dashboard: ${shells} 3D shells / ${thumbs} flyer thumbnails`)
    expect(shells).toBe(thumbs)

    // Scroll the first card into view before aiming at it — boxOf returns
    // viewport coordinates, and the grid sits well below the fold.
    await page.evaluate(() =>
      document
        .querySelector(".flyer3d-scene")!
        .scrollIntoView({ block: "center", behavior: "instant" as ScrollBehavior }),
    )

    // A grid of independently drifting cards would be noise and constant
    // battery; the interactive tilt is opt-in per pointer.
    expect(await tilt(page)).toMatchObject({ idle: false, tracking: false })

    const t = await tiltAfterPointer(page, 0.85, 0.2)
    expect(parseFloat(t.ry)).toBeGreaterThan(0)

    // The 3D wrapper must not have swallowed the one interactive control on
    // the thumbnail — the open-in-new-tab link still has to be reachable.
    await expect(page.getByRole("link", { name: /Open .* in a new tab/ }).first()).toHaveAttribute(
      "target",
      "_blank",
    )
  })
})
