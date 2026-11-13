import { afterAll, describe, expect, it } from "vitest"
import { NOP_V2_TEMPLATES } from "@/lib/enterprise/nop-render/kit-v2"
import { MIN_FOOTER_MARGIN_PX, MIN_GAP_PX, V2_SIZES, checkV2Release } from "@/lib/enterprise/nop-render/kit-v2-release"
import { acquireBrowser } from "@/lib/pdf/flyer-pdf"

/**
 * Every kit-v2 template, Letter and bleed, laid out in Chromium through the
 * agent pipeline with the release checks (the same checks every agent
 * download and the Spanish switch run), including at least 0.05in to spare
 * above the footer and 0.08in between blocks. The markup tests in
 * nop-agent-footer.test.ts pass on pages that fail here: the agent area makes
 * the footer 27.4px taller, and whether the page has room for it only shows
 * once laid out.
 *
 * Slower than the rest of the suite (a real browser, 24 renders), and needs
 * Playwright's Chromium installed locally (`npx playwright install chromium`).
 * Prints each page's footer margin.
 */

// The setting as it will be saved: the full forward URL printed on two lines.
const DOMAIN = { forwardTemplate: "https://neighbor.basicbenefits.com/member-enrollment?agent_code={id}", printed: "full" as const, printedTemplate: null, programUrl: "https://neighbor.basicbenefits.com/" }
const CASES = NOP_V2_TEMPLATES.flatMap((id) => V2_SIZES.map((size) => [id, size] as const))
const margins: string[] = []

afterAll(async () => {
  console.log(`kit-v2 footer margins (spare above the footer; smallest space between blocks):\n${margins.join("\n")}`)
  const { browser, release } = await acquireBrowser()
  await release()
  await browser.close().catch(() => undefined)
})

describe("kit-v2 release checks on the laid-out page", () => {
  for (const [id, size] of CASES) {
    it(`${id} ${size}`, async () => {
      const fit = await checkV2Release(id, size, DOMAIN)
      margins.push(`${id.padEnd(20)} ${size.padEnd(6)} ${(fit.footerMargin / 96).toFixed(3)}in  ${(fit.minGap / 96).toFixed(3)}in`)
      expect(fit.footerMargin).toBeGreaterThanOrEqual(MIN_FOOTER_MARGIN_PX)
      expect(fit.minGap).toBeGreaterThanOrEqual(MIN_GAP_PX)
    }, 60_000)
  }
})
