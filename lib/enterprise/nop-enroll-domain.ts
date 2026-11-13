import { Redis } from "@upstash/redis"
import { AGENT_ID_RE, DEFAULT_ENROLL_DOMAIN, ENROLL_ID_TOKEN, enrollTargetsKey, isGenerationStatus, isValidEnrollDomain, legacyEnrollTargets, printedEnrollAddress, programEnrollmentUrl, qrDestinationFor, type EnrollTargets } from "./nop-roster"
import { FOOTER_SPACE_PX, addressFitsKitV2Footer, footerAddressWorstWidth, linesFitKitV2Footer, linkWidth } from "./nop-render/footer-fit"
import { getRosterRecord } from "./agents-store"

// The NOP enrollment setting, in three parts (EnrollTargets in nop-roster.ts):
// the forward URL template, the printed address (a short template, or the
// agent's oneflyer.org/a/<code> link) and the program page. The QR forward
// (/a/{code}), the address printed on both kits, the lead page's "Enroll now",
// the roster import check and the program's own page all read it here.
// OneFlyer admin only.
//
//   nop-flyers:settings              hash: enrollSettings (JSON, the three-part
//                                    setting once saved); enrollDomain (the old
//                                    single domain, which the setting is
//                                    derived from until then)
//   nop-flyers:enroll-settings-log   list, newest first: every save, kept
//   nop-flyers:enroll-domain-log     list: the old domain setting's changes, kept
//
// A save is refused unless the test agent's forward URL, the printed address
// (short template) and the program page load right now (live HTTP requests),
// and unless the printed address fits both kits for the longest possible
// Agent ID or code. Whether the test agent's enrollment page shows a real
// partner needs a browser (it's drawn by script): nop-enroll-check.ts.

const redis = Redis.fromEnv()
const KEY = "nop-flyers:settings"
const LOG_KEY = "nop-flyers:enroll-domain-log"
const SETTINGS_LOG_KEY = "nop-flyers:enroll-settings-log"

/** The default check agent (the program's original test ID); admin can set another (getCheckAgentId). */
export const ENROLL_CHECK_AGENT_ID = "858980"

/** The old single enrollment domain: only what the setting is derived from until it's saved in three parts. */
export async function getEnrollDomain(): Promise<string> {
  const v = await redis.hget<string>(KEY, "enrollDomain")
  return v && isValidEnrollDomain(v) ? v : DEFAULT_ENROLL_DOMAIN
}

export interface SavedEnrollSettings extends EnrollTargets {
  savedAt: string
  admin: string
}

/** The setting as saved in three parts, or null while it's still derived from the old domain. */
export async function getSavedEnrollSettings(): Promise<SavedEnrollSettings | null> {
  const raw = await redis.hget<unknown>(KEY, "enrollSettings")
  const v = typeof raw === "string" ? (JSON.parse(raw) as unknown) : raw
  if (!v || typeof v !== "object") return null
  const checked = checkEnrollInput(v as Record<string, unknown>)
  return checked.ok ? { ...checked.targets, savedAt: String((v as SavedEnrollSettings).savedAt ?? ""), admin: String((v as SavedEnrollSettings).admin ?? "") } : null
}

/** The setting, and whether it's been saved in three parts (kit v1.1.1 prints differently once it has). */
export async function getEnrollState(): Promise<{ targets: EnrollTargets; saved: boolean }> {
  const saved = await getSavedEnrollSettings()
  if (saved) return { targets: { forwardTemplate: saved.forwardTemplate, printed: saved.printed, printedTemplate: saved.printedTemplate, programUrl: saved.programUrl }, saved: true }
  return { targets: legacyEnrollTargets(await getEnrollDomain()), saved: false }
}

/** What every caller uses: the saved three-part setting, else derived from the old domain (unchanged behavior). */
export async function getEnrollTargets(): Promise<EnrollTargets> {
  return (await getEnrollState()).targets
}

export type EnrollField = "forwardTemplate" | "printed" | "printedTemplate" | "programUrl"

/**
 * Basic Benefits' test enrollment site (11/2026). Allowed only in local and
 * test runs, never on Vercel (production or preview), so it can't be saved
 * where real agents' QRs would follow it.
 */
export const TEST_ENROLL_HOSTS = ["nop.v4test.vasquezplatform.com"]

export function isAllowedEnrollHost(host: string): boolean {
  return isValidEnrollDomain(host) || (!process.env.VERCEL && TEST_ENROLL_HOSTS.includes(host))
}

const allowedHttpsUrl = (v: string): URL | null => {
  try {
    const u = new URL(v)
    return u.protocol === "https:" && !u.port && !u.username && !u.hash && isAllowedEnrollHost(u.hostname) ? u : null
  } catch {
    return null
  }
}

