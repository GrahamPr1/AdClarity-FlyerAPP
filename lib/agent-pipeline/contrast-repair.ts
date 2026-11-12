import type { Page } from "playwright-core"
import { PNG } from "pngjs"

/**
 * Text contrast measured from RENDERED PIXELS, and repaired where it fails.
 *
 * legibility.ts can only reason about colours it can resolve from markup, and
 * says so: contrast against a photo, a gradient or a class-styled button isn't
 * computable from a DOM tree. This renders the flyer twice — the second time
 * with every glyph transparent — so the backdrop behind each line is the real
 * composited pixel, and scores the 10th-percentile contrast over every pixel
 * under each painted line (a mean hides the bright patch behind one word).
 *
 * Shared by the generation pipeline (repairContrast, AI-path flyers on public
 * accounts) and the offline audit (scripts/flyer-contrast-audit.ts), so what
 * the audit reports is exactly what the pipeline enforces.
 */

export interface TextItem {
  text: string
  color: string
  need: number
  eff: number
  /** body > :nth-child(…) path, to address the element in the source HTML. */
  path: string
  rects: { x: number; y: number; w: number; h: number }[]
  why?: string
}

/** Runs in the page: every element with its own text, its painted line boxes, and anything that makes it unscorable. */
export const COLLECT_TEXT = (canvas: { w: number; h: number }) => {
  const out: TextItem[] = []
  const pathOf = (el: Element) => {
    const parts: string[] = []
    for (let e: Element | null = el; e && e !== document.body; e = e.parentElement) {
      parts.unshift(`:nth-child(${[...e.parentElement!.children].indexOf(e) + 1})`)
    }
    return `body > ${parts.join(" > ")}`
  }
  for (const el of document.querySelectorAll("body *")) {
    if (el.closest("style,title,script")) continue
    const nodes = [...el.childNodes].filter((n) => n.nodeType === 3 && (n.textContent ?? "").trim())
    if (!nodes.length) continue
    const cs = getComputedStyle(el)
    const size = parseFloat(cs.fontSize)
    const bold = +cs.fontWeight >= 600
    let eff = 1
    let threeD = false
    let hidden = false
    for (let a: Element | null = el; a && a !== document.documentElement; a = a.parentElement) {
      const c = getComputedStyle(a)
      eff *= +c.opacity
      if (c.display === "none" || c.visibility === "hidden") hidden = true
      if (c.transformStyle === "preserve-3d" || c.perspective !== "none" || /matrix3d/.test(c.transform)) threeD = true
    }
    // Only the part of a line actually painted counts: inside the canvas and
    // inside every clipping ancestor.
    let clip = { l: 0, t: 0, r: canvas.w, b: canvas.h }
    for (let a = el.parentElement; a && a !== document.documentElement; a = a.parentElement) {
      const c = getComputedStyle(a)
      if (c.overflowX === "visible" && c.overflowY === "visible") continue
      const ar = a.getBoundingClientRect()
      const t = ar.top + parseFloat(c.borderTopWidth), l = ar.left + parseFloat(c.borderLeftWidth)
      clip = { l: Math.max(clip.l, l), t: Math.max(clip.t, t), r: Math.min(clip.r, l + a.clientWidth), b: Math.min(clip.b, t + a.clientHeight) }
    }
    const rects: TextItem["rects"] = []
    for (const n of nodes) {
      const r = document.createRange()
      r.selectNodeContents(n)
      for (const b of r.getClientRects()) {
        const x = Math.max(clip.l, b.left), y = Math.max(clip.t, b.top)
        const w = Math.min(clip.r, b.right) - x, h = Math.min(clip.b, b.bottom) - y
        if (w > 1 && h > 1) rects.push({ x, y, w, h })
      }
    }
    // Occlusion: is something ELSE painted on top of this text? Sampled along
    // the middle of each painted line with elementFromPoint (the topmost
    // element there). An unrelated element on top means the text is covered —
    // a collision, not a colour problem: an AI flyer drew its $89 medallion
    // over the subhead, which a colour-only check scored as 2.08:1. Neither
    // measureLayout (overflow and page count) nor a colour change can see or
    // fix that, so it is reported as what it is.
    let covered = 0
    let coveredBy = ""
    // Only something that PAINTS counts: a border-only ring laid over a
    // medallion has a box on top of the text but nothing opaque over it.
    const paints = (e: Element) => {
      if (/^(img|svg|canvas|video|picture|path|circle|rect|polygon|ellipse)$/i.test(e.tagName)) return true
      const c = getComputedStyle(e)
      if (c.backgroundImage !== "none") return true
      const m = c.backgroundColor.match(/rgba?\(\d+,\s*\d+,\s*\d+(?:,\s*([\d.]+))?\)/)
      return !!m && (m[1] === undefined ? 1 : +m[1]) > 0.05
    }
    for (const r of rects) {
      for (const fx of [0.05, 0.15, 0.27, 0.39, 0.5, 0.61, 0.73, 0.85, 0.95]) {
        const stack = document.elementsFromPoint(r.x + r.w * fx, r.y + r.h / 2)
        const at = stack.findIndex((e) => e === el || el.contains(e))
        if (at === -1) continue
        const over = stack.slice(0, at).find((e) => !e.contains(el) && paints(e))
        if (!over) continue
        covered++
        coveredBy ||= `${over.tagName.toLowerCase()}${typeof over.className === "string" && over.className ? "." + over.className.split(" ")[0] : ""}`
      }
    }
    const item: TextItem = {
      text: nodes.map((n) => n.textContent!.trim()).join(" ").slice(0, 48),
      color: cs.color,
      need: size >= 24 || (size >= 18.66 && bold) ? 3 : 4.5,
      eff,
      path: pathOf(el),
      rects,
    }
    if (hidden) item.why = "not displayed"
    // Any opaque paint over a glyph is a defect: a medallion over a fifth of a
    // subhead is still a medallion over the subhead.
    else if (covered > 0) item.why = `covered by another element (collision with ${coveredBy})`
    else if (!rects.length) item.why = "no painted line (off the canvas or clipped away)"
    else if (/rgba?\(0, 0, 0, 0\)/.test(cs.webkitTextFillColor ?? "") && cs.webkitTextFillColor !== cs.color) item.why = "text fill is transparent (background-clip text)"
    else if (threeD) item.why = "3D-projected (box is not where it paints)"
    else if (eff === 0) item.why = "opacity 0 (not painted)"
    out.push(item)
  }
  return out
}

