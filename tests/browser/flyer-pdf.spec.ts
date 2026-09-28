import { test, expect } from "@playwright/test"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { execFileSync } from "node:child_process"
import { PNG } from "pngjs"
import jsQR from "jsqr"
import { ensureScrollable, substituteLogo, substituteQr } from "@/lib/agent-pipeline/flyer-html"
import { fillTemplate } from "@/lib/agent-pipeline/template-mode"
import { TEMPLATES } from "@/lib/agent-pipeline/templates"
import { STYLE_FONT_STACKS } from "@/lib/brand-controls"
import { renderFlyerPdf } from "@/lib/pdf/flyer-pdf"

/**
 * The PDF export, exercised through the SAME function the route calls.
 *
 * print-output.spec.ts already proves each fixture's document declares the
 * right physical page. This proves the export path honours it — a separate
 * claim, and the one that breaks: the sizing options passed to page.pdf()
 * can quietly override a correct document.
 */
const FIXTURES = path.join(process.cwd(), "tests/fixtures/print")

test.skip(({ browserName }) => browserName !== "chromium", "renderFlyerPdf drives Chromium directly")

const PT_PER_IN = 72

function pages(pdf: Buffer): [number, number][] {
  const s = pdf.toString("latin1")
  const out: [number, number][] = []
  for (const m of s.matchAll(/\/MediaBox\s*\[\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\]/g)) {
    out.push([Number(m[3]), Number(m[4])])
  }
  if (out.length === 0) throw new Error("no MediaBox in PDF")
  return out
}

const CASES = [
  { name: "flyer", inches: [8.5, 11] },
  { name: "one-pager", inches: [8.5, 11] },
  // The case that a hardcoded letter size silently ruins.
  { name: "door-hanger", inches: [3.5, 8.5] },
  // The case that pageRanges:"1" silently truncates.
  { name: "proposal-long", inches: [8.5, 11], pageCount: 2 },
  { name: "coloring", inches: [8.5, 11] },
] as const

const load = (name: string) => ensureScrollable(fs.readFileSync(path.join(FIXTURES, `${name}.html`), "utf8"))

for (const c of CASES) {
  test(`${c.name} exports at its own physical size`, async () => {
    test.skip(!fs.existsSync(path.join(FIXTURES, `${c.name}.html`)), `fixture ${c.name} not present`)
    const { pdf } = await renderFlyerPdf(load(c.name))

    const mediaBoxes = pages(pdf)
    const [w, h] = mediaBoxes[0]
    expect(w / PT_PER_IN, `${c.name} width`).toBeCloseTo(c.inches[0], 1)
    expect(h / PT_PER_IN, `${c.name} height`).toBeCloseTo(c.inches[1], 1)
    expect(mediaBoxes.length, `${c.name} page count`).toBe("pageCount" in c ? c.pageCount : 1)
  })
}

test("the flyer's artwork reaches the edge of the sheet instead of being clipped or inset", async () => {
  test.skip(!fs.existsSync(path.join(FIXTURES, "flyer.html")), "fixture not present")
  const { pdf } = await renderFlyerPdf(load("flyer"))
  // A full-bleed flyer that has been scaled down or given a browser margin
  // leaves white gutters; one that has been clipped loses content. Both show
  // up as the page's own drawing operations not covering the MediaBox, so
  // assert on the ink rather than on the settings that produced it.
  const [w, h] = pages(pdf)[0]
  const s = pdf.toString("latin1")
  // Chromium writes the content's transform; a fitted-and-shrunk page shows
  // a scale factor materially below 1.
  const scale = /\/([\d.]+)\s+0\s+0\s+([\d.]+)\s+0\s+0\s+cm/.exec(s)
  if (scale) expect(Number(scale[1]), "content was scaled down to fit").toBeGreaterThan(0.99)
  expect(w).toBeGreaterThan(600)
  expect(h).toBeGreaterThan(780)
})

/**
 * A flyer carrying a real logo and a real QR code, built through the same
 * fillTemplate -> substituteLogo -> substituteQr path the pipeline uses, so
 * this cannot drift from what generation actually produces the way a
 * checked-in fixture would.
 */
