import { describe, it, expect } from "vitest"
import { en } from "@/lib/enterprise/nop-i18n/en"
import { es } from "@/lib/enterprise/nop-i18n/es"
import { NOP_STRING_WHERE } from "@/lib/enterprise/nop-i18n/where"
import { langFromAcceptLanguage, resolveNopLang, tNop } from "@/lib/enterprise/nop-i18n"

// Strings that are meant to read the same in both languages.
const SAME_IN_BOTH = new Set(["lang.group", "lang.en", "lang.es", "display.phone_placeholder"])
const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()

describe("dictionaries", () => {
  it("es has exactly en's keys (tsc enforces this too)", () => {
    expect(Object.keys(es).sort()).toEqual(Object.keys(en).sort())
  })
  it("no empty strings", () => {
    for (const [k, v] of [...Object.entries(en), ...Object.entries(es)]) expect(v.trim(), k).not.toBe("")
  })
  it("every Spanish string is actually translated", () => {
    const same = Object.keys(en).filter((k) => !SAME_IN_BOTH.has(k) && en[k as keyof typeof en] === es[k as keyof typeof es])
    expect(same).toEqual([])
  })
  it("uses the same placeholders in both languages", () => {
    for (const k of Object.keys(en) as (keyof typeof en)[]) expect(placeholders(es[k]), k).toEqual(placeholders(en[k]))
  })
  it("every key says where it appears", () => {
    expect(Object.keys(NOP_STRING_WHERE).sort()).toEqual(Object.keys(en).sort())
  })
  it("keeps the exact English the registration spec fixes", () => {
    expect(en["err.not_recognized"]).toBe("Agent ID not recognized. Contact your program administrator.")
    expect(en["gen.blocked"]).toBe("NOP flyers are generated from approved templates — coming soon")
  })
  it("uses formal usted, never tú forms", () => {
    const tu = /\b(tú|tu|tus|ti|contigo|eres|tienes|puedes|quieres|ingresa|revisa|intenta|elige|escanea)\b/i
    for (const [k, v] of Object.entries(es)) expect(tu.test(v), `${k}: ${v}`).toBe(false)
  })
  it("uses inscribirse only for customer enrollment", () => {
    const enrol = Object.entries(es).filter(([, v]) => /inscrib|inscrip/i.test(v)).map(([k]) => k)
    expect(enrol).toEqual(["profile.enrollment_link"])
  })
})

describe("language choice", () => {
  it("es* in Accept-Language means Spanish", () => {
    expect(langFromAcceptLanguage("es-MX,es;q=0.9,en;q=0.8")).toBe("es")
    expect(langFromAcceptLanguage("es")).toBe("es")
    expect(langFromAcceptLanguage("es-419")).toBe("es")
  })
  it("uses the highest-q tag, not the first listed", () => {
    expect(langFromAcceptLanguage("en;q=0.5,es-US;q=0.9")).toBe("es")
    expect(langFromAcceptLanguage("es;q=0.4,en-US")).toBe("en")
  })
  it("defaults to English", () => {
    expect(langFromAcceptLanguage(null)).toBe("en")
    expect(langFromAcceptLanguage("")).toBe("en")
    expect(langFromAcceptLanguage("fr-FR,de")).toBe("en")
    expect(langFromAcceptLanguage("estonian-made-up")).toBe("en")
  })
  it("cookie beats saved preference beats browser", () => {
    expect(resolveNopLang({ cookie: "en", preferred: "es", acceptLanguage: "es" })).toEqual({ lang: "en", source: "cookie" })
    expect(resolveNopLang({ preferred: "es", acceptLanguage: "en-US" })).toEqual({ lang: "es", source: "profile" })
    expect(resolveNopLang({ cookie: "fr", acceptLanguage: "es-MX" })).toEqual({ lang: "es", source: "header" })
  })
})

describe("tNop", () => {
  it("fills placeholders", () => {
    expect(tNop("es", "reg.confirm_line", { name: "Ana", agentId: "858980" })).toBe("Se está registrando como Ana, ID de agente 858980.")
    expect(tNop("en", "reg.confirm_line", { name: "Ana", agentId: "858980" })).toBe("You are registering as Ana, Agent ID 858980.")
  })
})
