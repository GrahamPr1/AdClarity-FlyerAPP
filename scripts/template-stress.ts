/**
 * Template stress test: renders every code-built template on every format it
 * serves, at minimal and maximal content, with and without a photo, in every
 * font pairing — and inspects the REAL render for collisions, clipping,
 * off-canvas content and empty regions.
 *
 *   npm run test:templates [-- --fonts=production|local|both] [--extra=<dir of .html>]
 *   npx tsx scripts/template-stress.ts <out-dir> [--fonts=…] [--extra=<dir>] [--rescore=<earlier-out-dir>]
 *
 * Run it after every template change.
 *
 * Writes <out-dir>/<cell>.png for each render, <out-dir>/findings.json, and
 * <out-dir>/grid-<fonts>.png (template x format rows, content-case columns).
 * Exits 1 if any render has a finding.
 *
 * Why not getBoundingClientRect: an element's box says nothing about glyphs a
 * parent with overflow:hidden is cutting off, and these templates set
 * overflow:hidden on every growable region. So clipping is measured per LINE
 * (Range.getClientRects on every text node) against every clipping ancestor,
 * plus scrollHeight/scrollWidth on every clipping box; empty regions are found
 * in the screenshot's pixels as well as the DOM; and anything under a 3D
 * transform, where boxes don't describe paint, is counted as not measurable
 * rather than passed.
 *
 * Fonts: "production" forces the open faces the Vercel PDF renderer
 * substitutes (lib/pdf/fonts.ts — Archivo Black has no metric clone, so it is
 * where production can overflow when a Mac doesn't); "local" uses this
 * machine's own fonts, i.e. what a client's browser preview shows.
 */
import fs from "node:fs"
import path from "node:path"
import { chromium, type Page } from "playwright-core"
import { PNG } from "pngjs"
import sharp, { type OverlayOptions } from "sharp"
import { TEMPLATES } from "../lib/agent-pipeline/templates"
import { CURATED_FONTS } from "../lib/brand-controls"
import { CONTENT, STRESS_PHOTO, assets, buildStoredHtml, canvasOf, productionFontCss } from "./lib/flyer-fixtures"

const OUT = process.argv[2]
const FONT_MODE = (process.argv.find((a) => a.startsWith("--fonts="))?.split("=")[1] ?? "both") as "production" | "local" | "both"
if (!OUT) {
  console.error("usage: template-stress.ts <out-dir> [--fonts=production|local|both]")
  process.exit(2)
}

/* ------------------------------ Inspection -------------------------------- */

export interface Finding {
  kind: "clipped" | "overflowing_box" | "off_canvas" | "collision" | "word_break" | "empty_region" | "flat_region" | "not_measurable"
  detail: string
}

