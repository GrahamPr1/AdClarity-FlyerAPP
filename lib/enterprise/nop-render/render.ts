import type { BrowserContext, Page } from "playwright-core"
import QRCode from "qrcode"
import { getBrowser } from "@/lib/pdf/flyer-pdf"
import {
  enrollUrl,
  priceValues,
  readKitContent,
  readKitFileBase64,
  readMasterHtml,
  versionStamp,
  type KitContent,
  type NopTemplateId,
} from "./kit"
import { decodeQrFromPng } from "./qr-gate"

// Renders Basic Benefits' NOP masters with an agent's details. No AI, no
// layout of our own: the master HTML is loaded as shipped and the only
// changes are the ones the kit README prescribes — text into span.sc-interp,
// the logo and QR into their boxes, shrink-to-fit on data-fit-* fields.
//
// Every output passes three gates before it leaves this file:
//   1. no text zone overflows its box (boxes are overflow:hidden, so a
//      clipped value looks fine on screen — scrollWidth is what reveals it);
//   2. every Poppins weight the text uses is actually loaded;
//   3. the QR decodes to exactly the agent's enrollment URL.

export type NopFormat = "preview" | "print" | "home" | "social"
export const NOP_DOWNLOAD_FORMATS = ["print", "home", "social"] as const

export interface NopAgentValues {
  /** From the locked roster record — never from anything the agent typed. */
  agentId: string
  displayName: string
  displayPhone: string
  displayEmail: string
}

export type NopRenderErrorCode = "field_too_long" | "fonts_not_loaded" | "qr_mismatch" | "master_invalid"

export class NopRenderError extends Error {
  constructor(public code: NopRenderErrorCode, message: string, public field?: string) {
    super(message)
  }
}

export interface NopRendered {
  body: Buffer
  contentType: "application/pdf" | "image/png"
  /** What the QR decoded to (already checked equal to the expected URL). */
  qr: string
  ms: number
}

// Geometry from the masters and field_map.json "conversion".
const TRIM = { x: 12, y: 12, w: 816, h: 1056 }
/** Digital design base width: the masters' layout, 845 wide instead of 816. */
const DIGITAL_BASE_W = 845
const SOCIAL = { w: 1080, h: 1350 }

/** The master with its @font-face URLs swapped for the same kit TTFs, inlined. Nothing else changes. */
function masterWithInlineFonts(id: NopTemplateId): string {
  const html = readMasterHtml(id)
  let swapped = 0
  const out = html.replace(/url\("\.\.\/fonts\/([A-Za-z0-9-]+\.ttf)"\)/g, (_m, file: string) => {
    swapped++
    return `url("data:font/ttf;base64,${readKitFileBase64(`fonts/${file}`)}")`
  })
  if (swapped === 0) throw new NopRenderError("master_invalid", `${id}: no @font-face found to inline`)
  return out
}

function textValues(content: KitContent, id: NopTemplateId, agent: NopAgentValues): Record<string, string> {
  return {
    agent_name: agent.displayName,
    agent_phone: agent.displayPhone,
    agent_email: agent.displayEmail,
    agent_id: agent.agentId,
    agent_slug: agent.agentId,
    enroll_domain: content.enroll_domain,
    version_stamp: versionStamp(content, id),
    ...priceValues(content, id),
  }
}

async function qrSvg(url: string): Promise<string> {
  // Q: survives ~25% damage (a fold, a scuff). Margin 0: qr_zone already
  // provides the 0.125in quiet zone around the 1.375in code.
  return QRCode.toString(url, { type: "svg", errorCorrectionLevel: "Q", margin: 0, color: { dark: "#000000", light: "#ffffff" } })
}

