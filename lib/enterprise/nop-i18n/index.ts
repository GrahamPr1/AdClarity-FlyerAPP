import { en, type NopStringKey } from "./en"
import { es } from "./es"

// Language for NOP agent-facing screens, server messages and the
// verification email. Pure and dependency-free: the request/cookie side
// lives in ./server.ts, the React side in components/nop-i18n.tsx.

export type NopLang = "en" | "es"
export type { NopStringKey }

export const NOP_LANGS: readonly NopLang[] = ["en", "es"]
/** Remembers an explicit EN/ES choice. Readable by the sign-in page's script, so not httpOnly. */
export const NOP_LANG_COOKIE = "nop_lang"
export const NOP_LANG_COOKIE_MAX_AGE = 60 * 60 * 24 * 365

const DICTS: Record<NopLang, Record<NopStringKey, string>> = { en, es }

export function parseNopLang(v: unknown): NopLang | null {
  return v === "en" || v === "es" ? v : null
}

/**
 * The visitor's top Accept-Language preference, highest q first. Any es*
 * tag (es, es-MX, es-419…) means Spanish; anything else, or nothing, English.
 */
export function langFromAcceptLanguage(header: string | null | undefined): NopLang {
  if (!header) return "en"
  const tags = header
    .split(",")
    .map((part, i) => {
      const [tag, ...params] = part.trim().split(";")
      const q = params.map((p) => p.trim()).find((p) => p.startsWith("q="))
      return { tag: tag.trim().toLowerCase(), q: q ? Number(q.slice(2)) : 1, i }
    })
    .filter((t) => t.tag && t.tag !== "*" && !Number.isNaN(t.q) && t.q > 0)
    .sort((a, b) => b.q - a.q || a.i - b.i)
  const top = tags[0]?.tag ?? ""
  return top === "es" || top.startsWith("es-") ? "es" : "en"
}

export type NopLangSource = "cookie" | "profile" | "header"

/** Explicit choice (cookie) wins, then the registered agent's saved preference, then the browser. */
export function resolveNopLang(input: {
  cookie?: string | null
  preferred?: string | null
  acceptLanguage?: string | null
}): { lang: NopLang; source: NopLangSource } {
  const fromCookie = parseNopLang(input.cookie)
  if (fromCookie) return { lang: fromCookie, source: "cookie" }
  const fromProfile = parseNopLang(input.preferred)
  if (fromProfile) return { lang: fromProfile, source: "profile" }
  return { lang: langFromAcceptLanguage(input.acceptLanguage), source: "header" }
}

/** One string, with {placeholders} filled. Unknown placeholders are left as written. */
export function tNop(lang: NopLang, key: NopStringKey, vars?: Record<string, string | number>): string {
  const s = DICTS[lang][key]
  if (!vars) return s
  return s.replace(/\{(\w+)\}/g, (m, name: string) => (name in vars ? String(vars[name]) : m))
}

export function nopDict(lang: NopLang): Record<NopStringKey, string> {
  return DICTS[lang]
}
