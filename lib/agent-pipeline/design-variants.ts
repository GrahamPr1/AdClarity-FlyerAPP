/**
 * Per-flyer layout and colour variation.
 *
 * Two problems this solves.
 *
 * First, every flyer looked like every other flyer. The Flyer Agent was told
 * to apply one brand profile faithfully, with nothing telling it to compose
 * the second flyer differently from the first — so a client who ordered three
 * got three near-identical pieces.
 *
 * Second, when a client has no brand of their own, the Brand Agent invents one
 * palette and every flyer that client ever generates inherits it forever.
 *
 * Assignment happens HERE, in code, rather than by asking the model to "vary
 * things". A model told to vary will drift back toward its favourite
 * composition across separate calls, because each call is independent and
 * can't see what the others produced. Deciding in code makes variety a
 * property of the system instead of a hope.
 *
 * The company's own look always wins. When the brand palette came from the
 * client (a real website, real supplied colours), that palette is used for
 * every flyer and only the LAYOUT varies — matching their theme matters more
 * than variety. Palette variation applies only when the palette was invented
 * for them anyway.
 */

export interface Palette {
  name: string
  primary: string
  secondary: string
  accent: string
  /**
   * Two derived tones, computed not authored, for compositions carrying no
   * photograph. A flyer with a photo gets most of its colour from the image;
   * one without has only three flat fields, which reads thin however
   * well-chosen they are. Derived rather than hand-picked so every palette —
   * including any added later — gains them automatically and they can never
   * drift out of relation to the base colours.
   */
  supporting?: string[]
}

/** Mixes two hex colours. Used only to derive supporting tones. */
function mix(a: string, b: string, weight: number): string {
  const parse = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))
  const [ar, ag, ab] = parse(a)
  const [br, bg, bb] = parse(b)
  const c = (x: number, y: number) => Math.round(x * (1 - weight) + y * weight)
  return `#${[c(ar, br), c(ag, bg), c(ab, bb)].map((v) => v.toString(16).padStart(2, "0")).join("")}`.toUpperCase()
}

/**
 * A soft tint of the primary and a deepened accent: enough range for banding,
 * rules, panels and shape work without introducing a hue the palette never
 * had. Deliberately NOT more saturation — saturation makes a thin design
 * garish, not rich.
 */
export function withSupportingTones(p: Palette): Palette {
  return { ...p, supporting: [mix(p.primary, p.secondary, 0.72), mix(p.accent, p.primary, 0.45)] }
}

export interface DesignVariant {
  layoutName: string
  layoutBrief: string
  /** Non-null only when the brand palette was agent-invented and may be replaced. */
  palette: Palette | null
}

/**
 * Distinct compositional archetypes, not restyles of one idea.
 *
 * Each says where the eye lands first and how the page is divided, because
 * that is what makes two flyers read as genuinely different pieces rather
 * than the same flyer in another colour.
 */
export const LAYOUT_ARCHETYPES: { name: string; brief: string }[] = [
  {
    name: "banner-hero",
    brief:
      "A full-width colour band across the top holding the headline, the offer immediately beneath it in the largest type on the page, then supporting detail and a strong footer bar with contact details. Confident, direct, reads at a glance from across a room.",
  },
  {
    name: "split-vertical",
    brief:
      "The page divided into two vertical columns — a solid colour panel on one side carrying the headline and offer, the other side holding the photo or a patterned block. Contact details run along the bottom of the full width.",
  },
  {
    name: "centred-medallion",
    brief:
      "Symmetrical and formal. The offer sits in a centred badge, circle or rounded panel as the clear focal point, with the headline arched or stacked above it and contact details centred below. Generous margins; nothing touches the edges.",
  },
  {
    name: "diagonal-cut",
    brief:
      "A bold diagonal division across the upper third separating a colour field from the content area, giving the page motion. The offer sits just below the diagonal where the eye naturally lands.",
  },
  {
    name: "editorial-stack",
    brief:
      "Magazine-like. A small kicker line, a large multi-line headline set tight, a rule, then body detail in a narrow measure. Restrained use of colour — mostly typography doing the work, with one accent element.",
  },
  {
    name: "corner-frame",
    brief:
      "A thick border or L-shaped corner frame in the primary colour wrapping the content. The offer sits in a contrasting inset block. Feels like a certificate or a premium coupon.",
  },
  {
    name: "stacked-bands",
    brief:
      "Three or four full-width horizontal bands of alternating colour and weight, each holding one idea — headline, offer, proof point, contact. Rhythmic and extremely easy to scan.",
  },
  {
    name: "offset-panel",
    brief:
      "An asymmetric floating panel overlapping a larger colour field or photo, casting a soft shadow. The headline breaks across the panel edge. Modern and layered, with clear depth.",
  },
]

/**
 * Broadly appealing palettes, used only when the client has no colours of
 * their own.
 *
 * Chosen to be safe across trades rather than fashionable: strong contrast
 * against white, a dark-enough primary for legible reversed-out text, and one
 * genuine accent. No neons, nothing that reads as a warning label, nothing
 * that collides with a national chain's livery.
 */