/**
 * Validates the three parts (no network). The forward template is an https
 * basicbenefits.com URL with exactly one {id} (path or query). What the
 * kit-v2 footer prints: "full", the forward URL itself on two lines (it must
 * have a "?" to split at, and its first line must fit at 15px); "short", a
 * host/path ending in "/{id}" with no scheme or query that fits for a
 * realistic 16-character Agent ID; or "code", the agent's oneflyer.org/a/<code>.
 * (Kit v1.1.1 prints the code link once the setting is saved.) The program
 * page is an https basicbenefits.com URL.
 */
export function checkEnrollInput(raw: Record<string, unknown>): { ok: true; targets: EnrollTargets } | { ok: false; field: EnrollField; message: string } {
  const str = (k: string) => (typeof raw[k] === "string" ? (raw[k] as string).trim() : "")
  const forwardTemplate = str("forwardTemplate")
  if (forwardTemplate.length > 300 || forwardTemplate.split(ENROLL_ID_TOKEN).length !== 2 || !allowedHttpsUrl(forwardTemplate.replace(ENROLL_ID_TOKEN, "CP-VLN-H5J"))) {
    return { ok: false, field: "forwardTemplate", message: "Enter the forward URL as https://, a basicbenefits.com host, with {id} exactly once where the Agent ID goes, like https://neighbor.basicbenefits.com/member-enrollment?agent_code={id}." }
  }
  const printed = raw.printed
  if (printed !== "full" && printed !== "short" && printed !== "code") return { ok: false, field: "printed", message: "Choose what the flyers print." }
  let printedTemplate: string | null = null
  if (printed === "full") {
    const line1 = forwardTemplate.replace(/^https:\/\//, "").split("?")[0]
    if (!forwardTemplate.includes("?")) return { ok: false, field: "printed", message: "The full URL prints on two lines, split before the \"?\": this forward URL has no \"?\". Choose a short address or the agent's OneFlyer link." }
    if (!linesFitKitV2Footer([line1])) return { ok: false, field: "printed", message: `The first line (${line1}) is about ${Math.round(linkWidth(line1))}px wide at 15px; the kit-v2 footer has ${Math.floor(FOOTER_SPACE_PX)}px.` }
  }
  if (printed === "short") {
    printedTemplate = str("printedTemplate").replace(/^https?:\/\//i, "")
    const m = /^([A-Za-z0-9.-]+)((?:\/[a-z0-9._~-]+)*)\/\{id\}$/.exec(printedTemplate)
    if (m) printedTemplate = `${m[1].toLowerCase()}${m[2]}/${ENROLL_ID_TOKEN}`
    if (!m || !isAllowedEnrollHost(m[1].toLowerCase())) return { ok: false, field: "printedTemplate", message: "Enter the printed address without https://, a basicbenefits.com host, ending in /{id}, like join.basicbenefits.com/{id}." }
    const prefix = printedTemplate.slice(0, -ENROLL_ID_TOKEN.length)
    if (!addressFitsKitV2Footer(prefix, "id")) return { ok: false, field: "printedTemplate", message: `With a 16-character Agent ID the printed address is about ${Math.round(footerAddressWorstWidth(prefix, "id"))}px wide; the kit-v2 footer has ${Math.floor(FOOTER_SPACE_PX)}px.` }
  }
  const programUrl = str("programUrl")
  if (programUrl.length > 300 || !allowedHttpsUrl(programUrl) || programUrl.includes(ENROLL_ID_TOKEN)) {
    return { ok: false, field: "programUrl", message: "Enter the program page as https:// with a basicbenefits.com host, like https://neighbor.basicbenefits.com/." }
  }
  return { ok: true, targets: { forwardTemplate, printed, printedTemplate, programUrl } }
}

// ---- The check agent --------------------------------------------------------
// Whose forward URL the save check, "Check the test agent's page" and the
// kit-v2 switch open: any active roster agent, admin-set and logged
// (default 858980, the program's original test ID).

const CHECK_AGENT_LOG_KEY = "nop-flyers:check-agent-log"

export async function getCheckAgentId(): Promise<string> {
  const v = await redis.hget<unknown>(KEY, "checkAgentId")
  const id = v == null ? "" : String(v)
  return AGENT_ID_RE.test(id) ? id : ENROLL_CHECK_AGENT_ID
}

export interface CheckAgentLogEntry {
  at: string
  admin: string
  from: string
  to: string
}

export async function setCheckAgentId(raw: string, admin: string): Promise<{ ok: true; entry: CheckAgentLogEntry } | { ok: false; message: string }> {
  const to = raw.trim()
  if (!AGENT_ID_RE.test(to)) return { ok: false, message: "Enter an Agent ID exactly as issued: letters, numbers and dashes." }
  const roster = await getRosterRecord(to)
  if (!roster) return { ok: false, message: `${to} isn't on the roster.` }
  if (!isGenerationStatus(roster)) return { ok: false, message: `${to} is ${roster.status}, not active.` }
  const entry: CheckAgentLogEntry = { at: new Date().toISOString(), admin, from: await getCheckAgentId(), to }
  await redis.hset(KEY, { checkAgentId: to })
  await redis.lpush(CHECK_AGENT_LOG_KEY, entry)
  console.log(`[nop] ${admin} set the enrollment check agent ${entry.from} -> ${to}`)
  return { ok: true, entry }
}

export async function listCheckAgentLog(limit = 50): Promise<CheckAgentLogEntry[]> {
  return redis.lrange<CheckAgentLogEntry>(CHECK_AGENT_LOG_KEY, 0, limit - 1)
}

export interface UrlCheck {
  url: string
  ok: boolean
  /** HTTP status after redirects, or null when nothing answered. */
  status: number | null
  error: string | null
}

/** Whether a URL loads now: any answer below 400 after redirects, within 10s. */
export async function checkUrlLoads(url: string): Promise<UrlCheck> {
  try {
    const res = await fetch(url, { method: "GET", redirect: "follow", cache: "no-store", signal: AbortSignal.timeout(10_000), headers: { "User-Agent": "OneFlyer enrollment-link check" } })
    await res.body?.cancel().catch(() => undefined)
    return { url, ok: res.status < 400, status: res.status, error: res.status < 400 ? null : `HTTP ${res.status}` }
  } catch (err) {
    const cause = err instanceof Error ? ((err.cause as { code?: string } | undefined)?.code ?? err.name) : String(err)
    return { url, ok: false, status: null, error: cause === "ENOTFOUND" ? "the domain doesn't resolve (no DNS record)" : cause === "TimeoutError" ? "no answer within 10 seconds" : cause }
  }
}

/**
 * The URLs a setting must serve, for the check agent: their forward URL, the
 * printed address when it's a short template (people type it in), and the
 * program page. A "code" printed address is OneFlyer's own link, which
 * forwards like the QR.
 */
export function enrollUrlsToCheck(t: EnrollTargets, checkAgentId: string): { agent: string; printed: string | null; program: string } {
  return {
    agent: qrDestinationFor(checkAgentId, t),
    printed: t.printed === "short" ? printedEnrollAddress(checkAgentId, "", t).href : null,
    program: programEnrollmentUrl(t),
  }
}

export async function checkEnrollTargets(t: EnrollTargets, checkAgentId: string): Promise<{ ok: boolean; checks: UrlCheck[] }> {
  const urls = enrollUrlsToCheck(t, checkAgentId)
  const list = [...new Set([urls.agent, urls.printed, urls.program].filter((u): u is string => !!u))]
  const checks = await Promise.all(list.map(checkUrlLoads))
  return { ok: checks.every((c) => c.ok), checks }
}

export interface EnrollDomainLogEntry {
  at: string
  admin: string
  from: string
  to: string
  checks: UrlCheck[]
}

export async function listEnrollDomainLog(limit = 50): Promise<EnrollDomainLogEntry[]> {
  return redis.lrange<EnrollDomainLogEntry>(LOG_KEY, 0, limit - 1)
}

export interface EnrollSettingsLogEntry {
  at: string
  admin: string
  from: EnrollTargets
  to: EnrollTargets
  checks: UrlCheck[]
  /** What the test agent's enrollment page showed, and whether the admin saved despite a warning. */
  page: { url: string; ok: boolean; problem: string | null; text: string } | null
  savedDespiteWarning: boolean
}

/** Keeps a checked setting (the route has run every check) and logs it. */
export async function saveEnrollTargets(t: EnrollTargets, admin: string, checks: UrlCheck[], page: EnrollSettingsLogEntry["page"], savedDespiteWarning: boolean): Promise<EnrollSettingsLogEntry> {
  const entry: EnrollSettingsLogEntry = { at: new Date().toISOString(), admin, from: await getEnrollTargets(), to: t, checks, page, savedDespiteWarning }
  await redis.hset(KEY, { enrollSettings: JSON.stringify({ ...t, savedAt: entry.at, admin }) })
  await redis.lpush(SETTINGS_LOG_KEY, entry)
  console.log(`[nop] ${admin} saved the enrollment setting ${enrollTargetsKey(t)}`)
  return entry
}

export async function listEnrollSettingsLog(limit = 50): Promise<EnrollSettingsLogEntry[]> {
  return redis.lrange<EnrollSettingsLogEntry>(SETTINGS_LOG_KEY, 0, limit - 1)
}