/**
 * The backdrop pass. Transitions off: a `transition:all` animates the glyphs
 * TO transparent, and a mid-fade screenshot photographs the text as its own
 * backdrop (an AI flyer's CTA read 1:1 that way).
 */
export const BACKDROP_CSS =
  "*,*::before,*::after{transition:none!important;animation:none!important;color:transparent!important;-webkit-text-fill-color:transparent!important;text-shadow:none!important}"

type Rgb = { r: number; g: number; b: number }
const lum = ({ r, g, b }: Rgb) => {
  const f = (v: number) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
}
const ratio = (a: number, b: number) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
const parse = (c: string) => {
  const m = c.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?/)
  return m ? { r: +m[1], g: +m[2], b: +m[3], a: m[4] === undefined ? 1 : +m[4] } : null
}

/** 10th-percentile contrast of `fg` (with alpha) over every sampled backdrop pixel under the item's lines. */
function p10(item: TextItem, fg: Rgb & { a: number }, bg: PNG): number | null {
  const alpha = fg.a * item.eff
  const ratios: number[] = []
  for (const r of item.rects) {
    for (let y = r.y + 1; y < r.y + r.h - 1; y += 2) {
      for (let x = r.x + 1; x < r.x + r.w - 1; x += 2) {
        const xi = Math.min(bg.width - 1, Math.round(x)), yi = Math.min(bg.height - 1, Math.round(y))
        const i = (yi * bg.width + xi) * 4
        const b = { r: bg.data[i], g: bg.data[i + 1], b: bg.data[i + 2] }
        const t = { r: fg.r * alpha + b.r * (1 - alpha), g: fg.g * alpha + b.g * (1 - alpha), b: fg.b * alpha + b.b * (1 - alpha) }
        ratios.push(ratio(lum(t), lum(b)))
      }
    }
  }
  if (!ratios.length) return null
  ratios.sort((a, b) => a - b)
  return ratios[Math.floor(ratios.length * 0.1)]
}

