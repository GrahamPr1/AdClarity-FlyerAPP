import { test, expect } from "@playwright/test"
const BASE = "http://localhost:3000"

/**
 * The homepage demo takes free text from an anonymous visitor and renders it
 * into mock previews. It makes NO network call — it is pure client-side
 * substitution — so there is no loading or error state to test. What can
 * genuinely break is the layout, and the escaping.
 */
const HOSTILE = [
  { label: "very long business name", business: "Miller Heating Air Conditioning Refrigeration Ventilation and Ductwork Specialists of Greater Denver Colorado Incorporated", promo: "$500 off" },
  { label: "very long offer", business: "Miller HVAC", promo: "Save five hundred dollars on a complete furnace replacement this month only including removal installation and a full first year maintenance plan with financing available" },
  { label: "HTML/script chars", business: "<script>alert(1)</script>", promo: "<b>50% off</b> & \"quotes\" 'apostrophes'" },
  { label: "emoji + unicode", business: "Müller Heizung ❄️🔥 Ltd", promo: "€500 off — 50 % 〜 ñ" },
  { label: "no spaces", business: "A".repeat(60), promo: "B".repeat(80) },
]

test("homepage demo survives hostile input", async ({ page }) => {
  // Ten full page loads (five inputs across two viewports) with a re-render
  // between each. Legitimately long, and longer still with three engines
  // sharing one dev server — not a symptom of anything wrong.
  test.slow()
  for (const vp of [{ width: 390, height: 844 }, { width: 1440, height: 900 }]) {
    await page.setViewportSize(vp)
    await page.goto(BASE, { waitUntil: "networkidle" })
    for (const c of HOSTILE) {
      const biz = page.getByPlaceholder("Bluegrass Roofing")
      const promo = page.getByPlaceholder("$500 Off Your New Roof")
      await biz.scrollIntoViewIfNeeded()
      await biz.fill(c.business)
      await promo.fill(c.promo)
      await promo.press("Enter")
      await page.waitForTimeout(400)

      const o = await page.evaluate(() => ({
        scrollW: document.documentElement.scrollWidth,
        clientW: document.documentElement.clientWidth,
      }))
      const overflowed = o.scrollW > o.clientW + 1
      // Did raw HTML get injected rather than escaped?
      const injected = await page.evaluate(() => !!document.querySelector("body script[data-injected], body b"))
      const alerted = await page.evaluate(() => (window as unknown as { __alerted?: boolean }).__alerted === true)
      console.log(`  ${String(vp.width).padStart(4)}px  ${c.label.padEnd(24)} overflow=${overflowed ? `YES (${o.scrollW}>${o.clientW})` : "no"}  htmlInjected=${injected}  alert=${alerted}`)
      expect(overflowed, `${c.label} @${vp.width} caused horizontal overflow`).toBe(false)
      expect(alerted, "script must not execute").toBe(false)
    }
  }
})
