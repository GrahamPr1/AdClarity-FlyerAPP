import fs from "node:fs"
import path from "node:path"
import type { BrowserContext, Page } from "playwright-core"
import QRCode from "qrcode"
import { PNG } from "pngjs"
import jsQR from "jsqr"
import { acquireBrowser } from "@/lib/pdf/flyer-pdf"
import { AP_KIT_ORIGIN, PAGE, SPACING, applySpacing, assertNoForeignBrand, esc, fillTemplate, hashOutsideFooter, kitFileFor } from "./kit"
import { MAX_LINES } from "./max-lines"
import type { Layout } from "./slots"
import type { Size } from "./content"

// Renders one platform flyer. Copied from NOP's kit-v2 renderer (render-v2.ts,
// render.ts, agent-area.ts, qr-gate.ts) and changed only where the platform
// differs: slots instead of a fixed body, an org's approved hash instead of
// "as supplied", and a PROOF watermark for anything not approved.
//
// Gates, all before anything is returned (ApRenderError otherwise):
//   - outside the footer the page hashes to `expectHash` (approved renders);
//   - no foreign brand text (kit.ts BANNED) that the org didn't type itself;
//   - every slot: no overflow, at most its pinned line count (max-lines.ts);
//   - page: <main> and the page don't overflow, footer ends at the page
//     bottom, no gap between <main>'s blocks under 0.08in;
//   - agent area: name, phone and link each on their lines inside the footer
//     band, clear of the footer text and the QR; QR box 0.9in;
//   - fonts loaded; the QR read back from the page at 150 dpi is exactly the
//     agent's QR link; PDFs are one page at Letter or bleed size.

export class ApRenderError extends Error {
  constructor(
    public code: "slot_too_long" | "page_overflow" | "hash_mismatch" | "foreign_brand" | "fonts_not_loaded" | "qr_mismatch" | "master_invalid",
    message: string,
    public slot?: string,
    /** Every measured problem, when the failure was a gate. */
    public problems: { code: string; message: string; slot?: string }[] = [],
  ) {
    super(message)
  }
}

export type Output = "pdf" | "png" | "thumb"

export interface AgentValues {
  name: string
  phone: string
  /** What the printed link opens, and its printed line(s). */
  link: { href: string; lines: string[] }
  /** The URL the QR encodes. */
  qr: string
}

export interface RenderInput {
  layout: Layout
  lang: "en" | "es"
  size: Size
  showPrice: boolean
  title: string
  screenLabel: string
  logoHtml: string
  slots: Record<string, string>
  agent: AgentValues
  /** A spacing name to use, or null to pick the first that fits (layout order). */
  spacing: string | null
  /** Approved renders: the stored hash the page must match. Null for proofs. */
  expectHash: string | null
  proof: boolean
  /** Calibration only (scripts/ap-measure-lines.ts): skip the per-slot line limits. Page gates still apply. */
  calibrate?: boolean
}

export interface Rendered {
  body: Buffer
  contentType: string
  spacing: string
  hash: string
  qr: string
  ms: number
}

/** The page outside the footer, filled and spaced: what's hashed. */
export function pageHtml(input: Omit<RenderInput, "agent" | "expectHash" | "proof" | "spacing">, spacing: string): string {
  const html = applySpacing(
    fillTemplate({ layout: input.layout, lang: input.lang, size: input.size, showPrice: input.showPrice, title: input.title, screenLabel: input.screenLabel, logoHtml: input.logoHtml, slots: input.slots }),
    input.layout,
    spacing,
  )
  return html
}

// ---- Agent area (copied from NOP's agent-area.ts) ----

const AGENT_QR_IN = 0.7
const AGENT_QR_QUIET_IN = 0.1
const AGENT_QR_BOX_IN = Math.round((AGENT_QR_IN + 2 * AGENT_QR_QUIET_IN) * 1000) / 1000

