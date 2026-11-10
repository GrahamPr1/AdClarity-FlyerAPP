import { describe, it, expect } from "vitest"
import { en } from "@/lib/enterprise/nop-i18n/en"
import { es } from "@/lib/enterprise/nop-i18n/es"

/**
 * The Pro screen and upgrade prompts: honest only. No income or earnings
 * claims, no claims about prices or coverage of health plans, no pressure
 * ("limited time", "only today", "last chance"), no numbers other than the
 * Pro price and the trial length, no "Basic Benefits".
 */
const keys = (Object.keys(en) as (keyof typeof en)[]).filter((k) => k.startsWith("pro."))

describe("Pro wording", () => {
  it("no income, earnings, coverage or pressure language (EN and ES)", () => {
    const banned = /\b(earn\w*|income|money|commission\w*|profit\w*|cash|guarantee\w*|coverage|cover(ed|s)?|plan prices?|save \$|limited time|only today|last chance|hurry|act now|ganar|gane|ganancia\w*|ingreso\w*|dinero|comisi[oó]n\w*|garant\w*|cobertura|tiempo limitado|última oportunidad|apúrese)\b/i
    expect(keys.length).toBeGreaterThan(20)
    for (const k of keys) {
      const both = `${en[k]} || ${es[k as keyof typeof es]}`
      expect(banned.test(both), `${k}: ${both}`).toBe(false)
      expect(/basic benefits/i.test(both), k).toBe(false)
    }
  })

  it("the only figures are the $40 price and the trial's {days}", () => {
    for (const k of keys) {
      for (const v of [en[k], es[k as keyof typeof es]]) {
        const figures = v.replace(/\{days\}/g, "").match(/\$?\d+/g) ?? []
        expect(figures.every((f) => f === "$40"), `${k}: ${v}`).toBe(true)
      }
    }
  })
})
