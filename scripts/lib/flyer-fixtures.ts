/**
 * Shared fixtures for the template stress test and the flyer contrast audit:
 * the content cases, the production font faces, and the exact chain a
 * template flyer goes through before it is stored and viewed.
 */
import fs from "node:fs"
import path from "node:path"
import QRCode from "qrcode"
import sharp from "sharp"
import type { FlyerTemplate } from "../../lib/agent-pipeline/templates"
import { fillTemplate } from "../../lib/agent-pipeline/template-mode"
import {
  LOGO_PLACEHOLDER,
  enforceBoundedContent,
  enforceCtaOwnRow,
  enforceSingleBottomAnchor,
  ensurePageSize,
  ensureScrollable,
  injectPhotoAttribution,
  substituteQr,
} from "../../lib/agent-pipeline/flyer-html"
import { applyLegibilityGuardrails } from "../../lib/agent-pipeline/legibility"
import { getFormat } from "../../lib/agent-pipeline/formats"


/** A real, hotlinked stock photo of the kind the pipeline sources. */
export const STRESS_PHOTO = "https://images.unsplash.com/photo-1635424824849-1b09bdcc55b1?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1080"

export interface Content {
  headline: string
  supporting: string
  businessName: string
  phone: string
  address: string | null
  hasLogo: boolean
}

// Test fixtures only — invented business details, never shipped. No claims,
// ratings or testimonials: just text of the right shape and length.
export const CONTENT: Record<"min" | "max", Content> = {
  // Short headline, one-line offer, no subhead, no address, no logo.
  min: { headline: "Roof sale", supporting: "$500 off.", businessName: "Ace", phone: "555-0142", address: null, hasLogo: false },
  // Every slot at or past its limit, with long words that resist wrapping.
  max: {
    headline: "Architectural Shingle Replacements Professionally Installed Before Winter Weather",
    supporting:
      "Includes tear-off, synthetic underlayment, ice-and-water shield, ridge ventilation, drip edge, flashing replacement, magnetic nail sweep and full debris haul-away, scheduled around your calendar.",
    businessName: "Commonwealth Roofing, Restoration & Exterior Contractors of Bowling Green LLC",
    phone: "(270) 555-0142 ext. 2201",
    address: "12345 Russellville Road, Suite 400 (entrance behind Commonwealth Plaza), Bowling Green, Kentucky 42101",
    hasLogo: true,
  },
}

export const PALETTE = { primary: "#12314f", secondary: "#e8edf2", accent: "#e39a2b" }

/* -------------------------- Production font faces ------------------------- */

const FONT_DIR = path.join(process.cwd(), "lib/pdf/fonts")
const PROD_FACES: [string, string, string][] = [
  // family named by a flyer, file, weight range
  ...["Helvetica Neue", "Helvetica", "Arial", "Trebuchet MS", "Segoe UI", "Verdana", "Tahoma"].map((f) => [f, "Arimo.ttf", "100 900"] as [string, string, string]),
  ["Arial Black", "ArchivoBlack-Regular.ttf", "100 900"],
  ["Impact", "ArchivoBlack-Regular.ttf", "100 900"],
  ...["Georgia", "Times New Roman", "Times", "Palatino Linotype", "Palatino", "Garamond"].map((f) => [f, "Gelasio.ttf", "100 900"] as [string, string, string]),
  ["Courier New", "Cousine-Regular.ttf", "100 500"],
  ["Courier New", "Cousine-Bold.ttf", "600 900"],
  ["Courier", "Cousine-Regular.ttf", "100 500"],
  ["Courier", "Cousine-Bold.ttf", "600 900"],
]
const fontData = new Map<string, string>()
export function productionFontCss(): string {
  return PROD_FACES.map(([family, file, weight]) => {
    if (!fontData.has(file)) fontData.set(file, fs.readFileSync(path.join(FONT_DIR, file)).toString("base64"))
    return `@font-face{font-family:'${family}';src:url(data:font/ttf;base64,${fontData.get(file)}) format('truetype');font-weight:${weight}}`
  }).join("")
}

/* ------------------------------ Build a flyer ----------------------------- */

export async function assets() {
  const logoSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="160"><rect width="640" height="160" rx="18" fill="#ffffff"/><text x="320" y="104" font-family="Arial" font-size="72" font-weight="700" text-anchor="middle" fill="#12314f">LOGO</text></svg>`
  const logo = `data:image/png;base64,${(await sharp(Buffer.from(logoSvg)).png().toBuffer()).toString("base64")}`
  const qr = await QRCode.toDataURL("https://oneflyer.org/r/STRESS01", { margin: 1, width: 240 })
  return { logo, qr }
}

/** The same chain a template flyer goes through before it is stored and viewed (pipeline.ts applyLegibility + obligations + view route). */
export function buildStoredHtml(
  template: FlyerTemplate,
  formatId: string,
  c: Content,
  photo: string | null,
  fonts: { heading: string; body: string },
  a: { logo: string; qr: string },
  colors: { primary: string; secondary: string; accent: string } = PALETTE,
): string {
  let html = fillTemplate({
    template,
    headline: c.headline,
    supporting: c.supporting,
    businessName: c.businessName,
    phone: c.phone,
    address: c.address,
    hasLogo: c.hasLogo,
    hasQr: true,
    photoUrl: photo,
    colors,
    fonts,
  }).html
  html = enforceCtaOwnRow(html).html
  html = enforceBoundedContent(html).html
  html = enforceSingleBottomAnchor(html).html
  html = applyLegibilityGuardrails(html).html
  if (photo) html = injectPhotoAttribution(html, [{ url: photo, photographerName: "Raze Solar", photographerUrl: "https://unsplash.com/@razesolar" }], getFormat(formatId).medium)
  html = substituteQr(html, a.qr)
  // substituteLogo only accepts https (real logos are /api/photos URLs); a
  // data URL renders identically and keeps the harness offline-safe.
  html = html.split(LOGO_PLACEHOLDER).join(a.logo)
  return ensurePageSize(ensureScrollable(html))
}


export function canvasOf(html: string): { w: number; h: number } {
  const m = html.match(/html,body\{width:(\d+)px;height:(\d+)px\}/)
  return m ? { w: +m[1], h: +m[2] } : { w: 850, h: 1100 }
}
