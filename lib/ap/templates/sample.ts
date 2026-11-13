import { SLOTS, type Layout } from "./slots"
import type { SlotValues } from "./content"
import type { ApLang } from "../types"

// Obviously fake content for test orgs ("Sample Benefits Co."), sized to
// about 80% of each slot's budget so it exercises real wrapping without
// pressing the limits. Pure, so the admin editor can use it in the browser.

const WORDS: Record<ApLang, string[]> = {
  en: ["sample", "benefit", "coverage", "member", "savings", "care", "plan", "access", "support", "wellness", "everyday", "virtual", "test"],
  es: ["muestra", "beneficio", "cobertura", "miembro", "ahorro", "atención", "plan", "acceso", "apoyo", "bienestar", "diario", "virtual", "prueba"],
}

const FIXED: Record<ApLang, Record<string, string>> = {
  en: {
    "header.programTag": "Sample Benefits Co.",
    "header.packageLabel": "Sample Plan",
    "header.titleLine1": "Sample",
    "header.titleLine2": "test plan.",
    "price.label": "Monthly test price",
    "price.1.label": "Single",
    "price.2.label": "Family",
    "included.label": "What's included",
    "included.line1": "Sample benefits,",
    "included.line2": "one test plan.",
    "steps.label": "How it works",
    "plus.label": "Plus",
    "engage.line1": "Built to help you",
    "engage.line2": "test everything.",
  },
  es: {
    "header.programTag": "Sample Benefits Co.",
    "header.packageLabel": "Plan de muestra",
    "header.titleLine1": "Plan",
    "header.titleLine2": "de prueba.",
    "price.label": "Precio de prueba",
    "price.1.label": "Individual",
    "price.2.label": "Familiar",
    "included.label": "Qué incluye",
    "included.line1": "Beneficios de muestra,",
    "included.line2": "un plan de prueba.",
    "steps.label": "Cómo funciona",
    "plus.label": "Además",
    "engage.line1": "Hecho para ayudarle",
    "engage.line2": "a probarlo todo.",
  },
}

function filler(lang: ApLang, length: number, seed: number): string {
  const w = WORDS[lang]
  let out = ""
  for (let i = seed; out.length < length; i++) out += (out ? " " : "") + w[i % w.length]
  const cut = out.slice(0, length).replace(/\s+\S*$/, "")
  const s = cut.charAt(0).toUpperCase() + cut.slice(1)
  return s.endsWith(".") ? s : `${s}.`
}

export function sampleSlots(layout: Layout, lang: ApLang, prices: string[] = ["$29", "$39"]): SlotValues {
  const out: SlotValues = {}
  let amount = 0
  SLOTS[layout].forEach((slot, i) => {
    if (slot.budget === "amount") out[slot.key] = prices[amount++] ?? "$29"
    else if (FIXED[lang][slot.key]) out[slot.key] = FIXED[lang][slot.key]
    else out[slot.key] = filler(lang, Math.max(8, Math.floor(Math.min(slot.budget, Math.max(...slot.supplied)) * 0.8)), i)
  })
  return out
}
