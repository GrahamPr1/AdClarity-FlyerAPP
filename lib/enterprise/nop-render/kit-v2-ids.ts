// Kit-v2 template ids, with no file access, so admin pages in the browser can list them.
export const NOP_V2_PACKAGES = ["P1", "P2", "P3"] as const
export const NOP_V2_LANGS = ["EN", "ES"] as const
export const NOP_V2_PRICING = ["PRICE", "NOPRICE"] as const
export type NopV2Pkg = (typeof NOP_V2_PACKAGES)[number]
export type NopV2Lang = (typeof NOP_V2_LANGS)[number]
export type NopV2Pricing = (typeof NOP_V2_PRICING)[number]
export type NopV2Id = `NOP2_${NopV2Pkg}_${NopV2Lang}_${NopV2Pricing}`

export const NOP_V2_TEMPLATES: NopV2Id[] = NOP_V2_PACKAGES.flatMap((p) =>
  NOP_V2_LANGS.flatMap((l) => NOP_V2_PRICING.map((pr) => `NOP2_${p}_${l}_${pr}` as NopV2Id)),
)