/** Puts the values, logo and QR into their zones. No sizing yet. */
async function inject(page: Page, values: Record<string, string>, logoB64: string, svg: string): Promise<void> {
  await page.evaluate(
    ({ values, logoB64, svg }) => {
      const missing: string[] = []
      for (const [field, value] of Object.entries(values)) {
        const slot = document.querySelector(`[data-var="${field}"] span.sc-interp`)
        if (!slot) {
          missing.push(field)
          continue
        }
        slot.textContent = value
      }
      if (missing.length) throw new Error(`master is missing span.sc-interp for: ${missing.join(", ")}`)

      // Logo: contain-fit; the zone itself is already right/middle aligned.
      const logoBox = document.querySelector('[data-var="agent_logo"]')
      if (!logoBox) throw new Error("master has no agent_logo zone")
      const img = document.createElement("img")
      img.src = `data:image/png;base64,${logoB64}`
      img.alt = ""
      img.style.cssText = "display:block;max-width:100%;max-height:100%;width:auto;height:auto;object-fit:contain"
      logoBox.appendChild(img)

      // QR fills its 1.375in box exactly.
      const qrBox = document.querySelector('[data-var="qr_code"]') as HTMLElement | null
      if (!qrBox) throw new Error("master has no qr_code zone")
      const holder = document.createElement("div")
      holder.innerHTML = svg
      const el = holder.firstElementChild as SVGElement
      el.setAttribute("width", "100%")
      el.setAttribute("height", "100%")
      el.setAttribute("shape-rendering", "crispEdges")
      el.style.cssText = "display:block;width:100%;height:100%;flex:none"
      qrBox.appendChild(el)
    },
    { values, logoB64, svg },
  )
}

/**
 * Shrink-to-fit, then the overflow check on every text zone. Run with
 * Poppins loaded: a fallback face has different widths. Returns the zones
 * still too wide (empty means every value fits unclipped).
 */
async function fitAndCheck(page: Page): Promise<string[]> {
  return page.evaluate(() => {
      // Shrink-to-fit: size the STYLED span (where the font lives) down
      // from base in 0.25px steps until the text fits the data-var box.
      for (const box of Array.from(document.querySelectorAll<HTMLElement>("[data-fit-base]"))) {
        const styled = box.querySelector<HTMLElement>(":scope > span")
        if (!styled) continue
        const base = Number(box.dataset.fitBase)
        const min = Number(box.dataset.fitMin)
        let size = base
        styled.style.fontSize = `${size}px`
        while (box.scrollWidth > box.clientWidth && size - 0.25 >= min - 1e-9) {
          size = Math.round((size - 0.25) * 100) / 100
          styled.style.fontSize = `${size}px`
        }
        if (box.scrollWidth > box.clientWidth && size > min) styled.style.fontSize = `${min}px`
      }

      // Every text zone, fitted or fixed-size: anything still wider than
      // its box would print clipped, and every field is single-line, so
      // text that wrapped onto a second line fails too. (Not a height
      // check: a line box can be taller than its zone with every glyph
      // still inside it.)
      const tooWide: string[] = []
      for (const slot of Array.from(document.querySelectorAll("[data-var] span.sc-interp"))) {
        const box = slot.closest<HTMLElement>("[data-var]")!
        if (!(slot.textContent ?? "").trim()) continue
        const range = document.createRange()
        range.selectNodeContents(slot)
        const lineTops = new Set(Array.from(range.getClientRects()).filter((r) => r.width > 0).map((r) => Math.round(r.top)))
        if (box.scrollWidth > box.clientWidth || lineTops.size > 1) tooWide.push(box.dataset.var!)
      }
      return tooWide
  })
}