export const MASS_APPEAL_PALETTES: Palette[] = [
  { name: "deep navy & warm amber", primary: "#12314F", secondary: "#E8EDF2", accent: "#E39A2B" },
  { name: "forest green & cream", primary: "#1E4635", secondary: "#F2EFE6", accent: "#C9873D" },
  { name: "charcoal & signal red", primary: "#23262B", secondary: "#EFEFEF", accent: "#C8452F" },
  { name: "slate blue & copper", primary: "#2C4A63", secondary: "#EDF0F3", accent: "#B4643A" },
  { name: "burgundy & soft gold", primary: "#5C1F2B", secondary: "#F4EFE9", accent: "#C8A24A" },
  { name: "teal & sand", primary: "#14524F", secondary: "#F1EDE4", accent: "#DD8A46" },
  { name: "indigo & coral", primary: "#2A2F6B", secondary: "#EFEEF5", accent: "#DC6A55" },
  { name: "espresso & sage", primary: "#33291F", secondary: "#EFEDE5", accent: "#7C9A6E" },
]

/**
 * Stable 32-bit hash (FNV-1a) so a given flyer id always starts from the same
 * preference. Two flyers created seconds apart get unrelated starting points,
 * and regenerating one flyer lands on the same design rather than shuffling
 * under the client.
 */
function hash(value: string): number {
  let h = 2166136261
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/**
 * Assigns a distinct design to each flyer in a batch.
 *
 * Each id proposes its own preferred archetype from its hash; collisions
 * within the batch advance to the next free one, so a batch of N never
 * repeats a layout while N is within the archetype count. Beyond that they
 * necessarily wrap, and the palette (when varying) keeps them distinguishable.
 *
 * `allowPaletteVariation` should be false whenever the brand palette came from
 * the client — see the note at the top of this file.
 */
export function assignDesignVariants(
  flyerIds: string[],
  allowPaletteVariation: boolean,
  /**
   * Archetype names this canvas can actually carry (see OutputFormat.
   * allowedLayouts). A "split-vertical" composition is meaningless on a
   * 3.5in-wide door hanger, so formats restrict the pool rather than
   * letting an impossible layout be assigned and then quietly ignored.
   * Omitted means every archetype is fair game.
   */
  allowedLayoutNames?: string[],
  opts?: {
    /**
     * Stable identity for the BUSINESS (name + trade), not the flyer.
     *
     * Layout and palette are seeded differently on purpose. Layout stays
     * per-flyer so a client ordering three pieces gets three distinct
     * compositions — the original reason this file exists. Palette is seeded
     * from the business instead, so every piece they ever receive shares one
     * colour language across flyer, one-pager, door hanger and social post.
     * That is what brand consistency means here: fixed palette, varied
     * composition. Omitted keeps the previous per-flyer behaviour.
     */
    businessSeed?: string
    /** Trade-appropriate pool — see palettePoolFor in trade-palettes.ts. */
    palettePool?: Palette[]
  },
): Map<string, DesignVariant> {
  const palettePool = opts?.palettePool?.length ? opts.palettePool : MASS_APPEAL_PALETTES
  const businessSeed = opts?.businessSeed
  const assigned = new Map<string, DesignVariant>()
  const usedLayouts = new Set<number>()
  const usedPalettes = new Set<number>()

  // One draw for the whole batch when a business seed is supplied: every
  // flyer in it, and every flyer this business ever gets, lands on the same
  // palette. Without a seed this stays null and the per-flyer draw below
  // applies, preserving the old behaviour.
  const businessPalette =
    businessSeed && palettePool.length > 0 ? palettePool[hash(`${businessSeed}:palette`) % palettePool.length] : null

  const pool = allowedLayoutNames?.length
    ? LAYOUT_ARCHETYPES.filter((l) => allowedLayoutNames.includes(l.name))
    : LAYOUT_ARCHETYPES
  // A format that names only unknown archetypes would otherwise divide by
  // zero below; fall back rather than fail a generation over a config typo.
  const layouts = pool.length > 0 ? pool : LAYOUT_ARCHETYPES

  const claim = (preferred: number, used: Set<number>, size: number) => {
    for (let step = 0; step < size; step++) {
      const candidate = (preferred + step) % size
      if (!used.has(candidate)) {
        used.add(candidate)
        return candidate
      }
    }
    // More flyers than options — wrap and allow reuse rather than fail.
    used.clear()
    used.add(preferred % size)
    return preferred % size
  }

  for (const id of flyerIds) {
    const seed = hash(id)
    const layout = layouts[claim(seed % layouts.length, usedLayouts, layouts.length)]
    // A second, decorrelated draw — otherwise layout and palette move in
    // lockstep and "navy" would always arrive with the same composition.
    const paletteIndex = claim(hash(`${id}:palette`) % palettePool.length, usedPalettes, palettePool.length)

    assigned.set(id, {
      layoutName: layout.name,
      layoutBrief: layout.brief,
      // null whenever the client supplied real colours — their brand wins,
      // and only the layout varies. Unchanged by the trade pools.
      palette: allowPaletteVariation ? withSupportingTones(businessPalette ?? palettePool[paletteIndex]) : null,
    })
  }

  return assigned
}

/**
 * The variant used when REFINING an existing flyer.
 *
 * A refinement is handed the flyer's current HTML and told to change one
 * thing. Assigning it a fresh composition would invite the model to redesign
 * a flyer the client has already seen and approved — so this explicitly tells
 * it to keep what is already there. `palette: null` avoids introducing new
 * colours; the prompt gives the existing HTML's colours precedence on this
 * path (see principle 1 in prompts/flyer.ts).
 */
export const PRESERVE_EXISTING_VARIANT: DesignVariant = {
  layoutName: "preserve-existing",
  layoutBrief:
    "This flyer already exists and its full current HTML is supplied. Keep its existing composition, colours, type treatment and spacing exactly as they are. Apply only the single change requested — do not re-lay-out, re-colour, or otherwise redesign it.",
  palette: null,
}
