import { CURATED_FONTS } from "@/lib/brand-controls"
import { applyFieldEdits, readEditableFields, supportsDirectEdit } from "./flyer-edit"
import type { QuickEditAgentOutput, QuickEditEmphasis, QuickEditLook } from "./schemas/quick-edit"

/**
 * Applies a quick edit (see agents/quickEditAgent.ts) to a template flyer's
 * stored HTML, in code. Text goes through applyFieldEdits — the same
 * budget-enforced, text-only path as the direct editor — so the model's words
 * can never become markup or overflow a field's physical limit. Style is a
 * short list of options rendered here; the model never writes CSS.
 *
 * Pure: no network, no storage. The pipeline checks the result
 * (edit-invariants.ts) before anything is saved.
 */

const STYLE_MARKER = "data-quick-edit-style"

const LOOK_FONTS: Record<Exclude<QuickEditLook, "unchanged">, string> = {
  modern: "modern-sans",
  classic: "classic-serif",
  editorial: "editorial",
  bold: "strong-industrial",
  friendly: "friendly-rounded",
}

interface AppliedStyle {
  look: QuickEditLook
  emphasis: QuickEditEmphasis
}

/** The quick-edit style a flyer currently carries ("unchanged" = template default). */
export function readQuickEditStyle(html: string): AppliedStyle {
  const m = html.match(new RegExp(`<style ${STYLE_MARKER}="([^"]*)"`))
  if (!m) return { look: "unchanged", emphasis: "none" }
  try {
    const parsed = JSON.parse(m[1].replace(/&quot;/g, '"')) as Partial<AppliedStyle>
    return { look: parsed.look ?? "unchanged", emphasis: parsed.emphasis ?? "none" }
  } catch {
    return { look: "unchanged", emphasis: "none" }
  }
}

function styleCss(style: AppliedStyle): string {
  const rules: string[] = []
  if (style.look !== "unchanged") {
    const font = CURATED_FONTS.find((f) => f.id === LOOK_FONTS[style.look as Exclude<QuickEditLook, "unchanged">])
    if (font) rules.push(`:root{--font-heading:${font.heading};--font-body:${font.body}}`)
    if (style.look === "editorial") rules.push(`[data-field="headline"]{letter-spacing:.01em;font-weight:600}`)
  }
  // A highlighter stroke in the brand's own accent colour, behind the text:
  // it makes the line stand out without changing the text colour (so contrast
  // is never worse than the template's) and without moving anything.
  const highlight =
    "background:linear-gradient(transparent 58%,color-mix(in srgb,var(--brand-accent) 38%,transparent) 58%);" +
    "-webkit-box-decoration-break:clone;box-decoration-break:clone"
  if (style.emphasis === "supporting") rules.push(`[data-field="supporting"]{font-weight:700;${highlight}}`)
  if (style.emphasis === "headline") rules.push(`[data-field="headline"]{${highlight}}`)
  return rules.join("\n")
}

/** Replaces (never stacks) the quick-edit style block. */
export function applyQuickEditStyle(html: string, requested: { look: QuickEditLook; emphasis: QuickEditEmphasis }): string {
  const current = readQuickEditStyle(html)
  const next: AppliedStyle = {
    look: requested.look === "unchanged" ? current.look : requested.look,
    emphasis: requested.emphasis === "unchanged" ? current.emphasis : requested.emphasis,
  }
  const stripped = html.replace(new RegExp(`<style ${STYLE_MARKER}="[^"]*">[\\s\\S]*?</style>`), "")
  const css = styleCss(next)
  if (!css) return stripped
  const tag = `<style ${STYLE_MARKER}="${JSON.stringify(next).replace(/"/g, "&quot;")}">${css}</style>`
  // Last in <head>, so it wins over the template's own :root variables.
  const at = stripped.toLowerCase().indexOf("</head>")
  return at === -1 ? tag + stripped : stripped.slice(0, at) + tag + stripped.slice(at)
}

export type QuickEditResult =
  | { ok: true; html: string; changedFields: string[]; styleChanged: boolean }
  | { ok: false; reason: string }

export function applyQuickEdit(html: string, edit: QuickEditAgentOutput): QuickEditResult {
  if (!supportsDirectEdit(html)) return { ok: false, reason: "This flyer has no editable fields." }
  const current = Object.fromEntries(readEditableFields(html).map((f) => [f.field, f.value]))
  const changes: Record<string, string> = {}
  for (const [field, value] of Object.entries(edit.fields)) {
    if (value === null || !(field in current)) continue
    if (value.replace(/\s+/g, " ").trim() !== current[field]) changes[field] = value
  }

  let out = html
  if (Object.keys(changes).length) {
    const applied = applyFieldEdits(html, changes)
    if (applied.rejected.length) return { ok: false, reason: applied.rejected.map((r) => r.message).join(" ") }
    out = applied.html
  }
  const styled = applyQuickEditStyle(out, edit.style)
  const styleChanged = styled !== out
  if (!Object.keys(changes).length && !styleChanged) return { ok: false, reason: edit.cannotApply ?? "That request didn't change anything on this flyer." }
  return { ok: true, html: styled, changedFields: Object.keys(changes), styleChanged }
}
