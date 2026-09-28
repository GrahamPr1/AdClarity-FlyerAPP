/**
 * Manual brand controls — the colours and font a client picks themselves.
 *
 * WHY THIS IS THE PRIMARY PATH, not a fallback bolted on afterward.
 *
 * The website scraper works: measured live, mrrooter.com yields #005489, that
 * lands in brandAssets.existingColors, and the Brand Agent returns it with
 * colorSource "client_provided" and the hex preserved exactly. But it only
 * reads colour out of the HTML it fetches — inline styles and meta
 * theme-color — and never fetches external stylesheets. Against five real
 * business sites it produced colours for one. Two were unreachable behind bot
 * protection and two returned nothing, including a site whose brand colour is
 * famous.
 *
 * So "no usable scan" is the common case, not the edge case, and a manual
 * picker has to be a first-class way to set brand colour rather than a
 * consolation prize.
 */

export type BrandColorSource = "scanned" | "manual" | "none"

export interface ResolvedBrandColors {
  /** Hex values to hand the Brand Agent as existingColors, or null for none. */
  colors: string[] | null
  source: BrandColorSource
}

/** #rgb and #rrggbb, the two forms a colour input or a hand-typed value produce. */
const HEX_RE = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i

export function isHexColor(value: string): boolean {
  return HEX_RE.test(value.trim())
}

/** Normalises to lowercase #rrggbb so two spellings of one colour can't both survive. */
export function normaliseHex(value: string): string | null {
  const v = value.trim().toLowerCase()
  if (!HEX_RE.test(v)) return null
  if (v.length === 4) return `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}`
  return v
}

export function cleanHexList(values: readonly string[] | undefined | null): string[] {
  if (!values) return []
  const out: string[] = []
  for (const v of values) {
    const hex = normaliseHex(v)
    if (hex && !out.includes(hex)) out.push(hex)
  }
  return out
}

/**
 * Decides which colours win.
 *
 * A successful scan beats a manual pick unless the client explicitly said to
 * override it. That ordering is the point: someone who scanned their own site
 * and then idly touched a swatch should not silently lose their real brand
 * colour, and a manual pick that quietly replaced a good scan would be
 * indistinguishable from the scan having failed.
 *
 * When nothing was scanned, the manual pick is simply the answer — there is
 * no precedence question to resolve and no override to opt into.
 */
export function resolveBrandColors(input: {
  scanned?: readonly string[] | null
  manual?: readonly string[] | null
  /** The client ticked "use my own colours instead" against a successful scan. */
  manualOverridesScan?: boolean
}): ResolvedBrandColors {
  const scanned = cleanHexList(input.scanned)
  const manual = cleanHexList(input.manual)

  if (scanned.length > 0 && !(input.manualOverridesScan && manual.length > 0)) {
    return { colors: scanned, source: "scanned" }
  }
  if (manual.length > 0) return { colors: manual, source: "manual" }
  if (scanned.length > 0) return { colors: scanned, source: "scanned" }
  return { colors: null, source: "none" }
}

/* ---------------------------------- Fonts --------------------------------- */

export interface FontChoice {
  id: string
  /** What the client sees in the picker. */
  label: string
  /** CSS stacks handed to the Flyer Agent as brandProfile.fonts. */
  heading: string
  body: string
  /** One line on what the pairing is for, shown under the option. */
  note: string
}

/**
 * Deliberately web-safe stacks rather than Google Fonts.
 *
 * A finished flyer is stored as a `data:` URL and rendered inside an iframe,
 * and printed from there. A document at a data: URL has an opaque origin, so
 * an @import or <link> to a font CDN is unreliable at best and silently
 * ignored at worst — which would show the client one font on the picker and
 * print a different one. Every family below resolves with no network at all,
 * so what is chosen is what prints.
 *
 * Offering arbitrary font upload would mean embedding the face as base64 in
 * every flyer; that is a real feature, not this one.
 */
export const CURATED_FONTS: FontChoice[] = [
  {
    id: "modern-sans",
    label: "Modern sans",
    heading: "'Helvetica Neue', Helvetica, Arial, sans-serif",
    body: "'Helvetica Neue', Helvetica, Arial, sans-serif",
    note: "Clean and neutral. Safe for any trade.",
  },
  {
    id: "classic-serif",
    label: "Classic serif",
    heading: "Georgia, 'Times New Roman', serif",
    body: "Georgia, 'Times New Roman', serif",
    note: "Established and traditional — professional services, legal, dental.",
  },
  {
    id: "editorial",
    label: "Editorial",
    heading: "'Palatino Linotype', Palatino, Georgia, serif",
    body: "'Helvetica Neue', Helvetica, Arial, sans-serif",
    note: "Serif headline over a sans body. Reads considered rather than loud.",
  },
  {
    id: "strong-industrial",
    label: "Strong industrial",
    heading: "'Arial Black', 'Helvetica Neue', Impact, sans-serif",
    body: "'Helvetica Neue', Helvetica, Arial, sans-serif",
    note: "Heavy headline. Contractors, roofing, gyms.",
  },
  {
    id: "friendly-rounded",
    label: "Friendly rounded",
    heading: "'Trebuchet MS', 'Segoe UI', Verdana, sans-serif",
    body: "'Trebuchet MS', 'Segoe UI', Verdana, sans-serif",
    note: "Approachable and informal — restaurants, salons, pet care.",
  },
  {
    id: "typewriter",
    label: "Typewriter",
    heading: "'Courier New', Courier, monospace",
    body: "Georgia, 'Times New Roman', serif",
    note: "Distinctive and a little handmade. Cafés, makers, events.",
  },
]

