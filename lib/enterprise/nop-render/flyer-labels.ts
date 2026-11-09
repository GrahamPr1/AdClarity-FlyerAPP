import type { NopLang, NopStringKey } from "@/lib/enterprise/nop-i18n"
import { NOP_V2_PACKAGES, NOP_V2_PRICING, v2IdParts, type AgentFlyerKit, type NopV2Id } from "./kit-v2-ids"

// Which flyers an agent's dashboard lists and what each card is called.
// No file access: used by the client dashboard and the server pages alike.

const PACKAGES = ["P1", "P2", "P3", "ALL"] as const
type Pkg = (typeof PACKAGES)[number]

/** The card's two lines: "Package 2" and the package name; kit v2 adds with/without prices. */
export function flyerLabels(template: string): { eyebrow: NopStringKey; name: NopStringKey; pricing: NopStringKey | null } {
  if (template.startsWith("NOP2_")) {
    const { pkg, pricing } = v2IdParts(template as NopV2Id)
    return { eyebrow: `pkg.${pkg}`, name: `pkg2.${pkg}_name`, pricing: pricing === "PRICE" ? "flyer.with_prices" : "flyer.without_prices" }
  }
  const pkg = template.split("_")[1] as Pkg
  return { eyebrow: `pkg.${pkg}`, name: `pkg.${pkg}_name`, pricing: null }
}

/** The templates an agent's dashboard lists, in one flyer language. */
export function agentTemplates(kit: AgentFlyerKit, flyerLang: NopLang): string[] {
  const code = flyerLang.toUpperCase()
  if (kit.kit === "v1") return PACKAGES.map((pkg) => `NOP_${pkg}_${code}`)
  return NOP_V2_PACKAGES.flatMap((pkg) => NOP_V2_PRICING.map((pr) => `NOP2_${pkg}_${code}_${pr}`))
}

/** Flyer languages on offer: kit v2's Spanish flyers only once admin turns them on. */
export const flyerLangs = (kit: AgentFlyerKit): NopLang[] => (kit.spanish ? ["en", "es"] : ["en"])
