import fs from "node:fs"
import path from "node:path"
import type { Page } from "playwright-core"
import { assertFonts, checkedQrLink, gate, newPage, NopRenderError, qrSvg } from "./render"
import { KIT_V2_ORIGIN, V2_PAGE_POINTS, kitV2FileFor, readV2Html, v2HtmlForRender, v2Parts, type NopV2Id, type NopV2Size } from "./kit-v2"
import { agentAreaHtml } from "./agent-area"
import { assertOnlyFooterChanged, placeAgentAreaInFooter } from "./footer-placement"
import { decodeQrFromPng } from "./qr-gate"
import { qrDestinationFor } from "@/lib/enterprise/nop-roster"
import { getEnrollDomain } from "@/lib/enterprise/nop-enroll-domain"

// Renders a kit-v2 page. renderNopV2 is the page exactly as Basic Benefits
// supplied it (admin checks). renderNopV2ForAgent adds the agent area in the
// footer (Basic Benefits' approved placement) and is the only way an agent's
// kit-v2 flyer is made. The agent area takes exactly four values, none typed
// by the agent: name and phone from the roster-locked profile, the enrollment
// URL from the Agent ID, and the QR from the agent's code.

export type NopV2Output = "pdf" | "preview" | "thumb"

export interface NopV2Rendered {
  body: Buffer
  contentType: string
  /** The PDF's page size in points, read back from the file. Null for images. */
  pagePoints: { w: number; h: number } | null
  usedFonts: string[]
  ms: number
}

const TYPES: Record<string, string> = { ".css": "text/css", ".ttf": "font/ttf", ".png": "image/png", ".svg": "image/svg+xml" }

/** The PDF's /MediaBox, in points. */
export function pdfPagePoints(pdf: Buffer): { w: number; h: number } | null {
  const m = /\/MediaBox\s*\[\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\]/.exec(pdf.toString("latin1"))
  return m ? { w: Number(m[3]) - Number(m[1]), h: Number(m[4]) - Number(m[2]) } : null
}

export async function renderNopV2(id: NopV2Id, size: NopV2Size, output: NopV2Output): Promise<NopV2Rendered> {
  return renderV2Page(id, size, v2HtmlForRender(id, size), output, output === "thumb" ? 0.75 : output === "preview" ? 1 : 2)
}

/**
 * Loads the page, proves its fonts, runs `check` on the laid-out page (the
 * agent gates), then returns the requested output. Nothing is returned if a
 * check throws.
 */
async function renderV2Page(id: NopV2Id, size: NopV2Size, html: string, output: NopV2Output, dsf: number, check?: (page: Page) => Promise<void>): Promise<NopV2Rendered> {
  const t0 = Date.now()
  const { page, close } = await newPage(dsf)
  try {
    // The kit's own files only. Anything else is refused, so nothing outside
    // the kit (no network, no Opificio) can change what renders.
    await page.route("**/*", async (route) => {
      const url = route.request().url()
      if (url.startsWith("data:")) return route.continue()
      const file = kitV2FileFor(url)
      if (!file) return route.fulfill({ status: 404, body: "" })
      return route.fulfill({ status: 200, contentType: TYPES[path.extname(file)] ?? "application/octet-stream", body: fs.readFileSync(file) })
    })
    await page.goto(`${KIT_V2_ORIGIN}/__blank`).catch(() => undefined)
    await page.setContent(html, { waitUntil: "load" })
    const usedFonts = await assertFonts(page)
    if (check) {
      // The agent gates measure the page as it prints.
      await page.emulateMedia({ media: "print" })
      await check(page)
    }

    if (output !== "pdf") {
      const box = await page.locator(".page").first().boundingBox()
      if (!box) throw new NopRenderError("master_invalid", `${id}: no .page element`)
      // Agent thumbnails are taken at CSS size: the card shows them small, and the gate already read the QR at full scale.
      const scale = check && output === "thumb" ? { scale: "css" as const } : {}
      const body = await page.screenshot({ type: output === "thumb" ? "jpeg" : "png", ...(output === "thumb" ? { quality: 82 } : {}), clip: box, ...scale })
      return { body, contentType: output === "thumb" ? "image/jpeg" : "image/png", pagePoints: null, usedFonts, ms: Date.now() - t0 }
    }

    const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true })
    const pages = (pdf.toString("latin1").match(/\/Type\s*\/Page[^s]/g) ?? []).length
    if (pages !== 1) throw new NopRenderError("master_invalid", `${id} ${size} PDF has ${pages} pages, expected 1`)
    const pagePoints = pdfPagePoints(pdf)
    const want = V2_PAGE_POINTS[size]
    if (!pagePoints || Math.abs(pagePoints.w - want.w) > 0.5 || Math.abs(pagePoints.h - want.h) > 0.5) {
      throw new NopRenderError("master_invalid", `${id} ${size} PDF is ${pagePoints?.w}x${pagePoints?.h}pt, expected ${want.w}x${want.h}pt`)
    }
    return { body: pdf, contentType: "application/pdf", pagePoints, usedFonts, ms: Date.now() - t0 }
  } finally {
    await close()
  }
}

