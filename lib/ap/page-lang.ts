import type { ApLang, ApOrg } from "./types"
import { isLang } from "./validate"

/** ?lang= when the org offers it, else Spanish for an es* browser if offered, else the org's first language. */
export function pageLang(org: ApOrg, langParam: string | undefined, acceptLanguage: string | null): ApLang {
  if (isLang(langParam) && org.languages.includes(langParam)) return langParam
  const top = acceptLanguage?.split(",")[0]?.trim().toLowerCase() ?? ""
  if ((top === "es" || top.startsWith("es-")) && org.languages.includes("es")) return "es"
  return org.languages[0]
}