/** Runs in the page. Line-level geometry, clipping ancestors, collisions, DOM empty regions. */
const INSPECT = (canvas: { w: number; h: number }) => {
  const out: { kind: string; detail: string }[] = []
  const label = (el: Element) => {
    const f = el.closest("[data-field]")?.getAttribute("data-field")
    if (f) return f
    const t = (el.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 32)
    return `${el.tagName.toLowerCase()}${el.className && typeof el.className === "string" ? "." + el.className.split(" ")[0] : ""}${t ? ` "${t}"` : ""}`
  }
  const clips = (el: Element) => {
    const list: Element[] = []
    for (let a = el.parentElement; a && a !== document.documentElement; a = a.parentElement) {
      const cs = getComputedStyle(a)
      if (cs.overflowX !== "visible" || cs.overflowY !== "visible") list.push(a)
    }
    return list
  }
  const has3d = (el: Element) => {
    for (let a: Element | null = el; a; a = a.parentElement) {
      const cs = getComputedStyle(a)
      if (cs.transform !== "none" && /matrix3d/.test(cs.transform)) return true
      if (cs.perspective !== "none" || cs.transformStyle === "preserve-3d") return true
    }
    return false
  }
  const visible = (el: Element) => {
    for (let a: Element | null = el; a; a = a.parentElement) {
      const cs = getComputedStyle(a)
      if (cs.display === "none" || cs.visibility === "hidden" || +cs.opacity === 0) return false
    }
    return true
  }

  // Every rendered line of every text node.
  type Box = { owner: Element; name: string; r: DOMRect }
  const boxes: Box[] = []
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (!n.textContent?.trim()) continue
    const el = n.parentElement!
    if (!visible(el) || el.closest("style,title,script")) continue
    if (has3d(el)) {
      out.push({ kind: "not_measurable", detail: `${label(el)} sits under a 3D transform` })
      continue
    }
    const range = document.createRange()
    range.selectNodeContents(n)
    const rects = [...range.getClientRects()].filter((r) => r.width > 0.5 && r.height > 0.5)
    const owner = el.closest("p,h1,h2,h3,li,a,div,span[data-field]") ?? el
    const block = el.closest("p,h1,h2,h3,li,div") ?? el
    for (const r of rects) {
      let cut = false
      if (r.left < -0.5 || r.top < -0.5 || r.right > canvas.w + 0.5 || r.bottom > canvas.h + 0.5) {
        out.push({ kind: "off_canvas", detail: `${label(owner)} line at ${Math.round(r.left)},${Math.round(r.top)}–${Math.round(r.right)},${Math.round(r.bottom)}` })
      }
      for (const c of clips(el)) {
        const cr = c.getBoundingClientRect()
        const cs = getComputedStyle(c)
        const top = cr.top + parseFloat(cs.borderTopWidth)
        const left = cr.left + parseFloat(cs.borderLeftWidth)
        const bottom = top + c.clientHeight
        const right = left + c.clientWidth
        if (r.top < top - 0.5 || r.left < left - 0.5 || r.bottom > bottom + 0.5 || r.right > right + 0.5) {
          out.push({ kind: "clipped", detail: `${label(owner)} line cut by ${label(c)} (line ${Math.round(r.top)}–${Math.round(r.bottom)}, box ${Math.round(top)}–${Math.round(bottom)})` })
          cut = true
          break
        }
      }
      // A clipped line isn't painted where its box says, so it can't collide;
      // it is already reported above.
      if (!cut) boxes.push({ owner: block, name: label(owner), r })
    }
  }

  // Words broken across lines. overflow-wrap:anywhere keeps a too-long word
  // inside its box, but "Replaceme / nts" is a defect a reader sees.
  const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
  for (let n = tw.nextNode(); n; n = tw.nextNode()) {
    const t = n.textContent ?? ""
    if (!t.trim() || !visible(n.parentElement!) || n.parentElement!.closest("style,title,script")) continue
    const re = /[A-Za-z0-9]{2,}/g
    for (let m = re.exec(t); m; m = re.exec(t)) {
      const r = document.createRange()
      r.setStart(n, m.index)
      r.setEnd(n, m.index + m[0].length)
      const tops = new Set([...r.getClientRects()].filter((x) => x.width > 0.5).map((x) => Math.round(x.top)))
      if (tops.size > 1) out.push({ kind: "word_break", detail: `${label(n.parentElement!)} breaks "${m[0]}" across lines` })
    }
  }

  // Clipping boxes whose content is larger than the box itself.
  for (const el of document.querySelectorAll("body *")) {
    const cs = getComputedStyle(el)
    if (cs.overflowX === "visible" && cs.overflowY === "visible") continue
    if (el.tagName === "IMG" || !visible(el)) continue
    if (el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1) {
      out.push({ kind: "overflowing_box", detail: `${label(el)} content ${el.scrollWidth}x${el.scrollHeight} in ${el.clientWidth}x${el.clientHeight}` })
    }
  }

  // Images that matter for collisions: logo and QR. The photo is a backdrop.
  for (const img of document.querySelectorAll("img.logo, img.qr")) {
    if (visible(img)) boxes.push({ owner: img, name: `img.${img.className}`, r: img.getBoundingClientRect() })
  }
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i], b = boxes[j]
      if (a.owner === b.owner || a.owner.contains(b.owner) || b.owner.contains(a.owner)) continue
      const w = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left)
      const h = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top)
      if (w > 1 && h > 1) out.push({ kind: "collision", detail: `${a.name} overlaps ${b.name} (${Math.round(w)}x${Math.round(h)}px)` })
    }
  }

  // Layout regions with nothing in them: no text, no image, no gradient — a
  // flat box occupying page area.
  const minArea = canvas.w * canvas.h * 0.04
  for (const el of document.querySelectorAll(".page *")) {
    const r = el.getBoundingClientRect()
    if (r.width * r.height < minArea || !visible(el)) continue
    const hasText = (el.textContent ?? "").trim().length > 0
    const hasMedia = el.querySelector("img,svg,canvas,video") !== null || el.tagName === "IMG"
    const paints = (c: Element) => {
      const s = getComputedStyle(c)
      return s.backgroundImage !== "none" || parseFloat(s.borderTopWidth) + parseFloat(s.borderLeftWidth) > 0
    }
    const decorated = paints(el)
    // An empty box only counts if nothing inside it paints either (a
    // gradient, or a drawn mark like the door hanger's hole guide).
    const paintedChild = [...el.querySelectorAll("*")].some(paints)
    if (!hasText && !hasMedia && !decorated && !paintedChild) {
      out.push({ kind: "empty_region", detail: `${label(el)} ${Math.round(r.width)}x${Math.round(r.height)} at y=${Math.round(r.top)} has no content` })
    }
  }
  return out
}

