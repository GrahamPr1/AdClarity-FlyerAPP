/**
 * WCAG contrast audit of FLYER documents, measured from rendered pixels.
 *
 *   npm run test:contrast [-- extra.html ... [--finish-ai]]
 *   npx tsx scripts/flyer-contrast-audit.ts <out-dir> [extra.html ...] [--finish-ai]
 *
 * Run it after every template or colour change.
 *
 * Same method and the same honesty rules as audit.mjs (the app-page audit):
 * the page is rendered twice, the second time with every glyph transparent,
 * so the backdrop behind each line is the real composited pixel — photo,
 * scrim, gradient and all. Every text element found is either scored or
 * listed as not scorable WITH ITS REASON; nothing silently leaves the
 * denominator.
 *
 * One deliberate difference from audit.mjs: it scores the 10th-percentile
 * contrast over every sampled pixel under each LINE, not the mean of eight
 * points. Over a photograph a mean hides the bright patch behind one word,
 * which is precisely where white text fails.
 *
 * Matrix: every template x {dark-primary, light-primary} palette x
 * {no photo, real photo, bright photo, busy photo}, at maximal content in the
 * production fonts — plus any AI-path flyer HTML passed as extra arguments.
 *
 * "Light and dark": a flyer document has no theme of its own — it renders in
 * a sandboxed iframe with fixed colours, so the app's dark mode never reaches
 * it. What changes a flyer's contrast is the brand palette (a pale client
 * colour as --brand-primary under white header text) and the photo. Those are
 * the two axes audited.
 */
import fs from "node:fs"
import path from "node:path"
import { chromium, type Page } from "playwright-core"
import sharp from "sharp"
import { TEMPLATES } from "../lib/agent-pipeline/templates"
import { CURATED_FONTS } from "../lib/brand-controls"
import { CONTENT, STRESS_PHOTO, assets, buildStoredHtml, productionFontCss } from "./lib/flyer-fixtures"
import { canvasOfHtml, measureContrastOnPage, repairContrast } from "../lib/agent-pipeline/contrast-repair"
import { repairRedundancy } from "../lib/agent-pipeline/redundancy"

const OUT = process.argv[2]
const EXTRA = process.argv.slice(3).filter((a) => !a.startsWith("--"))
/**
 * --finish-ai: run each extra (AI-path) document through the finishing step a
 * PUBLIC account's flyer now gets in the pipeline (finishAiFlyer in
 * pipeline.ts: redundancy repair, then contrast repair) before auditing it.
 */
const FINISH_AI = process.argv.includes("--finish-ai")
if (!OUT) {
  console.error("usage: flyer-contrast-audit.ts <out-dir> [extra.html ...]")
  process.exit(2)
}

export const PALETTES = {
  // The default mass-appeal palette: dark primary, light secondary.
  "dark-primary": { primary: "#12314f", secondary: "#e8edf2", accent: "#e39a2b" },
  // A pale client brand colour, as a website scan or the colour picker can
  // hand over today — nothing in resolveBrandColors stops it becoming primary.
  "light-primary": { primary: "#f5c518", secondary: "#fff7d6", accent: "#2b2b2b" },
} as const

/** Synthetic extremes: what a real photo can be at its worst behind text. */
async function photos(): Promise<Record<string, string | null>> {
  const png = async (svg: string) => `data:image/png;base64,${(await sharp(Buffer.from(svg)).png().toBuffer()).toString("base64")}`
  const bright = await png(`<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="720"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#e9eef2"/></linearGradient></defs><rect width="1080" height="720" fill="url(#g)"/></svg>`)
  const stripes = Array.from({ length: 27 }, (_, i) => `<rect x="${i * 40}" width="20" height="720" fill="#000"/>`).join("")
  const busy = await png(`<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="720"><rect width="1080" height="720" fill="#fff"/>${stripes}</svg>`)
  return { "no-photo": null, "real-photo": STRESS_PHOTO, "bright-photo": bright, "busy-photo": busy }
}

export interface AuditResult {
  name: string
  found: number
  scored: number
  failing: { text: string; ratio: number; need: number; color: string }[]
  notScorable: { text: string; why: string }[]
}