/** Waits for fonts, then proves every weight/style the text uses is loaded. Throws otherwise. */
async function assertFonts(page: Page): Promise<string[]> {
  const result = await page.evaluate(async () => {
    const used = new Set<string>()
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (!(n.textContent ?? "").trim() || !n.parentElement) continue
      const cs = getComputedStyle(n.parentElement)
      if (cs.display === "none" || cs.visibility === "hidden") continue
      used.add(`${cs.fontStyle === "italic" ? "italic" : "normal"} ${cs.fontWeight}`)
    }
    const descriptors = [...used].map((u) => `${u} 16px "Poppins"`)
    await Promise.all(descriptors.map((d) => document.fonts.load(d)))
    await document.fonts.ready
    const failed = descriptors.filter((d) => !document.fonts.check(d))
    const faces: string[] = []
    document.fonts.forEach((f) => faces.push(`${f.family} ${f.style} ${f.weight} ${f.status}`))
    // No named inner functions in here: some bundlers wrap them in a helper
    // that doesn't exist inside the page.
    const loaded = new Set<string>()
    document.fonts.forEach((f) => {
      if (f.family.replace(/"/g, "") === "Poppins" && f.status === "loaded") loaded.add(`${f.style} ${f.weight}`)
    })
    const notLoaded = [...used].filter((u) => !loaded.has(u))
    return { used: [...used], failed, notLoaded, faces }
  })
  if (result.failed.length || result.notLoaded.length) {
    throw new NopRenderError(
      "fonts_not_loaded",
      `Poppins not loaded for ${[...result.failed, ...result.notLoaded].join("; ")} (faces: ${result.faces.join(", ")})`,
    )
  }
  return result.used
}

async function newPage(dsf: number): Promise<{ context: BrowserContext; page: Page }> {
  const browser = await getBrowser()
  const context = await browser.newContext({ viewport: { width: 1000, height: 1200 }, deviceScaleFactor: dsf })
  return { context, page: await context.newPage() }
}

/** Widens the layout to the digital design base (field_map "conversion"). Render-time only. */
async function toDigitalLayout(page: Page) {
  await page.evaluate((w) => {
    const root = document.querySelector<HTMLElement>("[data-template-id]")!
    const trim = document.querySelector<HTMLElement>('[data-trim="1"]')!
    root.style.width = `${w + 24}px`
    trim.style.width = `${w}px`
  }, DIGITAL_BASE_W)
}

/** Home print: an 8.5x11in page showing the trim only, content shifted up/left by the 0.125in bleed. */
async function toHomeLayout(page: Page) {
  await page.addStyleTag({
    content: `@page{size:8.5in 11in;margin:0}
html,body{margin:0;width:${TRIM.w}px;height:${TRIM.h}px;overflow:hidden}
[data-template-id]{transform:translate(-${TRIM.x}px,-${TRIM.y}px)}`,
  })
}

async function qrRegion(page: Page): Promise<{ x: number; y: number; width: number; height: number }> {
  const r = await page.locator('[data-var="qr_zone"]').boundingBox()
  if (!r) throw new NopRenderError("master_invalid", "qr_zone not found")
  const pad = 24
  return { x: Math.max(0, r.x - pad), y: Math.max(0, r.y - pad), width: r.width + pad * 2, height: r.height + pad * 2 }
}

function gate(decoded: string | null, expected: string) {
  if (decoded !== expected) throw new NopRenderError("qr_mismatch", `QR decoded to ${JSON.stringify(decoded)}, expected ${expected}`)
}

/**
 * Renders one template for one agent in one format. Throws NopRenderError
 * on any gate failure; never returns a file that failed one.
 */
export async function renderNopFlyer(id: NopTemplateId, agent: NopAgentValues, format: NopFormat): Promise<NopRendered> {
  const t0 = Date.now()
  const content = readKitContent()
  const expected = enrollUrl(content, agent.agentId)
  const dsf = format === "social" ? SOCIAL.w / DIGITAL_BASE_W : format === "preview" ? 1 : 2
  const { context, page } = await newPage(dsf)
  try {
    await page.setContent(masterWithInlineFonts(id), { waitUntil: "load" })
    if (format === "social") await toDigitalLayout(page)
    if (format === "home") await toHomeLayout(page)

    await inject(page, textValues(content, id, agent), readKitFileBase64(content.default_logo), await qrSvg(expected))
    await assertFonts(page)
    const tooWide = await fitAndCheck(page)
    if (tooWide.length) {
      throw new NopRenderError("field_too_long", `Too long to fit even at the minimum size: ${tooWide.join(", ")}`, tooWide[0])
    }
    await page.evaluate(() => Promise.all(Array.from(document.images).map((i) => i.decode().catch(() => undefined))))

    if (format === "preview" || format === "social") {
      const clip = format === "social"
        ? { x: TRIM.x, y: TRIM.y, width: DIGITAL_BASE_W, height: SOCIAL.h / dsf }
        : { x: TRIM.x, y: TRIM.y, width: TRIM.w, height: TRIM.h }
      const png = await page.screenshot({ type: "png", clip })
      const qr = decodeQrFromPng(png)
      gate(qr, expected)
      return { body: png, contentType: "image/png", qr: qr!, ms: Date.now() - t0 }
    }

    // PDFs: decode the QR from the exact page state being printed (print
    // media, same DOM, same layout), then print it.
    await page.emulateMedia({ media: "print" })
    const shot = await page.screenshot({ type: "png", clip: await qrRegion(page) })
    const qr = decodeQrFromPng(shot)
    gate(qr, expected)
    const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true })
    const pages = (pdf.toString("latin1").match(/\/Type\s*\/Page[^s]/g) ?? []).length
    if (pages !== 1) throw new NopRenderError("master_invalid", `${format} PDF has ${pages} pages, expected 1`)
    return { body: pdf, contentType: "application/pdf", qr: qr!, ms: Date.now() - t0 }
  } finally {
    await context.close()
  }
}

