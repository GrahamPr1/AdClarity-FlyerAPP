import fs from "node:fs"
import path from "node:path"
import { assertFonts, newPage, NopRenderError } from "./render"
import { KIT_V2_ORIGIN, V2_PAGE_POINTS, kitV2FileFor, v2HtmlForRender, type NopV2Id, type NopV2Size } from "./kit-v2"

// Renders a kit-v2 page as Basic Benefits supplied it. The agent information
// area isn't placed yet (Basic Benefits are choosing where it goes), so this
// takes no agent values at all: nothing an agent provides can reach the page.

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
  const t0 = Date.now()
  const { page, close } = await newPage(output === "thumb" ? 0.75 : output === "preview" ? 1 : 2)
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
    await page.setContent(v2HtmlForRender(id, size), { waitUntil: "load" })
    const usedFonts = await assertFonts(page)

    if (output !== "pdf") {
      const box = await page.locator(".page").first().boundingBox()
      if (!box) throw new NopRenderError("master_invalid", `${id}: no .page element`)
      const body = await page.screenshot({ type: output === "thumb" ? "jpeg" : "png", ...(output === "thumb" ? { quality: 82 } : {}), clip: box })
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
