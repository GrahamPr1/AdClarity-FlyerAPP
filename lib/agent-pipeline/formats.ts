/**
 * Output formats — what KIND of document is being produced.
 *
 * Formats used to be a single sentence appended to the flyer request's notes
 * ("Format requested: a Door Hanger — narrow vertical layout"). That produced
 * a flyer with different words about it, not a door hanger: same canvas, same
 * proportions, same density, same structure.
 *
 * A format is not a style. It decides:
 *   - the physical canvas and aspect ratio (a door hanger is 3.5 x 8.5in; a
 *     social post is square and never printed)
 *   - how much text belongs on it (a proposal is read; a door hanger is
 *     glanced at from arm's length in about two seconds)
 *   - the document's structure (a proposal has named sections read in order;
 *     a flyer has one focal point)
 *   - whether print furniture (disclaimers, @page rules, bleed margins) makes
 *     any sense at all
 *
 * Format is the outer constraint; the layout archetype (design-variants.ts)
 * provides variation WITHIN it. Not every archetype fits every canvas, which
 * is why each format names the ones that do — a "split-vertical" composition
 * is meaningless on a 3.5in-wide door hanger.
 */

export type FormatId = "flyer" | "one-pager" | "proposal" | "door-hanger" | "social-post"

export interface OutputFormat {
  id: FormatId
  /** What a customer picks in the UI. */
  label: string
  /** One line explaining when to choose it. */
  chooseWhen: string
  /** Goes into the generated CSS @page / canvas sizing, and into the output's `dimensions`. */
  dimensions: string
  /** CSS aspect-ratio for the on-screen preview container. */
  aspectRatio: string
  /** Whether this is destined for paper. Screen-only formats must not emit print furniture. */
  medium: "print" | "screen"
  /**
   * The structural brief. Describes the DOCUMENT, not the decoration — what
   * sections exist, in what order, at what density, and how someone reads it.
   */
  brief: string
  /** Archetypes from design-variants.ts that make sense on this canvas. */
  allowedLayouts: string[]
  /**
   * Whether this format may flow onto additional pages when the content runs
   * long.
   *
   * A flyer, door hanger or social post is ONE physical piece — a second page
   * is meaningless, and they're inherently short enough not to need one. A
   * proposal is a document: if the scope of work is genuinely long, the
   * correct answer is a second page, exactly as a real quote would be.
   *
   * This exists because the alternative approaches are all worse. Pure CSS
   * cannot shrink arbitrary-length text into a fixed box — `flex:1;
   * min-height:0` lets the CONTAINER shrink but text keeps its intrinsic
   * height and simply overflows (measured: 1152px of content in a 1056px
   * page, clipping the signature line). That leaves clipping the content,
   * scaling it with JavaScript we don't allow, or capping how thorough the
   * document is allowed to be. Letting a document paginate is the only one of
   * those that doesn't damage the output.
   */
  paginates: boolean
}

