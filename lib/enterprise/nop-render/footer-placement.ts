import type { NopV2Lang, NopV2Pkg } from "./kit-v2-ids"

// Option B, approved by Basic Benefits (11/2026, with the P2/P3 spacing
// change): the agent area goes in the dark footer band, in place of the
// generic neighbor.basicbenefits.com link. No label, no new wording.
//
// Exactly what changes, and nothing else:
//   - the footer's right-hand column (generic link + version stamp) becomes
//     the agent area; the version stamp moves under "Sign in or enroll online",
//     and that column is fixed (flex:none) so it never wraps;
//   - the footer's top/bottom padding goes from 16px to 8px, so the band grows
//     by the QR box less the padding saved (0.9in box: 75px -> 102.4px tall),
//     and its side padding from 48px to 32px (0.33in from the trim);
//   - pages without that much free space above the disclaimer get tighter
//     vertical spacing (SPACING): <main>'s padding and gaps, and the cards'
//     top/bottom padding. No text, block, image or price moves sideways or
//     changes size, and no space between blocks goes below 0.08in.
// Every replacement must match the supplied markup exactly as often as
// expected, or the placement refuses: a changed master can't be silently
// mis-edited.

const FOOTER_PAD_FROM = "padding:16px calc(48px + var(--bleed, 0px)) calc(16px + var(--bleed, 0px));"
// Sides 48 -> 32px (0.33in from the trim, Letter and bleed alike), approved
// 11/2026 so the full enrollment URL fits beside the QR at 15px.
const FOOTER_PAD_TO = "padding:8px calc(32px + var(--bleed, 0px)) calc(8px + var(--bleed, 0px));"

const RIGHT_COLUMN =
  /<div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px;">\s*<a href="https:\/\/neighbor\.basicbenefits\.com" [^>]*>neighbor\.basicbenefits\.com<\/a>\s*(<span [^>]*>[^<]*<\/span>)\s*<\/div>/g
const LEFT_COLUMN = /(<footer [^>]*>\s*)<div style="display:flex;flex-direction:column;gap:4px;">([\s\S]*?)(\s*<\/div>)/g

export interface SpacingEdit {
  /** Exactly as supplied. */
  from: string
  to: string
  /** How many times `from` occurs in the page (every card of a row gets the same padding). */
  count: number
  what: string
}

const MAIN = (top: number, bottom: number, gap: number) => `padding:${top}px calc(48px + var(--bleed, 0px)) ${bottom}px;display:flex;flex-direction:column;gap:${gap}px;`

// P1 and P3 masters share <main>'s spacing: padding 22/18, gaps 16.
const P1_P3_MAIN = MAIN(22, 18, 16)

/**
 * Vertical spacing per package and language, for the taller footer. Same for
 * price/no-price and Letter/bleed. Measured margins: tests/nop-kit-v2-release.test.ts.
 */
export const SPACING: Record<NopV2Pkg, Record<NopV2Lang, SpacingEdit[]>> = {
  // English: 1in free above the disclaimer absorbs the footer as is.
  // Spanish (taller cards): -35px: <main> padding 22/18 -> 14/12, gaps 16 -> 11
  // (3 gaps), card padding 16/18 -> 12/14.
  P1: {
    EN: [],
    ES: [
      { from: P1_P3_MAIN, to: MAIN(14, 12, 11), count: 1, what: "<main> spacing" },
      { from: "padding:16px 16px 18px;", to: "padding:12px 16px 14px;", count: 3, what: "benefit card padding" },
    ],
  },
  // -27px: <main> padding 16/12 -> 9/8, gaps 10 -> 8 (3 gaps; the approved 6
  // was under 0.08in), card padding 12/14 -> 9/11 (two rows of benefit cards)
  // and 12 -> 9 (wide card).
  P2: {
    EN: p2(),
    ES: p2(),
  },
  // -36px: the approved -18px (bottom padding 18 -> 12, gaps 16 -> 12), plus top
  // padding 22 -> 16 and card padding 16/18 -> 13/15 (benefit cards), 16 -> 13
  // (wide card). Both languages: English had 0.01in to spare.
  P3: {
    EN: p3(),
    ES: p3(),
  },
}