/**
 * The untouched master as a PNG — for comparing against the kit's own
 * reference renders (png_300dpi/ at dsf 3.125, digital/ via layout "digital").
 * Not used to serve agents.
 */
export async function renderBlankMaster(id: NopTemplateId, layout: "print" | "digital", dsf: number): Promise<{ png: Buffer; usedFonts: string[] }> {
  const { context, page } = await newPage(dsf)
  try {
    await page.setContent(masterWithInlineFonts(id), { waitUntil: "load" })
    if (layout === "digital") await toDigitalLayout(page)
    const usedFonts = await assertFonts(page)
    const clip = layout === "digital"
      ? { x: TRIM.x, y: TRIM.y, width: DIGITAL_BASE_W, height: SOCIAL.h / dsf }
      : { x: 0, y: 0, width: TRIM.w + TRIM.x * 2, height: TRIM.h + TRIM.y * 2 }
    return { png: await page.screenshot({ type: "png", clip }), usedFonts }
  } finally {
    await context.close()
  }
}

export interface MasterLayout {
  png: Buffer
  /** data-var zone boxes, in output pixels relative to the output's top-left. */
  zones: Record<string, { x: number; y: number; width: number; height: number }>
  /** One box per rendered line fragment of locked text, output pixels. */
  lines: { text: string; x: number; y: number; width: number; height: number }[]
}

/**
 * The blank master in the digital layout plus where every zone and text
 * line landed — for checking the social format against field_map.json and
 * the kit's digital/ reference. Not used to serve agents.
 */
export async function measureDigitalLayout(id: NopTemplateId): Promise<MasterLayout> {
  const dsf = SOCIAL.w / DIGITAL_BASE_W
  const { context, page } = await newPage(dsf)
  try {
    await page.setContent(masterWithInlineFonts(id), { waitUntil: "load" })
    await toDigitalLayout(page)
    await assertFonts(page)
    const clip = { x: TRIM.x, y: TRIM.y, width: DIGITAL_BASE_W, height: SOCIAL.h / dsf }
    const png = await page.screenshot({ type: "png", clip })
    const measured = await page.evaluate(
      ({ ox, oy, k }) => {
        const zones: Record<string, { x: number; y: number; width: number; height: number }> = {}
        for (const el of Array.from(document.querySelectorAll<HTMLElement>("[data-var]"))) {
          const r = el.getBoundingClientRect()
          zones[el.dataset.var!] = { x: (r.x - ox) * k, y: (r.y - oy) * k, width: r.width * k, height: r.height * k }
        }
        const lines: { text: string; x: number; y: number; width: number; height: number }[] = []
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
        for (let n = walker.nextNode(); n; n = walker.nextNode()) {
          const text = (n.textContent ?? "").trim()
          if (!text || !n.parentElement || getComputedStyle(n.parentElement).visibility === "hidden") continue
          // Only the visible characters: a box that includes the spaces
          // around a short token ("·") picks up the neighbouring glyphs.
          const raw = n.textContent ?? ""
          const start = raw.length - raw.trimStart().length
          const range = document.createRange()
          range.setStart(n, start)
          range.setEnd(n, start + raw.trim().length)
          for (const r of Array.from(range.getClientRects())) {
            if (r.width < 1 || r.height < 1) continue
            lines.push({ text: text.slice(0, 40), x: (r.x - ox) * k, y: (r.y - oy) * k, width: r.width * k, height: r.height * k })
          }
        }
        return { zones, lines }
      },
      { ox: TRIM.x, oy: TRIM.y, k: dsf },
    )
    return { png, ...measured }
  } finally {
    await context.close()
  }
}