export const OUTPUT_FORMATS: Record<FormatId, OutputFormat> = {
  flyer: {
    id: "flyer",
    label: "Flyer",
    chooseWhen: "Hand out, mail, or pin up. One offer, seen at a glance.",
    dimensions: "8.5in x 11in portrait",
    aspectRatio: "8.5 / 11",
    medium: "print",
    brief:
      "A single-page promotional flyer. ONE dominant message and one focal point — the offer — readable from several feet away. Graphic-forward and light on words: a headline, the offer, at most three supporting points, and a clear call to action with the phone number. Someone should get the whole point without reading a sentence. Do not turn it into a document with sections.",
    allowedLayouts: ["banner-hero", "split-vertical", "centred-medallion", "diagonal-cut", "corner-frame", "stacked-bands", "offset-panel", "editorial-stack"],
    paginates: false,
  },

  "one-pager": {
    id: "one-pager",
    label: "One-pager",
    chooseWhen: "Leave-behind after a quote. More detail than a flyer, still one page.",
    dimensions: "8.5in x 11in portrait",
    aspectRatio: "8.5 / 11",
    medium: "print",
    brief:
      "A single-page business leave-behind — denser and more text-forward than a flyer, and it reads as a business document rather than an advertisement. Structure it: a compact header with the business name and what they do, then three or four labelled blocks (services, what's included, why this business, the offer), then a contact footer. Real body copy in a readable measure, not slogans — someone sitting at a kitchen table reads this after the salesperson has left. Restrained decoration: rules, subtle panel fills and clear hierarchy do the work, not oversized graphics. Noticeably more words than a flyer, arranged so it never looks like a wall of text.",
    allowedLayouts: ["editorial-stack", "stacked-bands", "corner-frame", "split-vertical"],
    paginates: false,
  },

  proposal: {
    id: "proposal",
    label: "Proposal",
    chooseWhen: "A formal quote or scope of work, read start to finish.",
    dimensions: "8.5in x 11in portrait",
    aspectRatio: "8.5 / 11",
    medium: "print",
    brief:
      "A formal single-page proposal, read top to bottom in order rather than glanced at. It must LOOK like a business proposal: a formal header block (business name, 'Proposal' or 'Estimate', and a prepared-for line), then clearly numbered or titled sections in a deliberate reading order — Overview, Scope of Work, What's Included, Investment / Pricing, Next Steps — then a signature or acceptance line at the foot. Typography-led and sober: minimal colour beyond section headings and rules, no decorative SVG, no oversized display type, no marketing exclamation. This is the most text-heavy format; prose paragraphs and itemised lists are correct here. It should be plausible to hand to a customer as a real quote.",
    allowedLayouts: ["editorial-stack", "corner-frame"],
    paginates: true,
  },

  "door-hanger": {
    id: "door-hanger",
    label: "Door hanger",
    chooseWhen: "Canvassing a neighbourhood. Read in two seconds from a doorknob.",
    // Standard US door hanger stock.
    dimensions: "3.5in x 8.5in portrait",
    aspectRatio: "3.5 / 8.5",
    medium: "print",
    brief:
      "A narrow vertical door hanger on standard 3.5 x 8.5in stock. The top ~1.2in is RESERVED and must stay empty of content — that is where the die-cut hang hole goes; render it as clear space (a subtle circular outline indicating the cut-out is fine, text is not). Everything below is read in about two seconds by someone at their front door: an extremely short headline, the offer in the largest type on the piece, and the phone number, large. Three lines of content in total, at most one short supporting line. The narrow column means large type and generous vertical rhythm; anything set small enough to need close reading is wrong here. No paragraphs, no bulleted lists, no dense footer.",
    allowedLayouts: ["banner-hero", "stacked-bands", "centred-medallion"],
    paginates: false,
  },

  "social-post": {
    id: "social-post",
    label: "Social post",
    chooseWhen: "Instagram or Facebook feed. Never printed.",
    dimensions: "1080px x 1080px square",
    aspectRatio: "1 / 1",
    medium: "screen",
    brief:
      "A square social graphic for a phone feed, thumb-stopping at small size. Composed for a square, not a page cropped to one. Very few words — a short punchy hook and the offer, sized so both are legible on a phone at thumbnail scale. Bold colour fields and strong contrast carry it. Because this is never printed, it must NOT include print furniture: no @page rule, no legal disclaimer footer, no mailing block, no 'call today' phone-number strip formatted like a flyer footer — a handle or short CTA is enough. Edge-to-edge colour is correct here; print margins are not.",
    allowedLayouts: ["centred-medallion", "diagonal-cut", "offset-panel", "banner-hero"],
    paginates: false,
  },
}

export const FORMAT_IDS = Object.keys(OUTPUT_FORMATS) as FormatId[]

export const DEFAULT_FORMAT: FormatId = "flyer"

export function getFormat(id: string | null | undefined): OutputFormat {
  return OUTPUT_FORMATS[(id as FormatId) ?? DEFAULT_FORMAT] ?? OUTPUT_FORMATS[DEFAULT_FORMAT]
}

/**
 * Maps the customer-facing Quick Prompt labels onto format ids.
 *
 * The two lists are deliberately separate: QUICK_PROMPT_FORMATS is UI copy
 * that has shipped and appears in saved state, while FormatId is the internal
 * key. Renaming a label must not silently repoint generations at a different
 * document type.
 */
export function formatIdFromLabel(label: string | null | undefined): FormatId {
  const found = FORMAT_IDS.find(
    (id) => OUTPUT_FORMATS[id].label.toLowerCase() === (label ?? "").toLowerCase().replace(/-/g, " "),
  )
  if (found) return found
  const legacy: Record<string, FormatId> = {
    "flyer": "flyer",
    "one-pager": "one-pager",
    "proposal": "proposal",
    "door hanger": "door-hanger",
    "social post": "social-post",
  }
  return legacy[(label ?? "").toLowerCase()] ?? DEFAULT_FORMAT
}

/** The compact shape handed to the Flyer Agent per request. */
export function formatForAgent(id: FormatId | string | undefined) {
  const f = getFormat(id)
  return { id: f.id, label: f.label, dimensions: f.dimensions, medium: f.medium, brief: f.brief, paginates: f.paginates }
}

/**
 * Whether a print disclaimer belongs on this format at all.
 *
 * A required legal disclaimer has to appear on printed material, but forcing
 * one onto a square Instagram graphic is how a social post ends up looking
 * like a photographed flyer.
 */
export function formatTakesPrintFurniture(id: FormatId): boolean {
  return OUTPUT_FORMATS[id].medium === "print"
}
