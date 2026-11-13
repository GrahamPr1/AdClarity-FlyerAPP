import { randomBytes } from "node:crypto"
import { LAYOUTS, SLOTS, type Layout } from "./slots"
import type { ApLang } from "../types"

// An org's flyer content: packages entered by an admin, each filling one kit
// layout. Pure checks only; storage is lib/ap/store.ts, measured fit is render.ts.
//
// Languages: a package carries a variant for EVERY language the org has
// enabled, and none for a language it hasn't. An English-only org therefore
// never collects Spanish slots, can't be approved with them, and can't
// generate Spanish flyers (templatesFor lists only enabled languages).

export const PRICINGS = ["price", "noprice"] as const
export type Pricing = (typeof PRICINGS)[number]
export const SIZES = ["letter", "bleed"] as const
export type Size = (typeof SIZES)[number]

export type SlotValues = Record<string, string>

export interface ApPackage {
  id: string
  layout: Layout
  /** One per enabled org language; every slot of the layout filled. */
  variants: Partial<Record<ApLang, SlotValues>>
  /** Which variants the org offers for this package. */
  pricing: Pricing[]
}

export interface ApContent {
  packages: ApPackage[]
  updatedAt: string
  updatedBy: string
}

export const MAX_PACKAGES = 6
export const AMOUNT_RE = /^\$[0-9]{1,4}$/

export type ContentCheck = { ok: true; value: ApPackage[] } | { ok: false; errors: { path: string; error: string }[] }

const clean = (v: string) => !/[\u0000-\u001f\u007f]/.test(v)

/** Every package, every enabled language, every slot: present, within budget, no control characters. */
export function checkPackages(raw: unknown, orgLangs: ApLang[]): ContentCheck {
  const errors: { path: string; error: string }[] = []
  const list = Array.isArray(raw) ? raw : null
  if (!list) return { ok: false, errors: [{ path: "packages", error: "Expected a list of packages." }] }
  if (list.length > MAX_PACKAGES) errors.push({ path: "packages", error: `At most ${MAX_PACKAGES} packages.` })
  const out: ApPackage[] = []
  const ids = new Set<string>()
  list.forEach((p: Record<string, unknown>, i) => {
    const at = `packages[${i}]`
    const layout = p?.layout
    if (!(LAYOUTS as readonly unknown[]).includes(layout)) return errors.push({ path: `${at}.layout`, error: "Choose P1, P2 or P3." })
    const id = typeof p.id === "string" && /^pkg_[A-Za-z0-9_-]{6,20}$/.test(p.id) ? p.id : `pkg_${randomBytes(6).toString("base64url")}`
    if (ids.has(id)) return errors.push({ path: `${at}.id`, error: "Duplicate package id." })
    ids.add(id)
    const pricing = Array.isArray(p.pricing) ? PRICINGS.filter((x) => (p.pricing as unknown[]).includes(x)) : []
    if (pricing.length === 0) errors.push({ path: `${at}.pricing`, error: "Offer price, no-price or both." })
    const variantsIn = (p.variants && typeof p.variants === "object" ? p.variants : {}) as Record<string, unknown>
    for (const extra of Object.keys(variantsIn)) {
      if (!orgLangs.includes(extra as ApLang)) errors.push({ path: `${at}.variants.${extra}`, error: `This org doesn't have ${extra} enabled; remove it.` })
    }
    const variants: Partial<Record<ApLang, SlotValues>> = {}
    for (const lang of orgLangs) {
      const v = (variantsIn[lang] && typeof variantsIn[lang] === "object" ? variantsIn[lang] : {}) as Record<string, unknown>
      const values: SlotValues = {}
      for (const slot of SLOTS[layout as Layout]) {
        const path = `${at}.variants.${lang}.${slot.key}`
        const s = typeof v[slot.key] === "string" ? (v[slot.key] as string).trim().replace(/\s+/g, " ") : ""
        if (!s) errors.push({ path, error: "Required." })
        else if (slot.budget === "amount" ? !AMOUNT_RE.test(s) : s.length > slot.budget) errors.push({ path, error: slot.budget === "amount" ? "A price like $36 ($ and 1-4 digits)." : `At most ${slot.budget} characters (got ${s.length}).` })
        else if (!clean(s)) errors.push({ path, error: "Contains control characters." })
        values[slot.key] = s
      }
      for (const k of Object.keys(v)) if (!SLOTS[layout as Layout].some((s) => s.key === k)) errors.push({ path: `${at}.variants.${lang}.${k}`, error: "Not a slot of this layout." })
      variants[lang] = values
    }
    // Prices are the same in every language.
    const amounts = SLOTS[layout as Layout].filter((s) => s.budget === "amount").map((s) => s.key)
    for (const k of amounts) {
      const seen = new Set(orgLangs.map((l) => variants[l]?.[k]))
      if (seen.size > 1) errors.push({ path: `${at}.${k}`, error: "Prices must match in every language." })
    }
    out.push({ id, layout: layout as Layout, variants, pricing })
  })
  return errors.length ? { ok: false, errors } : { ok: true, value: out }
}

/** "{pkgId}_{LANG}_{PRICE|NOPRICE}" */
export type TemplateId = string

export function templateId(pkgId: string, lang: ApLang, pricing: Pricing): TemplateId {
  return `${pkgId}_${lang.toUpperCase()}_${pricing.toUpperCase()}`
}

export function parseTemplateId(id: string): { pkgId: string; lang: ApLang; pricing: Pricing } | null {
  const m = /^(pkg_[A-Za-z0-9_-]{6,20})_(EN|ES)_(PRICE|NOPRICE)$/.exec(id)
  return m ? { pkgId: m[1], lang: m[2].toLowerCase() as ApLang, pricing: m[3].toLowerCase() as Pricing } : null
}

/** Every flyer this content offers, for these languages only. */
export function templatesFor(packages: ApPackage[], orgLangs: ApLang[]): { id: TemplateId; pkg: ApPackage; lang: ApLang; pricing: Pricing }[] {
  return packages.flatMap((pkg) => orgLangs.filter((l) => pkg.variants[l]).flatMap((lang) => pkg.pricing.map((pricing) => ({ id: templateId(pkg.id, lang, pricing), pkg, lang, pricing }))))
}

export const ORG_CODE_RE = /^[A-Z]{2,6}$/

/** "SBC-P1-EN · 11/2026": generated, never typed. */
export function versionStamp(orgCode: string, layout: Layout, lang: ApLang, approvedAt: Date | null): string {
  const when = approvedAt ?? new Date()
  return `${orgCode}-${layout}-${lang.toUpperCase()} · ${String(when.getUTCMonth() + 1).padStart(2, "0")}/${when.getUTCFullYear()}`
}
