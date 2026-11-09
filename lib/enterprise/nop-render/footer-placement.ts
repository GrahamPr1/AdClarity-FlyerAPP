import type { NopV2Pkg } from "./kit-v2-ids"

// Option B (proposal for Basic Benefits): the agent area goes in the dark
// footer band, in place of the generic neighbor.basicbenefits.com link.
//
// Exactly what changes, and nothing else:
//   - the footer's right-hand column (generic link + version stamp) becomes
//     the agent area; the version stamp moves under "Sign in or enroll online",
//     and that column is fixed (flex:none) so it never wraps;
//   - the footer's top/bottom padding goes from 16px to 8px, so the band grows
//     by the QR box less the padding saved (0.9in box: 75px -> 102.4px tall);
//   - P2 and P3 don't have that much free space above the disclaimer, so
//     their <main> spacing tightens (MAIN_SPACING). No text, block, image or
//     price moves sideways or changes size.
// Every replacement must match the supplied markup exactly once, or the
// placement refuses: a changed master can't be silently mis-edited.

const FOOTER_PAD_FROM = "padding:16px calc(48px + var(--bleed, 0px)) calc(16px + var(--bleed, 0px));"
const FOOTER_PAD_TO = "padding:8px calc(48px + var(--bleed, 0px)) calc(8px + var(--bleed, 0px));"

const RIGHT_COLUMN =
  /<div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px;">\s*<a href="https:\/\/neighbor\.basicbenefits\.com" [^>]*>neighbor\.basicbenefits\.com<\/a>\s*(<span [^>]*>[^<]*<\/span>)\s*<\/div>/g
const LEFT_COLUMN = /(<footer [^>]*>\s*)<div style="display:flex;flex-direction:column;gap:4px;">([\s\S]*?)(\s*<\/div>)/g

/** <main> spacing per package: [as supplied, with the taller footer]. */
export const MAIN_SPACING: Record<NopV2Pkg, [string, string] | null> = {
  P1: null, // 125px free above the disclaimer: absorbs the footer as is
  // -22px: padding 16/12 -> 10/8, gap 10 -> 6 (3 gaps)
  P2: [
    "padding:16px calc(48px + var(--bleed, 0px)) 12px;display:flex;flex-direction:column;gap:10px;",
    "padding:10px calc(48px + var(--bleed, 0px)) 8px;display:flex;flex-direction:column;gap:6px;",
  ],
  // -18px: bottom padding 18 -> 12, gap 16 -> 12 (3 gaps)
  P3: [
    "padding:22px calc(48px + var(--bleed, 0px)) 18px;display:flex;flex-direction:column;gap:16px;",
    "padding:22px calc(48px + var(--bleed, 0px)) 12px;display:flex;flex-direction:column;gap:12px;",
  ],
}

function replaceOnce(html: string, from: string | RegExp, to: string | ((...m: string[]) => string), what: string): string {
  const count = typeof from === "string" ? html.split(from).length - 1 : (html.match(from) ?? []).length
  if (count !== 1) throw new Error(`footer placement: expected 1 ${what}, found ${count}`)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- string and function replacers share one call
  return html.replace(from as any, to as any)
}

export function placeAgentAreaInFooter(html: string, pkg: NopV2Pkg, areaHtml: string): string {
  let stamp = ""
  let out = replaceOnce(html, RIGHT_COLUMN, (_m, s) => ((stamp = s), areaHtml), "footer link column")
  // flex:none: Basic Benefits' own footer text never wraps or shrinks to make
  // room. A too-long agent value overflows the agent area instead, which the
  // renderer can measure and refuse.
  out = replaceOnce(out, LEFT_COLUMN, (_m, open, body, close) => `${open}<div style="display:flex;flex-direction:column;gap:4px;flex:none;">${body}\n      ${stamp}${close}`, "footer text column")
  out = replaceOnce(out, FOOTER_PAD_FROM, FOOTER_PAD_TO, "footer padding")
  const spacing = MAIN_SPACING[pkg]
  if (spacing) out = replaceOnce(out, spacing[0], spacing[1], "<main> spacing")
  return out
}