/** 150 dpi: the agent renders are laid out, and the QR read, at the lowest resolution a flyer is expected to print at. */
export const V2_AGENT_DSF = 150 / 96

export interface NopV2AgentValues {
  /** From the locked roster record and profile, never from anything the agent typed. */
  agentId: string
  displayName: string
  displayPhone: string
}

export interface NopV2AgentRendered extends NopV2Rendered {
  /** What the QR decoded to (already checked equal to the agent's code link). */
  qr: string
  fit: NopV2Fit
}

/** Measured on the laid-out page, in CSS px (96 per inch). */
export interface NopV2Fit {
  /** How much taller <main>'s content could grow before the footer leaves the page. */
  footerMargin: number
  /** The smallest vertical space between <main>'s blocks, including below the header and above the footer. */
  minGap: number
}

/** The page markup with the agent area in the footer, after the locked-sections check. */
export async function v2AgentHtml(id: NopV2Id, size: NopV2Size, agent: NopV2AgentValues, qrLink: string, enrollment: string): Promise<string> {
  const src = readV2Html(id, size)
  const area = agentAreaHtml({ name: agent.displayName, phone: agent.displayPhone, enrollUrl: enrollment, qrSvg: await qrSvg(qrLink) })
  const { pkg, lang } = v2Parts(id)
  let placed: string
  try {
    placed = placeAgentAreaInFooter(src, pkg, lang, area)
    assertOnlyFooterChanged(src, placed, pkg, lang)
  } catch (err) {
    throw new NopRenderError("master_invalid", `${id} ${size}: ${err instanceof Error ? err.message : err}`)
  }
  return placed
}

/**
 * Layout gates on the laid-out page: each agent value sits on one line inside
 * the agent area, clear of Basic Benefits' footer text and of the QR box; the
 * footer still ends at the bottom of the page; <main> (with P2/P3's tighter
 * spacing) still holds all its content; and the link printed and linked is
 * exactly the agent's enrollment URL.
 */
