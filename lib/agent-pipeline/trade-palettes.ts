import type { BusinessCategory } from "@/lib/types"
import type { Palette } from "./design-variants"

/**
 * Palette pools per trade, used ONLY when a business has no colours of its own.
 *
 * Keyed to the real BusinessCategory enum (lib/types.ts), not an invented
 * trade list: businessCategory is a closed set already collected at signup and
 * stored on every ClientRecord, so it's the only trade signal that actually
 * exists for every client. A roofing/hvac/landscaping split would need a
 * taxonomy this product doesn't have.
 *
 * The precedence rule from design-variants.ts is unchanged and still wins: a
 * client who gave us real brand colours (colorSource === "client_provided")
 * keeps them, and only their LAYOUT varies. These pools replace the old
 * global MASS_APPEAL_PALETTES for invented brands only. Overriding a real
 * brand with a trade palette would be the product telling a business its own
 * colours are wrong.
 *
 * Each pool is four genuinely distinct directions — different hue families and
 * different light/dark balance, not tints of one idea — because the point is
 * that two roofers in the same town don't get the same flyer. Every `primary`
 * is dark enough to carry reversed-out white text, which is what the layouts
 * actually do with it.
 */
export const PALETTES_BY_CATEGORY: Record<BusinessCategory, Palette[]> = {
  // Trust and permanence. Deep, settled colours — this is a considered
  // purchase, not an impulse one.
  "Real Estate / Wholesaling": [
    { name: "harbour navy & brass", primary: "#16324F", secondary: "#EEF1F4", accent: "#C08A3E" },
    { name: "ink & sage", primary: "#1F2A24", secondary: "#EFF1EC", accent: "#7FA07A" },
    { name: "oxblood & stone", primary: "#4A1F24", secondary: "#F2EEE9", accent: "#B08968" },
    { name: "slate & sky", primary: "#2B3A45", secondary: "#EDF2F5", accent: "#4E8FB0" },
  ],

  // Clean, calm, clinical — without tipping into cold hospital blue, which
  // reads as anxiety rather than care.
  Dental: [
    { name: "clinic teal & mint", primary: "#11504C", secondary: "#EFF5F3", accent: "#54B39B" },
    { name: "soft navy & coral", primary: "#22355C", secondary: "#F1F3F7", accent: "#E4816F" },
    { name: "plum & blush", primary: "#43244A", secondary: "#F5F0F3", accent: "#C98BA4" },
    { name: "graphite & aqua", primary: "#262B30", secondary: "#EEF2F3", accent: "#3FA8B8" },
  ],

  // Energy and movement. The one category where a genuinely loud accent is
  // correct rather than a mistake.
  "Gym/Fitness": [
    { name: "midnight & volt", primary: "#14161C", secondary: "#EDEEF0", accent: "#C6F24E" },
    { name: "deep violet & flame", primary: "#2B1B46", secondary: "#F0EDF4", accent: "#F2683C" },
    { name: "forest & citrus", primary: "#17331F", secondary: "#EEF2EC", accent: "#9FCB3B" },
    { name: "steel & electric blue", primary: "#20262C", secondary: "#EDEFF2", accent: "#2E8BE0" },
  ],

  // Work clothes, not boardrooms. High-visibility accents that read as
  // competence and safety gear rather than fashion.
  Contractor: [
    { name: "storm slate & safety orange", primary: "#1C2530", secondary: "#EFF1F3", accent: "#E8622C" },
    { name: "clay tile & charcoal", primary: "#6B2E22", secondary: "#F5F0EA", accent: "#2F3438" },
    { name: "workshop green & amber", primary: "#1E3A2E", secondary: "#F0F1EC", accent: "#D99A2B" },
    { name: "asphalt & hazard yellow", primary: "#24262A", secondary: "#F1F1EF", accent: "#E5B33B" },
  ],

  // Appetite. Warm, saturated, food-forward — the one place a hungry red or
  // a deep roast brown is the obvious right answer.
  "Restaurant/Cafe": [
    { name: "roast brown & cream", primary: "#3A2318", secondary: "#F6F0E6", accent: "#D98E38" },
    { name: "tomato & basil", primary: "#7A1F1C", secondary: "#F4EFE7", accent: "#5C8A4A" },
    { name: "olive & terracotta", primary: "#3C4127", secondary: "#F3EFE6", accent: "#C2683F" },
    { name: "espresso & teal", primary: "#2A211E", secondary: "#F1EEE9", accent: "#2E8079" },
  ],

  // The fallback category, and the one most clients actually carry. Kept
  // deliberately broad and safe across any trade — these are the original
  // mass-appeal palettes, which were chosen for exactly this job.
  Other: [
    { name: "deep navy & warm amber", primary: "#12314F", secondary: "#E8EDF2", accent: "#E39A2B" },
    { name: "forest green & cream", primary: "#1E4635", secondary: "#F2EFE6", accent: "#C9873D" },
    { name: "charcoal & signal red", primary: "#23262B", secondary: "#EFEFEF", accent: "#C8452F" },
    { name: "burgundy & soft gold", primary: "#5C1F2B", secondary: "#F4EFE9", accent: "#C8A24A" },
  ],
}

/** Falls back to the broad pool for any category without its own. */
export function palettePoolFor(category: BusinessCategory | undefined): Palette[] {
  return (category && PALETTES_BY_CATEGORY[category]) || PALETTES_BY_CATEGORY.Other
}
