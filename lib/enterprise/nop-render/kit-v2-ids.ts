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

export function isNopV2Template(v: string): v is NopV2Id {
  return (NOP_V2_TEMPLATES as string[]).includes(v)
}

/** Which flyers an agent's Home and Create show (from the admin flyer settings). */
export interface AgentFlyerKit {
  kit: "v1" | "v2"
  /** Kit v2 only: whether the Spanish flyers are switched on for agents. */
  spanish: boolean
}

/** "NOP2_P2_EN_PRICE" -> its parts, without file access (for the browser). */
export function v2IdParts(id: NopV2Id): { pkg: NopV2Pkg; lang: NopV2Lang; pricing: NopV2Pricing } {
  const [, pkg, lang, pricing] = id.split("_") as [string, NopV2Pkg, NopV2Lang, NopV2Pricing]
  return { pkg, lang, pricing }
}