/**
 * The font pair for a fontStylePreference, as a real CSS stack.
 *
 * Single source of truth for the Brand Agent's mapping. It previously named
 * Google families — Poppins, Inter, Playfair Display, Baloo 2, Quicksand.
 * Whether those resolved depended on which path produced the document, and
 * nothing anywhere said which you got:
 *
 *   - TEMPLATE MODE, the default path, emits no @font-face and no font link
 *     at all (see templates/index.ts — it only sets --font-heading /
 *     --font-body). A bare "Poppins" there resolves to nothing it names.
 *     Measured on the door-hanger fixture: the PDF's embedded fonts came
 *     out as Helvetica, not Poppins.
 *   - The AI-authored path sometimes has the model write a <link> to Google
 *     Fonts into the document, and then the family really does load.
 *     Measured on the flyer fixture: the PDF embedded Poppins-Bold.
 *
 * So the typeface was a coin flip decided by which generator ran and
 * whether the reader had network access, and the failure is silent either
 * way — the stored HTML says "Poppins" and looks correct in review.
 *
 * These stacks resolve with no network at all, on every path, which is the
 * whole point of them.
 *
 * FORWARD-ONLY. Existing flyers keep whatever is baked into their stored
 * HTML; nothing is rewritten. Only new generations get the corrected pair.
 */
export const STYLE_FONT_STACKS: Record<BrandStylePreference, { heading: string; body: string }> = {
  modern: { heading: CURATED_FONTS[0].heading, body: CURATED_FONTS[0].body }, // modern-sans
  classic: { heading: CURATED_FONTS[1].heading, body: CURATED_FONTS[1].body }, // classic-serif
  playful: { heading: CURATED_FONTS[4].heading, body: CURATED_FONTS[4].body }, // friendly-rounded
  minimal: { heading: CURATED_FONTS[2].heading, body: CURATED_FONTS[2].body }, // editorial
}

/** The four values the Brand Agent receives as fontStylePreference. */
export type BrandStylePreference = "modern" | "classic" | "playful" | "minimal"

/**
 * Guarantees the flyer is set in a font that will actually render.
 *
 * The Brand Agent's prompt now asks for full CSS stacks, but a prompt is a
 * request, not a guarantee — and the failure mode is silent: a bare family
 * name in a document with no @font-face falls back to the default serif,
 * and nothing anywhere reports that the chosen typeface was never used.
 *
 * So the value is checked in code too. A single family with no fallbacks
 * cannot survive in a self-contained document and is replaced by the stack
 * for the requested style. A value that already carries fallbacks is
 * trusted: it either came from CURATED_FONTS, or it names fonts the
 * business really uses with a stack behind them.
 */
export function renderableFonts(
  fonts: { heading: string; body: string },
  style: BrandStylePreference,
): { heading: string; body: string } {
  const stack = STYLE_FONT_STACKS[style] ?? STYLE_FONT_STACKS.modern
  const usable = (value: string, fallback: string, which: string) => {
    // A real stack names alternatives or ends in a generic family. One bare
    // name is the shape that silently fails.
    const hasFallback = value.includes(",")
    const isGeneric = /\b(serif|sans-serif|monospace|cursive|fantasy)\s*$/.test(value.trim())
    if (value.trim() && (hasFallback || isGeneric)) return value
    console.warn(
      `[brand] ${which} font "${value}" has no fallbacks and cannot load in a self-contained flyer — using the ${style} stack instead.`,
    )
    return fallback
  }
  return {
    heading: usable(fonts.heading, stack.heading, "heading"),
    body: usable(fonts.body, stack.body, "body"),
  }
}

export function findFontChoice(id: string | undefined | null): FontChoice | null {
  if (!id) return null
  return CURATED_FONTS.find((f) => f.id === id) ?? null
}

/**
 * The fonts to stamp onto the brand profile, or null to leave the Brand
 * Agent's own choice alone.
 *
 * Null rather than a default pairing on purpose: with no explicit pick, today's
 * behaviour is that the Brand Agent chooses fonts from fontStylePreference,
 * and that keeps working untouched. Substituting a default here would change
 * every existing client's flyers.
 */
export function resolveFonts(fontChoiceId: string | undefined | null): { heading: string; body: string } | null {
  const choice = findFontChoice(fontChoiceId)
  return choice ? { heading: choice.heading, body: choice.body } : null
}
