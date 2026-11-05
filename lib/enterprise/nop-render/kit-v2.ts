import fs from "node:fs"
import path from "node:path"

// Basic Benefits' final NOP flyers (kit v2): 3 packages x English/Spanish x
// price/no-price, each as a US Letter page and a print-shop page with 0.125in
// bleed. Read-only, exactly as supplied (see enterprise/nop/kit-v2/KIT.md).
//
// The renderer changes nothing in a page's <body>. It adds two things to
// <head>: a <base> tag so the page's own relative links (stylesheets, fonts,
// logo) resolve, and ACCENT_METRICS below. It serves those files from this
// folder; anything the kit doesn't contain (Opificio, unused Poppins weights,
// any network address) is refused.

export const KIT_V2_DIR = path.join(process.cwd(), "enterprise", "nop", "kit-v2")
const HTML_DIR = path.join(KIT_V2_DIR, "html")

/** A made-up origin the renderer intercepts. Never reaches a network. */
export const KIT_V2_ORIGIN = "https://nop-kit-v2.invalid"

import { NOP_V2_TEMPLATES, type NopV2Id, type NopV2Lang, type NopV2Pkg, type NopV2Pricing } from "./kit-v2-ids"
export { NOP_V2_TEMPLATES, NOP_V2_PACKAGES, NOP_V2_LANGS, NOP_V2_PRICING } from "./kit-v2-ids"
export type { NopV2Id, NopV2Lang, NopV2Pkg, NopV2Pricing } from "./kit-v2-ids"
export type NopV2Size = "letter" | "bleed"

/** Package names as they appear in Basic Benefits' file names. */
const FILE_NAME: Record<NopV2Pkg, string> = {
  P1: "Everyday-Care",
  P2: "Complete-Virtual-Care",
  P3: "Health-Weight-Management",
}

export function isNopV2Template(v: string): v is NopV2Id {
  return (NOP_V2_TEMPLATES as string[]).includes(v)
}

export function v2Parts(id: NopV2Id): { pkg: NopV2Pkg; lang: NopV2Lang; pricing: NopV2Pricing } {
  const [, pkg, lang, pricing] = id.split("_") as [string, NopV2Pkg, NopV2Lang, NopV2Pricing]
  return { pkg, lang, pricing }
}

/** "NOP-P1-Everyday-Care-EN-Price-bleed.html" */
export function v2FileName(id: NopV2Id, size: NopV2Size): string {
  const { pkg, lang, pricing } = v2Parts(id)
  return `NOP-${pkg}-${FILE_NAME[pkg]}-${lang}-${pricing === "PRICE" ? "Price" : "NoPrice"}${size === "bleed" ? "-bleed" : ""}.html`
}

/** The page exactly as Basic Benefits supplied it. */
export function readV2Html(id: NopV2Id, size: NopV2Size): string {
  return fs.readFileSync(path.join(HTML_DIR, v2FileName(id, size)), "utf8")
}

const DS_FONTS = "_ds/basic-benefits-design-system-65e9c885-f032-4927-be79-6ba6a48cd125/assets/fonts"

/**
 * Prices and the numbered steps use the accent font (Opificio Rounded) at
 * weight 800. Opificio has no digits or "$", so in Basic Benefits' PDFs those
 * glyphs are Poppins ExtraBold, but the line is laid out with Opificio's
 * vertical metrics (ascent 700, descent 198, line gap 49 per 1000). Opificio
 * isn't shipped, so this face is Poppins ExtraBold carrying those three
 * metrics: same glyphs, same line position as the approved PDFs.
 */
export const ACCENT_METRICS = `<style>@font-face{font-family:'Opificio Rounded';src:url('${DS_FONTS}/Poppins-ExtraBold.ttf') format('truetype');font-weight:800;font-style:normal;ascent-override:70%;descent-override:19.8%;line-gap-override:4.9%;unicode-range:U+0020}</style>`

/** The page with a <base> tag and ACCENT_METRICS added to <head>. The <body> is untouched. */
export function v2HtmlForRender(id: NopV2Id, size: NopV2Size): string {
  const html = readV2Html(id, size)
  const head = /<head[^>]*>/i.exec(html)
  if (!head) throw new Error(`${v2FileName(id, size)} has no <head>`)
  const at = head.index + head[0].length
  return `${html.slice(0, at)}<base href="${KIT_V2_ORIGIN}/">${ACCENT_METRICS}${html.slice(at)}`
}

/** The <body> element's markup, for proving a render leaves it as supplied. */
export function bodyOf(html: string): string {
  const m = /<body[\s\S]*<\/body>/i.exec(html)
  if (!m) throw new Error("no <body>")
  return m[0]
}

/**
 * The kit file a request for KIT_V2_ORIGIN/... maps to, or null. Only files
 * inside the kit's html/ folder; never anything outside it.
 */
export function kitV2FileFor(url: string): string | null {
  if (!url.startsWith(`${KIT_V2_ORIGIN}/`)) return null
  const rel = decodeURIComponent(new URL(url).pathname).replace(/^\/+/, "")
  const file = path.normalize(path.join(HTML_DIR, rel))
  if (!file.startsWith(HTML_DIR + path.sep)) return null
  return fs.existsSync(file) && fs.statSync(file).isFile() ? file : null
}

/** Basic Benefits' preview image, used as the card image. */
export function readV2Preview(id: NopV2Id): Buffer {
  return fs.readFileSync(path.join(KIT_V2_DIR, "previews", v2FileName(id, "letter").replace(/\.html$/, ".png")))
}

/** Physical page size in PDF points: Letter 612x792, bleed 630x810 (8.75 x 11.25 in). */
export const V2_PAGE_POINTS: Record<NopV2Size, { w: number; h: number }> = {
  letter: { w: 612, h: 792 },
  bleed: { w: 630, h: 810 },
}