/** Pixel pass: the largest flat single-colour area not explained by content. */
function flatRegions(png: Buffer, _canvas: { w: number; h: number }): Finding[] {
  const img = PNG.sync.read(png)
  const cell = 20
  const cols = Math.floor(img.width / cell), rows = Math.floor(img.height / cell)
  const colour = new Int32Array(cols * rows).fill(-1)
  for (let cy = 0; cy < rows; cy++) {
    for (let cx = 0; cx < cols; cx++) {
      let first = -1, flat = true
      for (let y = cy * cell; y < (cy + 1) * cell && flat; y += 2) {
        for (let x = cx * cell; x < (cx + 1) * cell; x += 2) {
          const i = (y * img.width + x) * 4
          const v = (img.data[i] << 16) | (img.data[i + 1] << 8) | img.data[i + 2]
          if (first === -1) first = v
          else if (Math.abs((v >> 16) - (first >> 16)) + Math.abs(((v >> 8) & 255) - ((first >> 8) & 255)) + Math.abs((v & 255) - (first & 255)) > 6) {
            flat = false
            break
          }
        }
      }
      if (flat) colour[cy * cols + cx] = first
    }
  }
  // Largest solid rectangle of ONE colour. A connected-component measure
  // was tried first and mis-scored text-heavy pages: the white ground
  // between lines joins into one big "flat" component. A rectangle can't
  // pass through text, so only genuinely empty areas score.
  const counts = new Map<number, number>()
  for (const v of colour) if (v !== -1) counts.set(v, (counts.get(v) ?? 0) + 1)
  let best = { area: 0, colour: 0, x0: 0, y0: 0, x1: 0, y1: 0 }
  for (const [c] of [...counts].sort((a, b) => b[1] - a[1]).slice(0, 4)) {
    const heights = new Int32Array(cols)
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) heights[x] = colour[y * cols + x] === c ? heights[x] + 1 : 0
      const stack: number[] = []
      for (let x = 0; x <= cols; x++) {
        const h = x === cols ? 0 : heights[x]
        while (stack.length && heights[stack[stack.length - 1]] >= h) {
          const top = stack.pop()!
          const left = stack.length ? stack[stack.length - 1] + 1 : 0
          const area = heights[top] * (x - left)
          if (area > best.area) best = { area, colour: c, x0: left, y0: y - heights[top] + 1, x1: x, y1: y + 1 }
        }
        stack.push(x)
      }
    }
  }
  const share = best.area / (cols * rows)
  // A void is an empty area content could actually occupy: at least 12% of
  // the canvas AND at least 30% of its width AND 15% of its height. The two
  // dimension floors were added after the first after-run, where a centred
  // four-letter headline's side margins (200x660px, 24% of the width) scored
  // as a "void"; every defect the BEFORE run found still trips this rule —
  // the empty photo bands (99% wide), the voids under minimal offers (99%
  // wide, 38% tall) and the empty side panel (38% wide) — verified by
  // re-scoring the baseline renders.
  const wide = (best.x1 - best.x0) / cols, tall = (best.y1 - best.y0) / rows
  if (share < 0.12 || wide < 0.3 || tall < 0.15) return []
  const hex = `#${best.colour.toString(16).padStart(6, "0")}`
  return [{
    kind: "flat_region",
    detail: `${Math.round(share * 100)}% of the canvas is one solid ${hex} rectangle (x ${best.x0 * cell}–${best.x1 * cell}, y ${best.y0 * cell}–${best.y1 * cell})`,
  }]
}

/* --------------------------------- Run ------------------------------------ */

async function render(page: Page, html: string, canvas: { w: number; h: number }, fonts: "production" | "local") {
  await page.setViewportSize({ width: canvas.w, height: canvas.h })
  const doc = fonts === "production" ? html.replace("</head>", `<style>${productionFontCss()}</style></head>`) : html
  await page.setContent(doc, { waitUntil: "load" })
  // tsx compiles named functions with a __name helper the page doesn't have.
  await page.evaluate("window.__name = (f) => f")
  await page.evaluate(async () => {
    await document.fonts.ready
    await Promise.all([...document.images].map((i) => i.decode().catch(() => undefined)))
  })
  const png = await page.screenshot({ type: "png", clip: { x: 0, y: 0, width: canvas.w, height: canvas.h } })
  const dom = (await page.evaluate(INSPECT, canvas)) as Finding[]
  return { png, findings: [...dom, ...flatRegions(png, canvas)] }
}

