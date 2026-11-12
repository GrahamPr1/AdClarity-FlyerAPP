import { afterAll, describe, expect, it } from "vitest"
import { NOP_V2_TEMPLATES, type NopV2Id } from "@/lib/enterprise/nop-render/kit-v2"
import { V2_SIZES, checkV2Release } from "@/lib/enterprise/nop-render/kit-v2-release"
import { acquireBrowser } from "@/lib/pdf/flyer-pdf"

/**
 * Every kit-v2 template, Letter and bleed, laid out in Chromium through the
 * agent pipeline with the release checks (the same checks every agent
 * download and the Spanish switch run). The markup tests in
 * nop-agent-footer.test.ts pass on pages that fail here: the agent area makes
 * the footer 27.4px taller, and whether <main> can give that up only shows on
 * the laid-out page.
 *
 * Slower than the rest of the suite (a real browser, 24 renders), and needs
 * Playwright's Chromium installed locally (`npx playwright install chromium`).
 */

// Known to fail, not yet fixed (12 Nov 2026): the Spanish text is taller, so
// <main> can't shrink enough for the agent area and the footer is pushed below
// the page bottom: P1 ES by 21.8px, P3 ES by 1.5px. Fix options are with Basic
// Benefits for sign-off (docs/nop-kit-v2-spanish-footer-options.md). Spanish
// kit v2 can't be switched on meanwhile (flyer-settings route). These are
// expected to fail, and only with that error: a different failure, or a pass
// once fixed, turns the test red (then remove it from this list).
const KNOWN_FAILING = new Set<NopV2Id>(["NOP2_P1_ES_PRICE", "NOP2_P1_ES_NOPRICE", "NOP2_P3_ES_PRICE", "NOP2_P3_ES_NOPRICE"])

const DOMAIN = "join.basicbenefits.com"
const CASES = NOP_V2_TEMPLATES.flatMap((id) => V2_SIZES.map((size) => [id, size] as const))

afterAll(async () => {
  const { browser, release } = await acquireBrowser()
  await release()
  await browser.close().catch(() => undefined)
})

describe("kit-v2 release checks on the laid-out page", () => {
  for (const [id, size] of CASES) {
    if (KNOWN_FAILING.has(id)) {
      it(`${id} ${size}: expected to fail (footer pushed below the page)`, async () => {
        await expect(checkV2Release(id, size, DOMAIN)).rejects.toThrow(/^footer ends [\d.]+px below the page bottom$/)
      }, 60_000)
    } else {
      it(`${id} ${size}`, () => checkV2Release(id, size, DOMAIN), 60_000)
    }
  }
})
