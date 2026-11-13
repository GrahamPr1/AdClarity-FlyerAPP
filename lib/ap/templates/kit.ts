import fs from "node:fs"
import path from "node:path"
import { createHash } from "node:crypto"
import type { Layout } from "./slots"
import type { Size } from "./content"

// The platform's copy of the kit-v2 design (enterprise/ap/kit-v2, built by
// scripts/ap-build-templates.py from NOP's kit, which is never read at run
// time). Pure string work: filling a template, the spacing variants, and the
// hash of everything outside the footer.

export const AP_KIT_DIR = path.join(process.cwd(), "enterprise", "ap", "kit-v2")
const TEMPLATE_DIR = path.join(AP_KIT_DIR, "templates")

/** A made-up origin the renderer intercepts. Never reaches a network. */
export const AP_KIT_ORIGIN = "https://ap-kit.invalid"

export const PAGE: Record<Size, { w: string; h: string; bleed: string; points: { w: number; h: number } }> = {
  letter: { w: "8.5in", h: "11in", bleed: "0px", points: { w: 612, h: 792 } },
  bleed: { w: "8.75in", h: "11.25in", bleed: "0.125in", points: { w: 630, h: 810 } },
}

const cache = new Map<Layout, string>()
export function readTemplate(layout: Layout): string {
  let t = cache.get(layout)
  if (!t) cache.set(layout, (t = fs.readFileSync(path.join(TEMPLATE_DIR, `${layout}.html`), "utf8")))
  return t
}

/** For text content: & < > only (quotes are plain text there, as in the kit's own pages). */
export function escText(v: string): string {
  return v.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!)
}

/** For attribute values. */
export function esc(v: string): string {
  return v.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!)
}

export interface FillInput {
  layout: Layout
  lang: string
  size: Size
  showPrice: boolean
  title: string
  screenLabel: string
  logoHtml: string
  /** Every content slot plus footer.programLine, footer.taglineLine, footer.versionStamp. */
  slots: Record<string, string>
}

/** The template with every placeholder filled except {{agent_area}}. Throws on any slot left unfilled. */
export function fillTemplate(f: FillInput): string {
  const page = PAGE[f.size]
  let html = readTemplate(f.layout)
    .replace("{{lang}}", esc(f.lang))
    .replace("{{title}}", esc(f.title))
    .replaceAll("{{page_w}}", page.w)
    .replaceAll("{{page_h}}", page.h)
    .replace("{{bleed}}", page.bleed)
    .replace("{{price_display}}", f.showPrice ? "flex" : "none")
    .replace("{{screen_label}}", esc(f.screenLabel))
    .replace("{{logo}}", f.logoHtml)
  html = html.replace(/\{\{slot:([A-Za-z0-9.]+)\}\}/g, (_m, key: string) => {
    const v = f.slots[key]
    if (typeof v !== "string") throw new Error(`slot ${key} has no value`)
    return escText(v)
  })
  if (/\{\{(?!agent_area\}\})/.test(html)) throw new Error("template has an unfilled placeholder")
  return html
}

// ---- Spacing (copied from NOP's approved footer placement, footer-placement.ts SPACING) ----

export interface SpacingEdit {
  from: string
  to: string
  count: number
  what: string
}
const MAIN = (top: number, bottom: number, gap: number) => `padding:${top}px calc(48px + var(--bleed, 0px)) ${bottom}px;display:flex;flex-direction:column;gap:${gap}px;`
const P1_P3_MAIN = MAIN(22, 18, 16)

/**
 * The spacing variants each layout may use with the taller agent footer, in
 * order of preference. P1 uses Basic Benefits' own spacing when the content
 * fits it, else NOP's approved tighter (Spanish) spacing; P2 and P3 always
 * use their approved spacing. The renderer picks the first that passes the
 * page gates, and an approved version records the one it used.
 */
export const SPACING: Record<Layout, { name: string; edits: SpacingEdit[] }[]> = {
  P1: [
    { name: "supplied", edits: [] },
    {
      name: "tight",
      edits: [
        { from: P1_P3_MAIN, to: MAIN(14, 12, 11), count: 1, what: "<main> spacing" },
        { from: "padding:16px 16px 18px;", to: "padding:12px 16px 14px;", count: 3, what: "benefit card padding" },
      ],
    },
  ],
  P2: [
    {
      name: "approved",
      edits: [
        { from: MAIN(16, 12, 10), to: MAIN(9, 8, 8), count: 1, what: "<main> spacing" },
        { from: "padding:12px 18px 14px;", to: "padding:9px 18px 11px;", count: 4, what: "benefit card padding" },
        { from: "padding:12px 18px;", to: "padding:9px 18px;", count: 1, what: "wide card padding" },
      ],
    },
  ],
  P3: [
    {
      name: "approved",
      edits: [
        { from: P1_P3_MAIN, to: MAIN(16, 12, 12), count: 1, what: "<main> spacing" },
        { from: "padding:16px 18px 18px;", to: "padding:13px 18px 15px;", count: 2, what: "benefit card padding" },
        { from: "padding:16px 20px;", to: "padding:13px 20px;", count: 1, what: "wide card padding" },
      ],
    },
  ],
}

export function applySpacing(html: string, layout: Layout, name: string): string {
  const variant = SPACING[layout].find((s) => s.name === name)
  if (!variant) throw new Error(`${layout} has no spacing ${name}`)
  let out = html
  for (const e of variant.edits) {
    const found = out.split(e.from).length - 1
    if (found !== e.count) throw new Error(`spacing: expected ${e.count} ${e.what}, found ${found}`)
    out = out.split(e.from).join(e.to)
  }
  return out
}

const footerOf = (html: string) => /<footer[\s\S]*<\/footer>/.exec(html)?.[0] ?? null

/** sha256 of the page with the footer removed: what an approval pins. */
export function hashOutsideFooter(html: string): string {
  const f = footerOf(html)
  if (!f) throw new Error("no <footer>")
  return createHash("sha256").update(html.replace(f, "")).digest("hex")
}

/** The kit file a request for AP_KIT_ORIGIN/... maps to (inside enterprise/ap/kit-v2 only), or null. */
export function kitFileFor(url: string): string | null {
  if (!url.startsWith(`${AP_KIT_ORIGIN}/`)) return null
  const rel = decodeURIComponent(new URL(url).pathname).replace(/^\/+/, "")
  const file = path.normalize(path.join(AP_KIT_DIR, rel))
  if (!file.startsWith(AP_KIT_DIR + path.sep)) return null
  return fs.existsSync(file) && fs.statSync(file).isFile() ? file : null
}

/** Strings that must never reach a non-NOP flyer unless an org typed them into a slot. */
export const BANNED = [/basic\s*benefits/i, /basicbenefits/i, /bb-logo/i, /\bNOP-P\d/, /\bNOP\b/, /benefithub/i, /healthyr/i, /neighborhood outreach/i]

/** Throws if the page carries a banned string that didn't come from this org's own slot values. */
export function assertNoForeignBrand(html: string, ownValues: string[]): void {
  let rest = html
  for (const v of ownValues.filter(Boolean).sort((a, b) => b.length - a.length)) rest = rest.split(escText(v)).join("").split(esc(v)).join("")
  for (const re of BANNED) {
    const m = re.exec(rest)
    if (m) throw new Error(`foreign brand text on the page: ${JSON.stringify(m[0])}`)
  }
}