export interface ContrastResult {
  found: number
  scored: number
  failing: { text: string; ratio: number; need: number; color: string; path: string; fix: string | null }[]
  notScorable: { text: string; why: string }[]
}

const FIXES: [string, Rgb & { a: number }][] = [
  ["#ffffff", { r: 255, g: 255, b: 255, a: 1 }],
  ["#11141a", { r: 17, g: 20, b: 26, a: 1 }],
]

/** Scores every collected item against the backdrop, and names a colour that would pass for each failure (or null). */
export function scoreContrast(items: TextItem[], backdrop: PNG): ContrastResult {
  const result: ContrastResult = { found: items.length, scored: 0, failing: [], notScorable: [] }
  for (const it of items) {
    if (it.why) {
      result.notScorable.push({ text: it.text, why: it.why })
      continue
    }
    const fg = parse(it.color)
    if (!fg) {
      result.notScorable.push({ text: it.text, why: `unparseable colour ${it.color}` })
      continue
    }
    const r = p10(it, fg, backdrop)
    if (r === null) {
      result.notScorable.push({ text: it.text, why: "line too small to sample" })
      continue
    }
    result.scored++
    if (r >= it.need) continue
    let fix: string | null = null
    let best = 0
    for (const [hex, c] of FIXES) {
      const fr = p10({ ...it, eff: 1 }, c, backdrop) ?? 0
      if (fr >= it.need && fr > best) {
        best = fr
        fix = hex
      }
    }
    result.failing.push({ text: it.text, ratio: +r.toFixed(2), need: it.need, color: it.color, path: it.path, fix })
  }
  return result
}

/** Render, collect, backdrop pass, score — on a page the caller owns. */
export async function measureContrastOnPage(page: Page, html: string, canvas: { w: number; h: number }): Promise<ContrastResult> {

  await page.setViewportSize({ width: canvas.w, height: canvas.h })
  await page.setContent(html, { waitUntil: "load" })
  // tsx/esbuild name helpers aren't defined in the page.
  await page.evaluate("window.__name = (f) => f").catch(() => undefined)
  await page.evaluate(async () => {
    await document.fonts.ready
    await Promise.all([...document.images].map((i) => i.decode().catch(() => undefined)))
  })
  // A paginated document (a proposal) runs past its first page: measure it
  // at its full rendered height, or everything below page one goes unscored
  // — and unrepaired.
  const full = (await page.evaluate("document.documentElement.scrollHeight")) as number
  if (full > canvas.h + 1) {
    canvas = { w: canvas.w, h: full }
    await page.setViewportSize({ width: canvas.w, height: canvas.h })
  }
  const items = (await page.evaluate(COLLECT_TEXT, canvas)) as TextItem[]
  // The repair's own overrides out first: they outrank the backdrop rule (a
  // DOM-path selector beats *), and would leave the repaired text visible in
  // the backdrop — measuring it against itself at 1:1.
  await page.evaluate(() => document.querySelectorAll("style[data-oneflyer-contrast]").forEach((e) => e.remove()))
  // Not page.addStyleTag: it waits on the style element's load event inside
  // the page, which never fires with JavaScript off (the pipeline's context,
  // like the PDF renderer's) — the call hangs.
  await page.evaluate((css) => {
    const el = document.createElement("style")
    el.textContent = css
    document.head.appendChild(el)
  }, BACKDROP_CSS)
  const backdrop = PNG.sync.read(await page.screenshot({ type: "png", clip: { x: 0, y: 0, width: canvas.w, height: canvas.h } }))
  return scoreContrast(items, backdrop)
}