async function checkAgentLayout(page: Page, enrollment: string): Promise<NopV2Fit> {
  // No named functions inside evaluate: some bundlers wrap them in a helper
  // that doesn't exist inside the page.
  const r = await page.evaluate(() => {
    const footer = document.querySelector("footer")
    const els: Record<string, Element | null> = {
      page: document.querySelector("section.page"),
      footer,
      left: footer?.firstElementChild ?? null,
      area: document.querySelector("[data-agent-area]"),
      qr: document.querySelector('[data-agent-field="qr"]'),
    }
    const boxes: Record<string, { left: number; right: number; top: number; bottom: number; width: number; height: number } | null> = {}
    for (const [k, el] of Object.entries(els)) {
      const b = el?.getBoundingClientRect()
      boxes[k] = b ? { left: b.left, right: b.right, top: b.top, bottom: b.bottom, width: b.width, height: b.height } : null
    }
    const main = document.querySelector("main")
    const mainBox = main?.getBoundingClientRect()
    const mainCss = main ? getComputedStyle(main) : null
    const blocks = main ? Array.from(main.children).map((k) => { const b = k.getBoundingClientRect(); return { top: b.top, bottom: b.bottom, height: b.height } }) : []
    const pageEl = els.page
    const link = document.querySelector('[data-agent-field="enroll_link"]')
    const fields = ["enroll_link", "name", "phone"].map((f) => {
      const el = document.querySelector(`[data-agent-field="${f}"]`)
      if (!el) return { f, b: null, lines: 0 }
      const range = document.createRange()
      range.selectNodeContents(el)
      const lines = new Set(Array.from(range.getClientRects()).filter((x) => x.width > 0).map((x) => Math.round(x.top))).size
      const b = el.getBoundingClientRect()
      return { f, b: { left: b.left, right: b.right, top: b.top, bottom: b.bottom }, lines }
    })
    return {
      box: boxes,
      main: main ? { scroll: main.scrollHeight, client: main.clientHeight } : null,
      fit: mainBox && mainCss && blocks.length ? {
        need: blocks.reduce((a, b) => a + b.height, 0) + parseFloat(mainCss.rowGap) * (blocks.length - 1) + parseFloat(mainCss.paddingTop) + parseFloat(mainCss.paddingBottom),
        height: mainBox.height,
        gaps: [blocks[0].top - mainBox.top, ...blocks.slice(1).map((b, i) => b.top - blocks[i].bottom), mainBox.bottom - blocks[blocks.length - 1].bottom],
      } : null,
      pageScroll: pageEl ? { scroll: pageEl.scrollHeight, client: pageEl.clientHeight } : null,
      href: link?.getAttribute("href") ?? null, linkText: link?.textContent ?? null, fields,
    }
  })
  const fail = (code: "field_too_long" | "master_invalid", msg: string, field?: string) => {
    throw new NopRenderError(code, msg, field)
  }
  const { page: pg, footer, left, area, qr } = r.box
  if (!pg || !footer || !left || !area || !qr || !r.main || !r.pageScroll) fail("master_invalid", "agent area or page structure not found")
  if (r.href !== enrollment || r.linkText !== enrollment.replace(/^https?:\/\//, "").replace(/\/$/, "")) fail("master_invalid", `enrollment link is ${r.href} / ${r.linkText}, expected ${enrollment}`)
  for (const { f, b, lines } of r.fields) {
    const field = f === "name" ? "agent_name" : f === "phone" ? "agent_phone" : "enroll_link"
    const code = field === "enroll_link" ? "master_invalid" : "field_too_long"
    if (!b || lines !== 1) fail(code, `${field} is on ${lines} lines`, field)
    // Clear of the footer's own text column and of the QR box, inside the footer band.
    if (b!.left < left!.right + 8 || b!.right > qr!.left - 8 || b!.top < footer!.top || b!.bottom > footer!.bottom) fail(code, `${field} doesn't fit beside the QR`, field)
  }
  if (Math.abs(qr!.width - 0.9 * 96) > 0.5 || Math.abs(qr!.height - 0.9 * 96) > 0.5) fail("master_invalid", `QR box is ${qr!.width}x${qr!.height}px, expected 0.9in`)
  if (qr!.right > footer!.right || qr!.top < footer!.top || qr!.bottom > footer!.bottom) fail("master_invalid", "QR box is outside the footer")
  if (Math.abs(footer!.bottom - pg!.bottom) > 0.5) fail("master_invalid", `footer ends ${Math.abs(footer!.bottom - pg!.bottom)}px ${footer!.bottom > pg!.bottom ? "below" : "above"} the page bottom`)
  if (r.main!.scroll > r.main!.client + 0.5) fail("master_invalid", `main content overflows by ${r.main!.scroll - r.main!.client}px`)
  if (r.pageScroll!.scroll > r.pageScroll!.client + 0.5) fail("master_invalid", `page content overflows by ${r.pageScroll!.scroll - r.pageScroll!.client}px`)
  if (!r.fit) fail("master_invalid", "<main> blocks not found")
  return { footerMargin: r.fit!.height - r.fit!.need, minGap: Math.min(...r.fit!.gaps) }
}

/** Reads the QR from the page as laid out (at V2_AGENT_DSF) and checks it is exactly `expected`. */
async function checkAgentQr(page: Page, expected: string): Promise<string> {
  const b = await page.locator('[data-agent-field="qr"]').boundingBox()
  if (!b) throw new NopRenderError("master_invalid", "QR box not found")
  // The white box is the quiet zone; a few px of footer around it is fine for the reader.
  const pad = 4
  const qr = decodeQrFromPng(await page.screenshot({ type: "png", clip: { x: b.x - pad, y: b.y - pad, width: b.width + 2 * pad, height: b.height + 2 * pad } }))
  gate(qr, expected)
  return qr!
}

/**
 * One kit-v2 flyer for one agent. Release checks, all before anything is returned:
 *   - the agent's code link maps back to this Agent ID and forwards to exactly
 *     their enrollment URL (checkedQrLink, the same check as kit v1.1.1);
 *   - outside the footer (and P2/P3's <main> spacing) the markup is
 *     byte-for-byte as supplied;
 *   - the layout gates above, and fonts;
 *   - the QR read back from the page at 150 dpi is exactly the code link;
 *   - PDFs: one page, at Letter or bleed size as asked.
 */
export async function renderNopV2ForAgent(id: NopV2Id, size: NopV2Size, agent: NopV2AgentValues, output: NopV2Output): Promise<NopV2AgentRendered> {
  // One read of the enrollment domain setting: the printed link and the QR's forward can't disagree.
  const domain = await getEnrollDomain()
  const enrollment = qrDestinationFor(agent.agentId, domain)
  const expected = await checkedQrLink(agent.agentId, enrollment, domain)
  return renderNopV2WithAgentArea(id, size, agent, enrollment, expected, output)
}

/**
 * The page with the agent area and every check after the code-link lookup:
 * locked sections, layout gates, fonts, QR read-back, PDF size. Agents only
 * reach it through renderNopV2ForAgent; the kit-v2 release check
 * (kit-v2-release.ts) calls it with fixed test values.
 */
export async function renderNopV2WithAgentArea(id: NopV2Id, size: NopV2Size, agent: NopV2AgentValues, enrollment: string, expected: string, output: NopV2Output): Promise<NopV2AgentRendered> {
  const html = v2HtmlForRender(id, size, await v2AgentHtml(id, size, agent, expected, enrollment))
  let qr = ""
  let fit: NopV2Fit = { footerMargin: 0, minGap: 0 }
  const rendered = await renderV2Page(id, size, html, output, V2_AGENT_DSF, async (page) => {
    fit = await checkAgentLayout(page, enrollment)
    qr = await checkAgentQr(page, expected)
  })
  return { ...rendered, qr, fit }
}