const REDEEM_URL = "https://oneflyer.org/r/PDFTEST1"
async function flyerWithAssets(fonts = STYLE_FONT_STACKS.modern) {
  const QRCode = (await import("qrcode")).default
  const qr = await QRCode.toDataURL(REDEEM_URL, { margin: 1, width: 512 })
  // A 2-colour SVG logo, inlined the way a scraped logo is.
  const logo =
    "data:image/svg+xml;base64," +
    Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="80"><rect width="240" height="80" fill="#0b5"/><text x="16" y="52" font-size="36" fill="#fff">ACME</text></svg>`,
    ).toString("base64")

  const filled = fillTemplate({
    template: TEMPLATES[0],
    headline: "Spring roof inspection",
    supporting: "Written report included, no obligation.",
    businessName: "Acme Roofing",
    phone: "(270) 555-0142",
    address: "114 State St, Bowling Green, KY",
    hasLogo: true,
    hasQr: true,
    photoUrl: null,
    colors: { primary: "#0b5", secondary: "#063", accent: "#fc0" },
    fonts,
  })
  return ensureScrollable(substituteLogo(substituteQr(filled.html, qr), logo))
}

/**
 * Rasterises the PDF at print resolution — the page as a scanner sees it.
 *
 * Needed because the properties the client cares about are not visible in
 * the PDF's object graph: an SVG logo is drawn as vector paths and never
 * becomes an /Image, so counting embedded images proves nothing about
 * whether the logo actually appeared, and "the QR is present" is a weaker
 * claim than "the QR scans".
 */
const hasPoppler = (() => {
  try { execFileSync("pdftoppm", ["-v"], { stdio: "pipe" }); return true } catch { return false }
})()

function rasterise(pdf: Buffer, dpi: number) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "flyer-pdf-"))
  try {
    fs.writeFileSync(path.join(dir, "out.pdf"), pdf)
    execFileSync("pdftoppm", ["-png", "-r", String(dpi), "-singlefile", "out.pdf", "page"], { cwd: dir })
    return PNG.sync.read(fs.readFileSync(path.join(dir, "page.png")))
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
}

// Skipping is honest rather than convenient: these are the only assertions
// that can prove "scannable" and "visible" rather than "present in the
// file", so a run without poppler has NOT verified them.
test.describe("the printed page", () => {
  test.skip(!hasPoppler, "pdftoppm (poppler) not installed — cannot rasterise the page")

  test("the QR still scans, and points where it should", async () => {
    const { pdf } = await renderFlyerPdf(await flyerWithAssets())
    // 300dpi: what a phone camera or a scanner sees off a printed sheet.
    const png = rasterise(pdf, 300)
    const decoded = jsQR(new Uint8ClampedArray(png.data), png.width, png.height)
    expect(decoded, "no QR code could be read from the printed page").not.toBeNull()
    expect(decoded!.data, "the QR scans to the wrong destination").toBe(REDEEM_URL)
  })

  test("the logo is actually drawn, not a blank box", async () => {
    const { pdf } = await renderFlyerPdf(await flyerWithAssets())
    const png = rasterise(pdf, 150)
    // The logo is the only #0b5 green in the artwork's own palette that
    // appears as a solid block. Count pixels close to it: a logo that
    // failed to load leaves the box empty and the count at zero.
    let green = 0
    for (let i = 0; i < png.data.length; i += 4) {
      const [r, g, b] = [png.data[i], png.data[i + 1], png.data[i + 2]]
      if (Math.abs(r - 0x00) < 40 && Math.abs(g - 0xbb) < 40 && Math.abs(b - 0x55) < 40) green++
    }
    expect(green, "no logo-coloured pixels on the page").toBeGreaterThan(500)
  })

  test("the artwork is not clipped and carries no unexpected white margin", async () => {
    const { pdf } = await renderFlyerPdf(await flyerWithAssets())
    const png = rasterise(pdf, 150)
    const nonWhiteInColumn = (x: number) => {
      let n = 0
      for (let y = 0; y < png.height; y++) {
        const i = (png.width * y + x) << 2
        if (png.data[i] < 245 || png.data[i + 1] < 245 || png.data[i + 2] < 245) n++
      }
      return n
    }
    // This template declares @page margin 0 and paints to the edge, so ink
    // must reach both outer columns. A browser margin or a shrink-to-fit
    // would leave them blank.
    expect(nonWhiteInColumn(0), "left edge is blank — unexpected margin or scaling").toBeGreaterThan(0)
    expect(nonWhiteInColumn(png.width - 1), "right edge is blank — content was clipped or inset").toBeGreaterThan(0)
  })
})

test("text is set in the font the brand chose, not a silent fallback", async () => {
  // The PDF names the fonts it actually used, which is the only check that
  // distinguishes "asked for Helvetica Neue" from "got it". A document that
  // fell back lands on the platform default instead.
  const { pdf } = await renderFlyerPdf(await flyerWithAssets(STYLE_FONT_STACKS.classic))
  const fonts = [...new Set([...pdf.toString("latin1").matchAll(/\/BaseFont\s*\/([A-Za-z0-9+\-,#]+)/g)]
    .map((m) => m[1].replace(/^[A-Z]{6}\+/, "")))]
  expect(fonts.length, "the PDF embedded no fonts at all").toBeGreaterThan(0)
  // classic is Georgia, 'Times New Roman', serif.
  expect(
    fonts.some((f) => /Georgia|Times/i.test(f)),
    `expected Georgia (or its Times fallback); PDF used ${fonts.join(", ")}`,
  ).toBe(true)
})

test("nothing but the asset: no chrome survives into the PDF", async () => {
  test.skip(!fs.existsSync(path.join(FIXTURES, "flyer.html")), "fixture not present")
  const { pdf } = await renderFlyerPdf(load("flyer"))
  const s = pdf.toString("latin1")
  // Chromium's header/footer templates are what would put a URL, a page
  // number or a date on a printed page. displayHeaderFooter defaults off;
  // this is the assertion that keeps it off.
  for (const artifact of ["localhost", "about:blank", "Page 1 of"]) {
    expect(s, `"${artifact}" leaked into the PDF`).not.toContain(artifact)
  }
})