/** The canvas a flyer document declares (template shell or @page), defaulting to letter at 100dpi. */
export function canvasOfHtml(html: string): { w: number; h: number } {
  const shell = html.match(/html,body\{width:(\d+)px;height:(\d+)px\}/)
  if (shell) return { w: +shell[1], h: +shell[2] }
  if (/@page\s*\{[^}]*size:\s*1080px\s+1080px/i.test(html)) return { w: 1080, h: 1080 }
  if (/@page\s*\{[^}]*size:\s*3\.5in\s+8\.5in/i.test(html)) return { w: 350, h: 850 }
  return { w: 850, h: 1100 }
}

export interface ContrastRepair {
  html: string
  repaired: { text: string; from: number; to: string }[]
  unrepaired: { text: string; ratio: number; need: number }[]
  /** Text another element is painted over — a layout collision, logged, not recoloured. */
  covered: { text: string; why: string }[]
}

/**
 * Measures a finished flyer and overrides the colour of every text element
 * that fails, with white or near-black — whichever passes on its measured
 * backdrop. Appended as one <style> block addressed by DOM path; the document
 * itself is not re-serialised, so its markup stays exactly as generated.
 *
 * For PUBLIC accounts on the AI path only: template flyers get their colours
 * right by construction (template-mode.ts), and an enterprise org's approved
 * colours are not altered — the caller logs their failures instead.
 *
 * Never throws: if the browser is unavailable the flyer is returned unchanged
 * with nothing claimed repaired.
 */
export async function repairContrast(html: string, opts: { apply?: boolean } = {}): Promise<ContrastRepair> {
  const { acquireBrowser } = await import("@/lib/pdf/flyer-pdf")
  const { isAllowedPdfRequest } = await import("@/lib/pdf/request-policy")
  const { ownSiteHosts } = await import("@/lib/site-url")
  const { getAppEnvironment } = await import("@/lib/env")
  const { browser, release } = await acquireBrowser()
  const context = await browser.newContext({ javaScriptEnabled: false })
  // The same request policy the PDF renderer applies (lib/pdf/flyer-pdf.ts):
  // the flyer may load only fonts, stock-photo CDNs, Blob and our photo route.
  const policy = { siteHosts: ownSiteHosts(), allowDevHttpLoopback: getAppEnvironment() === "development" }
  await context.route("**/*", (route) =>
    isAllowedPdfRequest(route.request().url(), route.request().method(), policy) ? route.continue() : route.abort("blockedbyclient"),
  )
  try {
    const page = await context.newPage()
    const result = await measureContrastOnPage(page, html, canvasOfHtml(html))
    // apply:false measures only — an enterprise org's colours are reported, not changed.
    const fixable = opts.apply === false ? [] : result.failing.filter((f) => f.fix)
    const repaired = fixable.map((f) => ({ text: f.text, from: f.ratio, to: f.fix! }))
    const unrepaired = result.failing.filter((f) => !fixable.includes(f)).map((f) => ({ text: f.text, ratio: f.ratio, need: f.need }))
    const covered = result.notScorable.filter((n) => n.why.startsWith("covered by"))
    if (!fixable.length) return { html, repaired, unrepaired, covered }
    const css = fixable.map((f) => `${f.path}{color:${f.fix}!important;-webkit-text-fill-color:${f.fix}!important}`).join("")
    const tag = `<style data-oneflyer-contrast>${css}</style>`
    const at = html.toLowerCase().lastIndexOf("</head>")
    return { html: at === -1 ? tag + html : html.slice(0, at) + tag + html.slice(at), repaired, unrepaired, covered }
  } finally {
    await context.close().catch(() => undefined)
    await release()
  }
}