export async function qrSvg(url: string): Promise<string> {
  // Q: survives ~25% damage (a fold, a scuff). Margin 0: the white box is the quiet zone. (NOP's settings.)
  return QRCode.toString(url, { type: "svg", errorCorrectionLevel: "Q", margin: 0, color: { dark: "#000000", light: "#ffffff" } })
}

export function agentAreaHtml(v: { name: string; phone: string; link: { href: string; lines: string[] }; qrSvg: string }): string {
  return (
    `<div data-agent-area style="display:flex;align-items:center;gap:8px;min-width:0;">` +
    `<div style="display:flex;flex-direction:column;align-items:flex-end;gap:3px;text-align:right;min-width:0;">` +
    `<a data-agent-field="enroll_link" href="${esc(v.link.href)}" style="font-size:15px;font-weight:700;color:#16B2F7;white-space:nowrap;display:flex;flex-direction:column;align-items:flex-end;">${v.link.lines.map((l) => `<span>${esc(l)}</span>`).join("")}</a>` +
    `<span data-agent-field="name" style="font-size:14px;font-weight:600;letter-spacing:.3px;color:#fff;white-space:nowrap;">${esc(v.name)}</span>` +
    `<span data-agent-field="phone" style="font-size:13px;color:#c2c9dc;white-space:nowrap;">${esc(v.phone)}</span>` +
    `</div>` +
    `<div data-agent-field="qr" style="flex:none;box-sizing:border-box;width:${AGENT_QR_BOX_IN}in;height:${AGENT_QR_BOX_IN}in;padding:${AGENT_QR_QUIET_IN}in;background:#fff;">` +
    v.qrSvg.replace("<svg ", `<svg width="${AGENT_QR_IN}in" height="${AGENT_QR_IN}in" shape-rendering="crispEdges" style="display:block" `) +
    `</div>` +
    `</div>`
  )
}

// ---- Head additions (copied from NOP's kit-v2.ts) ----

const DS_FONTS = "_ds/kit/assets/fonts"
const ACCENT_METRICS = `<style>@font-face{font-family:'Opificio Rounded';src:url('${DS_FONTS}/Poppins-ExtraBold.ttf') format('truetype');font-weight:800;font-style:normal;ascent-override:70%;descent-override:19.8%;line-gap-override:4.9%;unicode-range:U+0020}</style>`

const WATERMARK_STYLE = `<style>[data-ap-proof]{position:absolute;inset:0;z-index:50;pointer-events:none;overflow:hidden}[data-ap-proof] .w{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%) rotate(-30deg);font-family:'Poppins',sans-serif;font-weight:800;font-size:150px;letter-spacing:12px;color:rgba(220,38,38,.22);white-space:nowrap}[data-ap-proof] .b{position:absolute;left:0;right:0;top:0;background:rgba(220,38,38,.92);color:#fff;font-family:'Poppins',sans-serif;font-weight:700;font-size:12px;letter-spacing:2px;text-align:center;padding:4px 0}</style>`
const WATERMARK = `<div data-ap-proof><div class="w">PROOF</div><div class="b">PROOF · NOT FOR DISTRIBUTION</div></div>`

function forRender(html: string, proof: boolean): string {
  const head = /<head[^>]*>/i.exec(html)!
  const at = head.index + head[0].length
  let out = `${html.slice(0, at)}<base href="${AP_KIT_ORIGIN}/">${ACCENT_METRICS}${proof ? WATERMARK_STYLE : ""}${html.slice(at)}`
  if (proof) out = out.replace(/(<section class="page"[^>]*>)/, `$1${WATERMARK}`)
  return out
}

// ---- Browser (copied from NOP's render.ts newPage / assertFonts) ----

const TYPES: Record<string, string> = { ".css": "text/css", ".ttf": "font/ttf", ".png": "image/png", ".svg": "image/svg+xml" }

async function newPage(dsf: number): Promise<{ context: BrowserContext; page: Page; close: () => Promise<void> }> {
  const { browser, release } = await acquireBrowser()
  const context = await browser.newContext({ viewport: { width: 1000, height: 1200 }, deviceScaleFactor: dsf })
  const close = async () => {
    await context.close().catch(() => undefined)
    await release()
  }
  return { context, page: await context.newPage(), close }
}

