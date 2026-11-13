import { AP_LANGS, AP_TIERS, ORG_STATUSES, type ApEnrollment, type ApFooter, type ApLang, type ApTier, type ApTierRules, type OrgStatus } from "./types"

// Pure input checks for the agent platform. No Redis, no request. Every
// limit is a hard rejection: nothing is trimmed to fit or silently changed.

export const ID_TOKEN = "{id}"

export const LIMITS = {
  orgName: 60,
  slug: { min: 3, max: 40 },
  footerLine: 40,
  agentName: 40,
  externalId: 32,
  url: 300,
  param: 32,
  fileName: 120,
} as const

export const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/
/** Slugs that would shadow fixed /ap routes. */
const RESERVED_SLUGS = new Set(["q", "api", "admin", "static", "new"])
/** Same rule NOP uses for issued IDs: letters, digits, dashes, kept exactly as issued. */
export const EXTERNAL_ID_RE = /^[A-Za-z0-9-]{1,32}$/
export const PARAM_RE = /^[A-Za-z][A-Za-z0-9_]{0,31}$/
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export type Check<T> = { ok: true; value: T } | { ok: false; field: string; error: string }
const bad = (field: string, error: string) => ({ ok: false as const, field, error })

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "")
/** No control characters (they print as nothing and break fit measurements). */
const clean = (v: string) => !/[\u0000-\u001f\u007f]/.test(v)

export function normalizeEmail(v: unknown): string {
  return str(v).toLowerCase()
}

export function isEmail(v: string): boolean {
  return v.length <= 254 && EMAIL_RE.test(v)
}

/** (XXX) XXX-XXXX, or null when it isn't a 10-digit US number (an optional leading 1 is allowed). */
export function formatUsPhone(v: string): string | null {
  let d = v.replace(/\D/g, "")
  if (d.length === 11 && d.startsWith("1")) d = d.slice(1)
  if (d.length !== 10) return null
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`
}

export function checkSlug(v: unknown): Check<string> {
  const s = str(v).toLowerCase()
  if (s.length < LIMITS.slug.min || s.length > LIMITS.slug.max) return bad("slug", `Slug must be ${LIMITS.slug.min}-${LIMITS.slug.max} characters.`)
  if (!SLUG_RE.test(s)) return bad("slug", "Slug may use lowercase letters, digits and dashes, and can't start or end with a dash.")
  if (RESERVED_SLUGS.has(s)) return bad("slug", `"${s}" is reserved.`)
  return { ok: true, value: s }
}

function checkText(field: string, v: unknown, max: number, required = true): Check<string> {
  const s = str(v)
  if (required && !s) return bad(field, "Required.")
  if (s.length > max) return bad(field, `At most ${max} characters (got ${s.length}).`)
  if (!clean(s)) return bad(field, "Contains control characters.")
  return { ok: true, value: s }
}

function httpsUrl(v: string): URL | null {
  try {
    const u = new URL(v)
    return u.protocol === "https:" && !u.username && !u.password && !u.port ? u : null
  } catch {
    return null
  }
}

const tokenCount = (s: string) => s.split(ID_TOKEN).length - 1

export function checkEnrollment(v: unknown): Check<ApEnrollment> {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>
  const forwardTemplate = str(o.forwardTemplate)
  if (forwardTemplate.length > LIMITS.url) return bad("enrollment.forwardTemplate", `At most ${LIMITS.url} characters.`)
  if (tokenCount(forwardTemplate) !== 1) return bad("enrollment.forwardTemplate", `Must contain ${ID_TOKEN} exactly once.`)
  if (!httpsUrl(forwardTemplate.replace(ID_TOKEN, "TEST-1"))) return bad("enrollment.forwardTemplate", "Must be an https URL (no port or credentials).")

  const printed = o.printed
  if (printed !== "full" && printed !== "short" && printed !== "code") return bad("enrollment.printed", "Choose full, short or code.")

  let printedTemplate: string | null = null
  if (printed === "short") {
    printedTemplate = str(o.printedTemplate).replace(/^https?:\/\//, "")
    if (printedTemplate.length > LIMITS.url) return bad("enrollment.printedTemplate", `At most ${LIMITS.url} characters.`)
    if (tokenCount(printedTemplate) !== 1 || !printedTemplate.endsWith(ID_TOKEN)) return bad("enrollment.printedTemplate", `Must end with ${ID_TOKEN} (and contain it once).`)
    if (!httpsUrl(`https://${printedTemplate.replace(ID_TOKEN, "TEST-1")}`)) return bad("enrollment.printedTemplate", "Must be a host and path, e.g. join.example.com/{id}.")
  }

  const programUrl = str(o.programUrl)
  if (programUrl.length > LIMITS.url || !httpsUrl(programUrl)) return bad("enrollment.programUrl", "Must be an https URL.")
  if (programUrl.includes(ID_TOKEN)) return bad("enrollment.programUrl", `The program page can't contain ${ID_TOKEN}.`)

  return { ok: true, value: { forwardTemplate, printed, printedTemplate, programUrl } }
}