function p2(): SpacingEdit[] {
  return [
    { from: MAIN(16, 12, 10), to: MAIN(9, 8, 8), count: 1, what: "<main> spacing" },
    { from: "padding:12px 18px 14px;", to: "padding:9px 18px 11px;", count: 4, what: "benefit card padding" },
    { from: "padding:12px 18px;", to: "padding:9px 18px;", count: 1, what: "wide card padding" },
  ]
}

function p3(): SpacingEdit[] {
  return [
    { from: P1_P3_MAIN, to: MAIN(16, 12, 12), count: 1, what: "<main> spacing" },
    { from: "padding:16px 18px 18px;", to: "padding:13px 18px 15px;", count: 2, what: "benefit card padding" },
    { from: "padding:16px 20px;", to: "padding:13px 20px;", count: 1, what: "wide card padding" },
  ]
}

/** The supplied page with only `edits` applied; throws if any doesn't match as expected. */
export function applySpacing(html: string, edits: SpacingEdit[]): string {
  let out = html
  for (const e of edits) {
    const found = out.split(e.from).length - 1
    if (found !== e.count) throw new Error(`footer placement: expected ${e.count} ${e.what}, found ${found}`)
    out = out.split(e.from).join(e.to)
  }
  return out
}

function replaceOnce(html: string, from: string | RegExp, to: string | ((...m: string[]) => string), what: string): string {
  const count = typeof from === "string" ? html.split(from).length - 1 : (html.match(from) ?? []).length
  if (count !== 1) throw new Error(`footer placement: expected 1 ${what}, found ${count}`)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- string and function replacers share one call
  return html.replace(from as any, to as any)
}

export function placeAgentAreaInFooter(html: string, pkg: NopV2Pkg, lang: NopV2Lang, areaHtml: string): string {
  let stamp = ""
  let out = replaceOnce(html, RIGHT_COLUMN, (_m, s) => ((stamp = s), areaHtml), "footer link column")
  // flex:none: Basic Benefits' own footer text never wraps or shrinks to make
  // room. A too-long agent value overflows the agent area instead, which the
  // renderer can measure and refuse.
  out = replaceOnce(out, LEFT_COLUMN, (_m, open, body, close) => `${open}<div style="display:flex;flex-direction:column;gap:4px;flex:none;">${body}\n      ${stamp}${close}`, "footer text column")
  out = replaceOnce(out, FOOTER_PAD_FROM, FOOTER_PAD_TO, "footer padding")
  return applySpacing(out, SPACING[pkg][lang])
}

const footerOf = (html: string) => /<footer[\s\S]*<\/footer>/.exec(html)?.[0] ?? null

/**
 * Release check on the exact markup sent to the renderer: outside the footer
 * it is byte-for-byte the page as supplied with only SPACING's edits applied, and every piece of Basic Benefits' own footer text is still there
 * except the generic link the agent area replaces. Throws otherwise.
 */
export function assertOnlyFooterChanged(src: string, out: string, pkg: NopV2Pkg, lang: NopV2Lang): void {
  const before = footerOf(src), after = footerOf(out)
  if (!before || !after) throw new Error("footer placement: no <footer>")
  if (out.replace(after, "") !== applySpacing(src.replace(before, ""), SPACING[pkg][lang])) throw new Error("footer placement: a locked section changed")
  for (const text of before.match(/>[^<>]*\S[^<>]*</g) ?? []) {
    if (!text.includes("neighbor.basicbenefits.com") && !after.includes(text)) throw new Error(`footer placement: footer text ${text} is missing`)
  }
}