async function assertFonts(page: Page): Promise<void> {
  const r = await page.evaluate(async () => {
    const used = new Set<string>()
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (!(n.textContent ?? "").trim() || !n.parentElement) continue
      const cs = getComputedStyle(n.parentElement)
      if (cs.display === "none" || cs.visibility === "hidden") continue
      used.add(`${cs.fontStyle === "italic" ? "italic" : "normal"} ${cs.fontWeight}`)
    }
    await Promise.all([...used].map((u) => document.fonts.load(`${u} 16px "Poppins"`)))
    await document.fonts.ready
    const loaded = new Set<string>()
    document.fonts.forEach((f) => {
      if (f.family.replace(/"/g, "") === "Poppins" && f.status === "loaded") loaded.add(`${f.style} ${f.weight}`)
    })
    return [...used].filter((u) => !loaded.has(u))
  })
  if (r.length) throw new ApRenderError("fonts_not_loaded", `Poppins not loaded for ${r.join("; ")}`)
}

async function load(page: Page, html: string): Promise<void> {
  await page.route("**/*", async (route) => {
    const url = route.request().url()
    if (url.startsWith("data:")) return route.continue()
    const file = kitFileFor(url)
    if (!file) return route.fulfill({ status: 404, body: "" })
    return route.fulfill({ status: 200, contentType: TYPES[path.extname(file)] ?? "application/octet-stream", body: fs.readFileSync(file) })
  })
  await page.goto(`${AP_KIT_ORIGIN}/__blank`).catch(() => undefined)
  await page.setContent(html, { waitUntil: "load" })
}

// ---- Measured gates ----

export interface SlotMeasure {
  key: string
  lines: number
  overflow: boolean
  visible: boolean
}

export interface PageMeasure {
  slots: SlotMeasure[]
  mainOverflow: number
  pageOverflow: number
  footerBottomOffset: number
  minGap: number
  agentFields: { field: string; lines: number; ok: boolean }[]
  qrBox: { w: number; h: number; inFooter: boolean }
}

// Plain JavaScript as a string: bundlers wrap named functions inside
// page.evaluate in a helper (__name) that doesn't exist in the page.
const MEASURE_JS = `(() => {
  function lineCount(el) {
    var tops = new Set();
    var walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (var t = walker.nextNode(); t; t = walker.nextNode()) {
      var range = document.createRange();
      range.selectNodeContents(t);
      var rects = range.getClientRects();
      for (var i = 0; i < rects.length; i++) if (rects[i].width > 0) tops.add(Math.round(rects[i].top));
    }
    return tops.size;
  }
  var slots = Array.from(document.querySelectorAll("[data-ap-slot]")).map(function (el) {
    var block = el.parentElement;
    while (block && getComputedStyle(block).display === "inline") block = block.parentElement;
    var visible = el.getClientRects().length > 0;
    return { key: el.getAttribute("data-ap-slot"), lines: visible ? lineCount(el) : 0, overflow: !!block && block.scrollWidth > block.clientWidth + 0.5, visible: visible };
  });
  var main = document.querySelector("main");
  var pageEl = document.querySelector("section.page");
  var footer = document.querySelector("footer");
  var mb = main.getBoundingClientRect();
  var blocks = Array.from(main.children).map(function (k) { return k.getBoundingClientRect(); });
  var gaps = [blocks[0].top - mb.top];
  for (var j = 1; j < blocks.length; j++) gaps.push(blocks[j].top - blocks[j - 1].bottom);
  gaps.push(mb.bottom - blocks[blocks.length - 1].bottom);
  var fb = footer.getBoundingClientRect();
  var left = footer.firstElementChild.getBoundingClientRect();
  var qrEl = document.querySelector('[data-agent-field="qr"]');
  var qr = qrEl ? qrEl.getBoundingClientRect() : null;
  var agentFields = ["enroll_link", "name", "phone"].map(function (f) {
    var el = document.querySelector('[data-agent-field="' + f + '"]');
    if (!el || !qr) return { field: f, lines: 0, ok: false };
    var b = el.getBoundingClientRect();
    return { field: f, lines: lineCount(el), ok: b.left >= left.right + 7.5 && b.right <= qr.left - 7.5 && b.top >= fb.top && b.bottom <= fb.bottom };
  });
  return {
    slots: slots,
    mainOverflow: main.scrollHeight - main.clientHeight,
    pageOverflow: pageEl.scrollHeight - pageEl.clientHeight,
    footerBottomOffset: Math.abs(fb.bottom - pageEl.getBoundingClientRect().bottom),
    minGap: Math.min.apply(null, gaps),
    agentFields: agentFields,
    qrBox: qr ? { w: qr.width, h: qr.height, inFooter: qr.top >= fb.top && qr.bottom <= fb.bottom && qr.right <= fb.right } : { w: 0, h: 0, inFooter: false }
  };
})()`

async function measure(page: Page): Promise<PageMeasure> {
  await page.emulateMedia({ media: "print" })
  return (await page.evaluate(MEASURE_JS)) as PageMeasure
}

/** 0.08in, the smallest vertical space NOP's approved spacing allows between blocks. */
const MIN_GAP_PX = 0.08 * 96

/** Every problem with a measured page, slot problems first. Empty = passes. */
export function gateProblems(m: PageMeasure, layout: Layout, linkLines: number, calibrate = false): { code: ApRenderError["code"]; message: string; slot?: string }[] {
  const out: { code: ApRenderError["code"]; message: string; slot?: string }[] = []
  const max = MAX_LINES[layout]
  for (const s of m.slots) {
    if (!s.visible || calibrate) continue
    const allowed = max[s.key] ?? 1
    if (s.lines > allowed) out.push({ code: "slot_too_long", slot: s.key, message: `${s.key}: ${s.lines} lines, max ${allowed}` })
    else if (s.overflow) out.push({ code: "slot_too_long", slot: s.key, message: `${s.key}: doesn't fit its box` })
  }
  if (m.mainOverflow > 0.5) out.push({ code: "page_overflow", message: `content overflows the page body by ${m.mainOverflow.toFixed(1)}px` })
  if (m.pageOverflow > 0.5) out.push({ code: "page_overflow", message: `page overflows by ${m.pageOverflow.toFixed(1)}px` })
  if (m.footerBottomOffset > 0.5) out.push({ code: "page_overflow", message: `footer ends ${m.footerBottomOffset.toFixed(1)}px off the page bottom` })
  if (m.minGap < MIN_GAP_PX - 0.25) out.push({ code: "page_overflow", message: `blocks are ${m.minGap.toFixed(1)}px apart, minimum ${MIN_GAP_PX.toFixed(1)}px` })
  for (const f of m.agentFields) {
    const want = f.field === "enroll_link" ? linkLines : 1
    if (!f.ok || f.lines !== want) out.push({ code: f.field === "enroll_link" ? "master_invalid" : "slot_too_long", slot: `agent.${f.field}`, message: `agent ${f.field} doesn't fit beside the QR (${f.lines} lines, expected ${want})` })
  }
  if (Math.abs(m.qrBox.w - 0.9 * 96) > 0.5 || Math.abs(m.qrBox.h - 0.9 * 96) > 0.5 || !m.qrBox.inFooter) out.push({ code: "master_invalid", message: "QR box isn't 0.9in inside the footer" })
  return out
}

export function decodeQrFromPng(png: Buffer): string | null {
  const img = PNG.sync.read(png)
  return jsQR(new Uint8ClampedArray(img.data.buffer, img.data.byteOffset, img.data.byteLength), img.width, img.height)?.data ?? null
}

/** 150 dpi, as NOP's agent renders: layout and QR are checked at the lowest resolution a flyer is expected to print at. */
const DSF = 150 / 96

function pdfPagePoints(pdf: Buffer): { w: number; h: number } | null {
  const m = /\/MediaBox\s*\[\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\]/.exec(pdf.toString("latin1"))
  return m ? { w: Number(m[3]) - Number(m[1]), h: Number(m[4]) - Number(m[2]) } : null
}

/**
 * Measures (and optionally outputs) one page. With spacing null, tries each
 * of the layout's spacing variants in order and uses the first that passes;
 * if none passes, throws with the problems of the LAST variant tried (the
 * tightest), naming the slot.
 */
export async function renderFlyer(input: RenderInput, output: Output | null): Promise<Rendered & { measure: PageMeasure }> {
  const t0 = Date.now()
  const order = input.spacing ? [input.spacing] : SPACING[input.layout].map((s) => s.name)
  const area = agentAreaHtml({ name: input.agent.name, phone: input.agent.phone, link: input.agent.link, qrSvg: await qrSvg(input.agent.qr) })
  let lastProblems: ReturnType<typeof gateProblems> = []

  for (const spacing of order) {
    const base = pageHtml(input, spacing)
    const hash = hashOutsideFooter(base)
    if (input.expectHash && hash !== input.expectHash) throw new ApRenderError("hash_mismatch", `the page differs from the approved version (${hash.slice(0, 12)} != ${input.expectHash.slice(0, 12)})`)
    const withAgent = base.replace("{{agent_area}}", area)
    try {
      assertNoForeignBrand(withAgent, [...Object.values(input.slots), input.agent.name])
    } catch (err) {
      throw new ApRenderError("foreign_brand", err instanceof Error ? err.message : String(err))
    }

    const { page, close } = await newPage(DSF)
    try {
      await load(page, forRender(withAgent, input.proof))
      await assertFonts(page)
      const m = await measure(page)
      const problems = gateProblems(m, input.layout, input.agent.link.lines.length, input.calibrate)
      if (problems.length) {
        lastProblems = problems
        continue
      }
      const box = await page.locator('[data-agent-field="qr"]').boundingBox()
      if (!box) throw new ApRenderError("master_invalid", "QR box not found")
      const pad = 4
      const qr = decodeQrFromPng(await page.screenshot({ type: "png", clip: { x: box.x - pad, y: box.y - pad, width: box.width + 2 * pad, height: box.height + 2 * pad } }))
      if (qr !== input.agent.qr) throw new ApRenderError("qr_mismatch", `QR decoded to ${JSON.stringify(qr)}, expected ${input.agent.qr}`)

      let body: Buffer = Buffer.alloc(0)
      let contentType = "application/octet-stream"
      if (output === "pdf") {
        body = await page.pdf({ preferCSSPageSize: true, printBackground: true })
        const pages = (body.toString("latin1").match(/\/Type\s*\/Page[^s]/g) ?? []).length
        const pts = pdfPagePoints(body)
        const want = PAGE[input.size].points
        if (pages !== 1 || !pts || Math.abs(pts.w - want.w) > 0.5 || Math.abs(pts.h - want.h) > 0.5) throw new ApRenderError("master_invalid", `PDF is ${pages} page(s) at ${pts?.w}x${pts?.h}pt, expected 1 at ${want.w}x${want.h}pt`)
        contentType = "application/pdf"
      } else if (output) {
        const clip = await page.locator("section.page").first().boundingBox()
        if (!clip) throw new ApRenderError("master_invalid", "no .page element")
        body = await page.screenshot({ type: output === "thumb" ? "jpeg" : "png", ...(output === "thumb" ? { quality: 82, scale: "css" as const } : {}), clip })
        contentType = output === "thumb" ? "image/jpeg" : "image/png"
      }
      return { body, contentType, spacing, hash, qr, ms: Date.now() - t0, measure: m }
    } finally {
      await close()
    }
  }
  const first = lastProblems[0]
  throw new ApRenderError(first?.code ?? "page_overflow", lastProblems.map((p) => p.message).join("; ") || "no spacing fits", first?.slot, lastProblems)
}