export function checkLanguages(v: unknown): Check<ApLang[]> {
  const list = Array.isArray(v) ? v : []
  const langs = AP_LANGS.filter((l) => list.includes(l))
  if (langs.length === 0 || langs.length !== new Set(list).size) return bad("languages", "Pick at least one of en, es (no others).")
  return { ok: true, value: langs }
}

export function checkFooter(v: unknown): Check<ApFooter> {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>
  const programLine = checkText("footer.programLine", o.programLine, LIMITS.footerLine)
  if (!programLine.ok) return programLine
  const taglineLine = checkText("footer.taglineLine", o.taglineLine, LIMITS.footerLine)
  if (!taglineLine.ok) return taglineLine
  return { ok: true, value: { programLine: programLine.value, taglineLine: taglineLine.value } }
}

export function isTier(v: unknown): v is ApTier {
  return typeof v === "string" && (AP_TIERS as readonly string[]).includes(v)
}

export function isOrgStatus(v: unknown): v is OrgStatus {
  return typeof v === "string" && (ORG_STATUSES as readonly string[]).includes(v)
}

export function checkTierRules(v: unknown): Check<ApTierRules> {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>
  if (!isTier(o.defaultTier)) return bad("tierRules.defaultTier", "Choose basic or pro.")
  if (o.signupApproval !== "auto" && o.signupApproval !== "admin") return bad("tierRules.signupApproval", "Choose auto or admin.")
  return { ok: true, value: { defaultTier: o.defaultTier, signupApproval: o.signupApproval } }
}

export interface OrgConfigInput {
  name: string
  slug: string
  enrollment: ApEnrollment
  agentIdParam: string
  languages: ApLang[]
  footer: ApFooter
  tierRules: ApTierRules
}

/** The whole editable org config (create and edit). Status, logo and files have their own routes. */
export function checkOrgConfig(v: unknown): Check<OrgConfigInput> {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>
  const name = checkText("name", o.name, LIMITS.orgName)
  if (!name.ok) return name
  const slug = checkSlug(o.slug)
  if (!slug.ok) return slug
  const enrollment = checkEnrollment(o.enrollment)
  if (!enrollment.ok) return enrollment
  const agentIdParam = str(o.agentIdParam)
  if (!PARAM_RE.test(agentIdParam)) return bad("agentIdParam", "A query parameter name: a letter, then letters, digits or _ (max 32).")
  const languages = checkLanguages(o.languages)
  if (!languages.ok) return languages
  const footer = checkFooter(o.footer)
  if (!footer.ok) return footer
  const tierRules = checkTierRules(o.tierRules)
  if (!tierRules.ok) return tierRules
  return {
    ok: true,
    value: { name: name.value, slug: slug.value, enrollment: enrollment.value, agentIdParam, languages: languages.value, footer: footer.value, tierRules: tierRules.value },
  }
}

export interface SignupInput {
  externalId: string
  name: string
  phone: string
  email: string
  lang: ApLang
  ref: string | null
}

export function checkSignup(v: unknown, orgLangs: ApLang[]): Check<SignupInput> {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>
  const externalId = str(o.externalId)
  if (!EXTERNAL_ID_RE.test(externalId)) return bad("externalId", "Agent ID: letters, digits and dashes, up to 32.")
  const name = checkText("name", o.name, LIMITS.agentName)
  if (!name.ok) return name
  const phone = formatUsPhone(str(o.phone))
  if (!phone) return bad("phone", "A 10-digit US phone number.")
  const email = normalizeEmail(o.email)
  if (!isEmail(email)) return bad("email", "A valid email address.")
  const lang = orgLangs.includes(o.lang as ApLang) ? (o.lang as ApLang) : orgLangs[0]
  const ref = typeof o.ref === "string" && /^[A-Za-z0-9]{6,12}$/.test(o.ref) ? o.ref : null
  return { ok: true, value: { externalId, name: name.value, phone, email, lang, ref } }
}

/** ?{param}=<id> on an org's sign-up link, case-insensitive on the name. One valid value or null. */
export function externalIdFromQuery(query: URLSearchParams, param: string): string | null {
  const values = [...query.entries()].filter(([k]) => k.toLowerCase() === param.toLowerCase()).map(([, v]) => v.trim())
  return values.length === 1 && EXTERNAL_ID_RE.test(values[0]) ? values[0] : null
}

/** The agent's enrollment URL. */
export function enrollmentUrlFor(e: ApEnrollment, externalId: string): string {
  return e.forwardTemplate.replace(ID_TOKEN, encodeURIComponent(externalId))
}

export function isLang(v: unknown): v is ApLang {
  return typeof v === "string" && (AP_LANGS as readonly string[]).includes(v)
}

export { ORG_STATUSES }
