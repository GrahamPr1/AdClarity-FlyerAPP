import { test, expect } from "@playwright/test"
import fs from "node:fs"
import path from "node:path"
import { ensureScrollable } from "@/lib/agent-pipeline/flyer-html"

/**
 * Printing goes through Chromium's PDF path, which is the SAME rendering
 * pipeline as the browser's print dialog — so a PDF produced here is what a
 * client's printer receives.
 *
 * Fixtures are checked-in samples of real generated output, one per format.
 * They exist because the properties that break printing are silent on screen:
 * backgrounds vanish, a door hanger quietly scales onto a letter sheet, a
 * paginated proposal loses its second page.
 */
const FIXTURES = path.join(process.cwd(), "tests/fixtures/print")

// page.pdf() is Chromium-only in Playwright. That is a tooling limit, not a
// product one — the assertions here are about the DOCUMENT (its @page size,
// its pagination, its colour-adjust rule), which is engine-independent. What
// cannot be checked cross-engine is only whether each browser's own PDF
// writer honours it, and Chromium's is the same pipeline its print dialog
// uses. Firefox and WebKit still cover this document through the
// open-in-new-tab spec.
test.skip(({ browserName }) => browserName !== "chromium", "page.pdf() is Chromium-only")

const CASES = [
  { name: "flyer", expectPt: [612, 792] },
  { name: "one-pager", expectPt: [612, 792] },
  { name: "door-hanger", expectPt: [252, 612] }, // 3.5in x 8.5in — must NOT become a letter sheet
  { name: "proposal-long", expectPt: [612, 792], expectPages: 2 },
  { name: "coloring", expectPt: [612, 792] },
] as const

function pageSize(pdf: Buffer): [number, number] {
  const m = /\/MediaBox\s*\[\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\]/.exec(pdf.toString("latin1"))
  if (!m) throw new Error("no MediaBox in PDF")
  return [Math.round(Number(m[3])), Math.round(Number(m[4]))]
}

function pageCount(pdf: Buffer): number {
  return (pdf.toString("latin1").match(/\/Type\s*\/Page[^s]/g) ?? []).length
}

for (const c of CASES) {
  test(`${c.name} prints at the right physical size`, async ({ page }) => {
    const file = path.join(FIXTURES, `${c.name}.html`)
    test.skip(!fs.existsSync(file), `fixture ${c.name}.html not present`)

    // Exactly what /api/flyers/[id]/view serves, injection included.
    const html = ensureScrollable(fs.readFileSync(file, "utf8"))

    // The injected rules are what make print work at all.
    expect(html, "backgrounds are stripped when printing without this").toContain("print-color-adjust:exact")
    expect(html, "the scroll override must not fight the page size in print").toContain("@media screen{html,body{height:auto")

    await page.setContent(html, { waitUntil: "load" })
    const pdf = await page.pdf({ printBackground: true, preferCSSPageSize: true })

    const [w, h] = pageSize(pdf)
    expect(Math.abs(w - c.expectPt[0]), `${c.name} width ${w}pt, expected ${c.expectPt[0]}pt`).toBeLessThanOrEqual(2)
    expect(Math.abs(h - c.expectPt[1]), `${c.name} height ${h}pt, expected ${c.expectPt[1]}pt`).toBeLessThanOrEqual(2)

    if ("expectPages" in c && c.expectPages) {
      expect(pageCount(pdf), `${c.name} should paginate to ${c.expectPages} pages`).toBe(c.expectPages)
    }
  })
}

test("the served document carries no site chrome to hide", async ({ page }) => {
  const file = path.join(FIXTURES, "flyer.html")
  test.skip(!fs.existsSync(file), "fixture not present")
  await page.setContent(ensureScrollable(fs.readFileSync(file, "utf8")), { waitUntil: "load" })
  // Printing the flyer's OWN document rather than the dashboard is what makes
  // @media print rules to hide nav/buttons unnecessary — there is nothing to
  // hide, so nothing can be forgotten.
  expect(await page.locator("nav").count()).toBe(0)
  expect(await page.getByRole("button").count()).toBe(0)
  expect(await page.locator('a[href^="/dashboard"]').count()).toBe(0)
})