async function audit(page: Page, name: string, html: string): Promise<AuditResult> {
  const canvas = canvasOfHtml(html)
  const withFonts = html.replace("</head>", `<style>${productionFontCss()}</style></head>`)
  // The screenshot first, for the grid; then the shared measurement the
  // pipeline itself enforces (lib/agent-pipeline/contrast-repair.ts).
  await page.setViewportSize({ width: canvas.w, height: canvas.h })
  // AI flyers load Google Fonts; one slow request shouldn't abort the whole
  // audit, but a page measured without its fonts would mismeasure — so retry
  // once with a longer wait rather than fall back to a partial load.
  await page.setContent(withFonts, { waitUntil: "load", timeout: 45_000 }).catch(() => page.setContent(withFonts, { waitUntil: "load", timeout: 90_000 }))
  await page.evaluate(async () => {
    await document.fonts.ready
    await Promise.all([...document.images].map((i) => i.decode().catch(() => undefined)))
  })
  await page.screenshot({ path: path.join(OUT, `${name}.png`), clip: { x: 0, y: 0, width: canvas.w, height: canvas.h } })
  const r = await measureContrastOnPage(page, withFonts, canvas)
  return { name, found: r.found, scored: r.scored, failing: r.failing, notScorable: r.notScorable }
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true })
  const a = await assets()
  const ph = await photos()
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()
  const results: AuditResult[] = []
  const font = CURATED_FONTS[0]

  for (const template of TEMPLATES) {
    const formatId = template.formatIds[0]
    for (const [pal, colors] of Object.entries(PALETTES)) {
      for (const [photoName, photo] of Object.entries(ph)) {
        const html = buildStoredHtml(template, formatId, CONTENT.max, photo, { heading: font.heading, body: font.body }, a, colors)
        results.push(await audit(page, `${template.id}__${pal}__${photoName}`, html))
      }
    }
  }
  for (const f of EXTRA) {
    let html = fs.readFileSync(f, "utf8")
    // As finishAiFlyer: template flyers (data-field markers) are not touched.
    if (FINISH_AI && !/data-field="/.test(html)) {
      const red = repairRedundancy(html)
      const cr = await repairContrast(red.html)
      for (const r of red.removed) console.log(`  [redundancy] ${path.basename(f)}: removed "${r}"`)
      for (const r of cr.repaired) console.log(`  [contrast] ${path.basename(f)}: "${r.text}" ${r.from}:1 -> ${r.to}`)
      html = cr.html
      fs.writeFileSync(path.join(OUT, `ai__${path.basename(f)}`), html)
    }
    results.push(await audit(page, `ai__${path.basename(f, ".html")}`, html))
  }
  await browser.close()

  fs.writeFileSync(path.join(OUT, "contrast.json"), JSON.stringify(results, null, 2))
  const t = { found: 0, scored: 0, failing: 0, notScorable: 0 }
  console.log("  render".padEnd(48) + "found  scored  failing  not-scorable")
  for (const r of results) {
    t.found += r.found; t.scored += r.scored; t.failing += r.failing.length; t.notScorable += r.notScorable.length
    console.log(`  ${r.name.padEnd(46)}${String(r.found).padStart(5)}${String(r.scored).padStart(8)}${String(r.failing.length).padStart(9)}${String(r.notScorable.length).padStart(14)}`)
    const seen = new Set<string>()
    for (const f of r.failing) {
      if (seen.has(f.text)) continue
      seen.add(f.text)
      console.log(`        ${f.ratio}:1 (needs ${f.need}) ${f.color}  "${f.text}"`)
    }
    const why = new Map<string, number>()
    for (const n of r.notScorable) why.set(n.why, (why.get(n.why) ?? 0) + 1)
    for (const [w, n] of why) console.log(`        not scorable: ${n} x ${w}`)
  }
  console.log(`\n  TOTAL found ${t.found}   scored ${t.scored}   failing ${t.failing}   not-scorable ${t.notScorable}`)
  process.exit(t.failing ? 1 : 0)
}

main().catch((err) => {
  console.error(err)
  process.exit(2)
})
