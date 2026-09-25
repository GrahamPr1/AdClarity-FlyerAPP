import * as cheerio from "cheerio"

/**
 * Direct field editing of a generated flyer.
 *
 * Edits the SPECIFIC flyer's stored HTML — never a template and never its
 * siblings. Each flyer owns its own document (see FlyerDeliverable.
 * downloadUrl), so "edit this one, not the master" is structural here rather
 * than something this code has to be careful about.
 *
 * Deliberately not an AI call. A client fixing a typo in a phone number
 * should not wait fifteen seconds, pay for a model call, or risk the rest of
 * the page being rewritten around their correction. The existing refine path
 * stays for anything structural.
 *
 * Pure and dependency-free so it can be unit-tested without Redis or a
 * network — the same reason flyer-html.ts exists.
 */

export interface EditableField {
  field: string
  value: string
  /** Character budget the layout can physically fit. */
  max: number
}

export type EditRejection =
  | { field: string; reason: "unknown_field"; message: string }
  | { field: string; reason: "too_long"; message: string; max: number; actual: number }
  | { field: string; reason: "empty"; message: string }

export interface ApplyEditsResult {
  html: string
  applied: string[]
  rejected: EditRejection[]
}

/** True when this flyer was generated with edit markers. */
export function supportsDirectEdit(html: string): boolean {
  return /data-field=/.test(html)
}

/** The editable fields and their current values, for rendering the form. */
export function readEditableFields(html: string): EditableField[] {
  const $ = cheerio.load(html)
  const out: EditableField[] = []
  $("[data-field]").each((_, el) => {
    const field = $(el).attr("data-field")
    if (!field || out.some((f) => f.field === field)) return
    const max = Number.parseInt($(el).attr("data-max") ?? "", 10)
    out.push({
      field,
      value: $(el).text(),
      // A marker with no usable budget is treated as generous rather than
      // zero — refusing every edit would be a worse failure than allowing a
      // long one on a flyer whose budget went missing.
      max: Number.isFinite(max) && max > 0 ? max : 200,
    })
  })
  return out
}

/**
 * Applies text edits to the marked elements.
 *
 * Budgets are enforced here, against the value carried in the markup, which
 * is the same number the generator used. That is what stops a direct edit
 * from doing what the AI path is prevented from doing: a 300-character
 * "headline" in a box measured for 52 does not wrap, it overflows the page
 * and silently ruins the print.
 *
 * Rejections are returned rather than thrown, and are per-field: a valid
 * phone correction still applies when an over-long headline in the same
 * submission does not, and the caller can say exactly which failed and why.
 *
 * cheerio's .text() escapes on write, so a value containing markup becomes
 * literal text rather than injected HTML.
 */
export function applyFieldEdits(html: string, edits: Record<string, string>): ApplyEditsResult {
  const $ = cheerio.load(html)
  const applied: string[] = []
  const rejected: EditRejection[] = []

  for (const [field, raw] of Object.entries(edits)) {
    const nodes = $(`[data-field="${cssEscape(field)}"]`)
    if (nodes.length === 0) {
      rejected.push({
        field,
        reason: "unknown_field",
        message: `This flyer has no "${field}" to edit.`,
      })
      continue
    }

    const value = raw.replace(/\s+/g, " ").trim()
    const max = Number.parseInt(nodes.first().attr("data-max") ?? "", 10)
    const limit = Number.isFinite(max) && max > 0 ? max : 200

    // Address is the one field that may legitimately be cleared — a flyer
    // without a street address is normal. Everything else empty would leave
    // a visible hole in the layout.
    if (!value && field !== "address") {
      rejected.push({ field, reason: "empty", message: `${label(field)} can't be empty.` })
      continue
    }

    if (value.length > limit) {
      rejected.push({
        field,
        reason: "too_long",
        message: `${label(field)} is ${value.length} characters; this layout fits ${limit}.`,
        max: limit,
        actual: value.length,
      })
      continue
    }

    // Every element carrying this field, so a value repeated in the design
    // (a phone number in the header and the footer) stays consistent.
    nodes.each((_, el) => { $(el).text(value) })
    applied.push(field)
  }

  return { html: $.html(), applied, rejected }
}

function label(field: string): string {
  return field.charAt(0).toUpperCase() + field.slice(1).replace(/([A-Z])/g, " $1")
}

/** Attribute-selector safety for a field name that came off the wire. */
function cssEscape(s: string): string {
  return s.replace(/["\\]/g, "\\$&")
}