export interface Cell {
  id: string
  template: string
  archetype: string
  formatId: string
  content: "min" | "max"
  photo: boolean
  font: string
  fonts: "production" | "local"
  findings: Finding[]
}

/**
 * --rescore=<dir>: re-applies the CURRENT void rule to an earlier run's
 * screenshots and reports, per earlier flat_region finding, whether it still
 * trips. Any change to the rule must leave every real defect flagged.
 */
async function rescore(dir: string) {
  const cells = JSON.parse(fs.readFileSync(path.join(dir, "findings.json"), "utf8")) as Cell[]
  let had = 0, still = 0
  const lost: string[] = []
  for (const c of cells) {
    if (!c.findings.some((f) => f.kind === "flat_region")) continue
    had++
    const png = fs.readFileSync(path.join(dir, `${c.id}.png`))
    const img = PNG.sync.read(png)
    if (flatRegions(png, { w: img.width, h: img.height }).length) still++
    else lost.push(`${c.id}: ${c.findings.find((f) => f.kind === "flat_region")!.detail}`)
  }
  console.log(`${had} renders had a flat_region; ${still} still do under the current rule`)
  for (const l of lost) console.log(`  NO LONGER FLAGGED  ${l}`)
}

async function main() {
  const rescoreDir = process.argv.find((a) => a.startsWith("--rescore="))?.split("=")[1]
  if (rescoreDir) return rescore(rescoreDir)
  fs.mkdirSync(OUT, { recursive: true })
  const a = await assets()
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()
  const modes: ("production" | "local")[] = FONT_MODE === "both" ? ["production", "local"] : [FONT_MODE]
  const cells: Cell[] = []

  for (const fonts of modes) {
    for (const template of TEMPLATES) {
      for (const formatId of template.formatIds) {
        for (const content of ["min", "max"] as const) {
          for (const photo of [true, false]) {
            for (const font of CURATED_FONTS) {
              const id = `${fonts}__${template.id}__${formatId}__${content}__${photo ? "photo" : "nophoto"}__${font.id}`
              const html = buildStoredHtml(template, formatId, CONTENT[content], photo ? STRESS_PHOTO : null, { heading: font.heading, body: font.body }, a)
              const canvas = canvasOf(html)
              const r = await render(page, html, canvas, fonts)
              fs.writeFileSync(path.join(OUT, `${id}.png`), r.png)
              cells.push({ id, template: template.id, archetype: template.archetype, formatId, content, photo, font: font.id, fonts, findings: r.findings })
            }
          }
        }
      }
    }
  }
  // --extra=<dir>: any other documents (AI-path proposals, a production
  // flyer), inspected the same way at their own full height.
  const extraDir = process.argv.find((a) => a.startsWith("--extra="))?.split("=")[1]
  if (extraDir) {
    for (const f of fs.readdirSync(extraDir).filter((n) => n.endsWith(".html") && !n.endsWith(".raw.html")).sort()) {
      const html = fs.readFileSync(path.join(extraDir, f), "utf8")
      await page.setViewportSize({ width: 850, height: 1100 })
      await page.setContent(html, { waitUntil: "load" })
      const dims = (await page.evaluate("({ w: Math.max(document.documentElement.scrollWidth, 350), h: document.documentElement.scrollHeight })")) as { w: number; h: number }
      const canvas = /1080px\s+1080px/.test(html) ? { w: 1080, h: 1080 } : { w: Math.min(dims.w, 1080), h: dims.h }
      const r = await render(page, html, canvas, "production")
      const id = `production__extra__${f.replace(/\.html$/, "")}`
      fs.writeFileSync(path.join(OUT, `${id}.png`), r.png)
      cells.push({ id, template: "extra", archetype: "ai", formatId: f.replace(/\.html$/, ""), content: "max", photo: false, font: "as-generated", fonts: "production", findings: r.findings })
    }
  }
  await browser.close()

  fs.writeFileSync(path.join(OUT, "findings.json"), JSON.stringify(cells, null, 2))
  for (const fonts of modes) await grid(cells.filter((c) => c.fonts === fonts && c.template !== "extra"), fonts)
  if (cells.some((c) => c.template === "extra")) await extraGrid(cells.filter((c) => c.template === "extra"))

  const bad = cells.filter((c) => c.findings.some((f) => f.kind !== "not_measurable"))
  const byKind = new Map<string, number>()
  for (const c of cells) for (const f of c.findings) byKind.set(f.kind, (byKind.get(f.kind) ?? 0) + 1)
  console.log(`${cells.length} renders, ${bad.length} with findings`)
  for (const [k, n] of [...byKind].sort()) console.log(`  ${k}: ${n}`)
  process.exit(bad.length ? 1 : 0)
}

