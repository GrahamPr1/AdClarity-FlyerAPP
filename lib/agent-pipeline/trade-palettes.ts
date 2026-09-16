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
    { name: "cypress & linen", primary: "#1F3A34", secondary: "#F0F2ED", accent: "#9C7A4A" },
    { name: "graphite & copper", primary: "#2A2D33", secondary: "#F1F0EE", accent: "#B4714A" },
    { name: "plum slate & ivory", primary: "#38283F", secondary: "#F3F0F3", accent: "#A98BB0" },
    { name: "deep teal & sand", primary: "#12433F", secondary: "#EFF3F1", accent: "#C8A878" },
    { name: "bordeaux & pewter", primary: "#4B2230", secondary: "#F2EFF0", accent: "#8E9AA3" },
    { name: "midnight & bronze", primary: "#141C2B", secondary: "#EDEFF3", accent: "#A97C50" },
    { name: "forest & parchment", primary: "#20362A", secondary: "#F1F2EC", accent: "#C2A25E" },
    { name: "charcoal & sky", primary: "#252A2E", secondary: "#EEF1F3", accent: "#5B93B5" },
  ],

  // Clean, calm, clinical — without tipping into cold hospital blue, which
  // reads as anxiety rather than care.
  Dental: [
    { name: "clinic teal & mint", primary: "#11504C", secondary: "#EFF5F3", accent: "#54B39B" },
    { name: "soft navy & coral", primary: "#22355C", secondary: "#F1F3F7", accent: "#E4816F" },
    { name: "plum & blush", primary: "#43244A", secondary: "#F5F0F3", accent: "#C98BA4" },
    { name: "graphite & aqua", primary: "#262B30", secondary: "#EEF2F3", accent: "#3FA8B8" },
    { name: "seafoam & slate", primary: "#15494A", secondary: "#EFF4F4", accent: "#6FB7AE" },
    { name: "indigo & cream", primary: "#26315C", secondary: "#F1F1F6", accent: "#D9B36A" },
    { name: "mint & charcoal", primary: "#1C3C34", secondary: "#EFF4F1", accent: "#68BFA1" },
    { name: "rose slate & pearl", primary: "#4A2C3A", secondary: "#F5F1F3", accent: "#C98BA0" },
    { name: "harbour & ice", primary: "#1B3B52", secondary: "#EEF3F6", accent: "#5FA8C7" },
    { name: "sage & bone", primary: "#2E4034", secondary: "#F1F3EF", accent: "#8FB08A" },
    { name: "violet & mist", primary: "#332A52", secondary: "#F1F0F5", accent: "#8E85C4" },
    { name: "slate & apricot", primary: "#2A3136", secondary: "#EFF1F2", accent: "#E0946A" },
  ],

  // Energy and movement. The one category where a genuinely loud accent is
  // correct rather than a mistake.
  "Gym/Fitness": [
    { name: "midnight & volt", primary: "#14161C", secondary: "#EDEEF0", accent: "#C6F24E" },
    { name: "deep violet & flame", primary: "#2B1B46", secondary: "#F0EDF4", accent: "#F2683C" },
    { name: "forest & citrus", primary: "#17331F", secondary: "#EEF2EC", accent: "#9FCB3B" },
    { name: "steel & electric blue", primary: "#20262C", secondary: "#EDEFF2", accent: "#2E8BE0" },
    { name: "carbon & lime", primary: "#16181C", secondary: "#EDEEEF", accent: "#A8E04A" },
    { name: "oxblood & steel", primary: "#3E1417", secondary: "#F1EEEE", accent: "#7F8C96" },
    { name: "navy & sulphur", primary: "#141F35", secondary: "#EDEFF3", accent: "#E3D24A" },
    { name: "jet & magenta", primary: "#17151A", secondary: "#EFEEF0", accent: "#D9418A" },
    { name: "moss & tangerine", primary: "#1B2C1C", secondary: "#EEF1EC", accent: "#EB7A2B" },
    { name: "ink & cyan", primary: "#131A22", secondary: "#ECEFF2", accent: "#2FB8D4" },
    { name: "slate & coral", primary: "#232830", secondary: "#EFF0F2", accent: "#F0655A" },
    { name: "charcoal & gold", primary: "#1E1F22", secondary: "#EFEFEF", accent: "#D6A32E" },
  ],

  // Work clothes, not boardrooms. High-visibility accents that read as
  // competence and safety gear rather than fashion.
  Contractor: [
    { name: "storm slate & safety orange", primary: "#1C2530", secondary: "#EFF1F3", accent: "#E8622C" },
    { name: "clay tile & charcoal", primary: "#6B2E22", secondary: "#F5F0EA", accent: "#2F3438" },
    { name: "workshop green & amber", primary: "#1E3A2E", secondary: "#F0F1EC", accent: "#D99A2B" },
    { name: "asphalt & hazard yellow", primary: "#24262A", secondary: "#F1F1EF", accent: "#E5B33B" },
    { name: "steel & signal red", primary: "#232A31", secondary: "#EFF1F3", accent: "#CF4436" },
    { name: "umber & sky", primary: "#3B2A1E", secondary: "#F2EFEB", accent: "#5D93B8" },
    { name: "slate & lime", primary: "#22282C", secondary: "#EEF0F2", accent: "#9BBF3C" },
    { name: "brick & graphite", primary: "#5A2A20", secondary: "#F3EFEC", accent: "#3A4045" },
    { name: "pine & copper", primary: "#1C3128", secondary: "#EFF1ED", accent: "#B4714A" },
    { name: "navy & steel grey", primary: "#182739", secondary: "#EDEFF2", accent: "#8894A0" },
    { name: "bitumen & amber", primary: "#26241F", secondary: "#F0EFEC", accent: "#D8962C" },
    { name: "iron & teal", primary: "#282D2E", secondary: "#EFF1F1", accent: "#2E8A86" },
  ],

  // Appetite. Warm, saturated, food-forward — the one place a hungry red or
  // a deep roast brown is the obvious right answer.
  "Restaurant/Cafe": [
    { name: "roast brown & cream", primary: "#3A2318", secondary: "#F6F0E6", accent: "#D98E38" },
    { name: "tomato & basil", primary: "#7A1F1C", secondary: "#F4EFE7", accent: "#5C8A4A" },
    { name: "olive & terracotta", primary: "#3C4127", secondary: "#F3EFE6", accent: "#C2683F" },
    { name: "espresso & teal", primary: "#2A211E", secondary: "#F1EEE9", accent: "#2E8079" },
    { name: "cocoa & butter", primary: "#33231A", secondary: "#F5F1E8", accent: "#E0B457" },
    { name: "bordeaux & wheat", primary: "#4E1B22", secondary: "#F4EFE6", accent: "#C9A45E" },
    { name: "spruce & paprika", primary: "#21332B", secondary: "#F0F2EC", accent: "#C85A33" },
    { name: "charcoal & saffron", primary: "#25211E", secondary: "#F1EFEA", accent: "#E0A32B" },
    { name: "plum & cream", primary: "#3A2334", secondary: "#F4F0F2", accent: "#C2799C" },
    { name: "olive & rust", primary: "#33381F", secondary: "#F2F2E8", accent: "#B15A34" },
    { name: "walnut & sage", primary: "#3B2C20", secondary: "#F3F0E9", accent: "#8BA07A" },
    { name: "ink & chili", primary: "#1F1D1C", secondary: "#F0EFED", accent: "#C13B2E" },
  ],

  // The fallback category, and the one most clients actually carry. Kept
  // deliberately broad and safe across any trade — these are the original
  // mass-appeal palettes, which were chosen for exactly this job.
  Other: [
    { name: "deep navy & warm amber", primary: "#12314F", secondary: "#E8EDF2", accent: "#E39A2B" },
    { name: "forest green & cream", primary: "#1E4635", secondary: "#F2EFE6", accent: "#C9873D" },
    { name: "charcoal & signal red", primary: "#23262B", secondary: "#EFEFEF", accent: "#C8452F" },
    { name: "burgundy & soft gold", primary: "#5C1F2B", secondary: "#F4EFE9", accent: "#C8A24A" },
    { name: "slate & teal", primary: "#232A30", secondary: "#EFF1F3", accent: "#2E8A86" },
    { name: "plum & gold", primary: "#3A2440", secondary: "#F2F0F3", accent: "#C8A24A" },
    { name: "pine & clay", primary: "#1E3329", secondary: "#EFF1ED", accent: "#C07A55" },
    { name: "indigo & amber", primary: "#1E2747", secondary: "#EEF0F5", accent: "#DFA33A" },
    { name: "umber & sky", primary: "#38291F", secondary: "#F2EFEB", accent: "#5D93B8" },
    { name: "ink & rose", primary: "#1C1E24", secondary: "#EEEFF2", accent: "#C9707F" },
    { name: "moss & sand", primary: "#27331F", secondary: "#F0F2EA", accent: "#C6AE6B" },
    { name: "harbour & coral", primary: "#17384B", secondary: "#EDF2F5", accent: "#E5705C" },
  ],
}

/** Falls back to the broad pool for any category without its own. */
export function palettePoolFor(category: BusinessCategory | undefined): Palette[] {
  return (category && PALETTES_BY_CATEGORY[category]) || PALETTES_BY_CATEGORY.Other
}