/**
 * Contact sheet: one row per template x format, columns min/max x photo/no
 * photo, each cell the WORST font pairing for that combination (most
 * findings), red-outlined when it has any.
 */
async function grid(cells: Cell[], fonts: string) {
  const rows = [...new Set(cells.map((c) => `${c.template}__${c.formatId}`))]
  const cols = [["min", true], ["max", true], ["min", false], ["max", false]] as const
  const W = 300, H = 360, LABEL = 46
  const composites: OverlayOptions[] = []
  const svgText: string[] = []
  for (const [ri, row] of rows.entries()) {
    for (const [ci, [content, photo]] of cols.entries()) {
      const group = cells.filter((c) => `${c.template}__${c.formatId}` === row && c.content === content && c.photo === photo)
      const worst = group.sort((x, y) => y.findings.length - x.findings.length)[0]
      const buf = await sharp(path.join(OUT, `${worst.id}.png`)).resize(W - 16, H - LABEL - 16, { fit: "contain", background: "#ffffff" }).png().toBuffer()
      composites.push({ input: buf, left: 220 + ci * W + 8, top: 40 + ri * H + 8 })
      const n = worst.findings.filter((f) => f.kind !== "not_measurable").length
      svgText.push(`<rect x="${220 + ci * W + 4}" y="${40 + ri * H + 4}" width="${W - 8}" height="${H - LABEL}" fill="none" stroke="${n ? "#d0021b" : "#1a7f37"}" stroke-width="${n ? 4 : 2}"/>`)
      svgText.push(`<text x="${220 + ci * W + 10}" y="${40 + ri * H + H - 22}" font-family="Arial" font-size="13" fill="${n ? "#d0021b" : "#1a7f37"}">${n ? `${n} finding(s)` : "clean"} · worst font: ${worst.font}</text>`)
    }
    svgText.push(`<text x="10" y="${40 + ri * H + H / 2}" font-family="Arial" font-size="15" font-weight="700">${row.split("__")[0]}</text>`)
    svgText.push(`<text x="10" y="${40 + ri * H + H / 2 + 20}" font-family="Arial" font-size="13">${row.split("__")[1]}</text>`)
  }
  cols.forEach(([content, photo], ci) => svgText.push(`<text x="${220 + ci * W + 10}" y="26" font-family="Arial" font-size="15" font-weight="700">${content} · ${photo ? "photo" : "no photo"}</text>`))
  const width = 220 + cols.length * W, height = 40 + rows.length * H
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${svgText.join("")}</svg>`
  await sharp({ create: { width, height, channels: 3, background: "#ffffff" } })
    .composite([...composites, { input: Buffer.from(svg), left: 0, top: 0 }])
    .png()
    .toFile(path.join(OUT, `grid-${fonts}.png`))
}

/** One row per extra document, same outline convention as the main grid. */
async function extraGrid(cells: Cell[]) {
  const W = 300, H = 400, LABEL = 46
  const composites: OverlayOptions[] = []
  const svg: string[] = []
  for (const [i, c] of cells.entries()) {
    const buf = await sharp(path.join(OUT, `${c.id}.png`)).resize(W - 16, H - LABEL - 16, { fit: "contain", background: "#ffffff" }).png().toBuffer()
    composites.push({ input: buf, left: i * W + 8, top: 40 + 8 })
    const n = c.findings.filter((f) => f.kind !== "not_measurable").length
    svg.push(`<rect x="${i * W + 4}" y="44" width="${W - 8}" height="${H - LABEL}" fill="none" stroke="${n ? "#d0021b" : "#1a7f37"}" stroke-width="${n ? 4 : 2}"/>`)
    svg.push(`<text x="${i * W + 10}" y="28" font-family="Arial" font-size="14" font-weight="700">${c.formatId}</text>`)
    svg.push(`<text x="${i * W + 10}" y="${40 + H - 22}" font-family="Arial" font-size="13" fill="${n ? "#d0021b" : "#1a7f37"}">${n ? `${n} finding(s)` : "clean"}</text>`)
  }
  const width = Math.max(1, cells.length) * W, height = 40 + H
  await sharp({ create: { width, height, channels: 3, background: "#ffffff" } })
    .composite([...composites, { input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${svg.join("")}</svg>`), left: 0, top: 0 }])
    .png()
    .toFile(path.join(OUT, "grid-extra.png"))
}

main().catch((err) => {
  console.error(err)
  process.exit(2)
})
