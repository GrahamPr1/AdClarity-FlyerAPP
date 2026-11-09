import { Redis } from "@upstash/redis"
import { DEFAULT_ENROLL_DOMAIN, isValidEnrollDomain, programEnrollmentUrl, qrDestinationFor } from "./nop-roster"
import { FOOTER_SPACE_PX, footerLinkWorstWidth, linkFitsKitV2Footer } from "./nop-render/footer-fit"

// The NOP enrollment domain: the ONE setting behind every agent's enrollment
// URL (https://{domain}/{agentId}). The QR forward (/a/{code}), the address
// printed on both kits, the lead page's "Enroll now", the roster import check
// and the program's own page (https://{domain}/) all read it here. OneFlyer
// admin only.
//
//   nop-flyers:settings          hash, field enrollDomain (unset = the kit's default)
//   nop-flyers:enroll-domain-log list, newest first: every save, kept
//
// A save is refused unless both the test agent's URL and the program page
// load right now (a live HTTP request), so a typo can't send every scan to a
// dead page; and unless the printed link still fits the kit-v2 footer for the
// longest possible Agent ID.

const redis = Redis.fromEnv()
const KEY = "nop-flyers:settings"
const LOG_KEY = "nop-flyers:enroll-domain-log"

/** Basic Benefits' test agent: the URL shown and checked for "a test agent's QR". */
export const ENROLL_CHECK_AGENT_ID = "858980"

export async function getEnrollDomain(): Promise<string> {
  const v = await redis.hget<string>(KEY, "enrollDomain")
  return v && isValidEnrollDomain(v) ? v : DEFAULT_ENROLL_DOMAIN
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

/** The two URLs a domain must serve: the test agent's enrollment URL and the program page. */
export function enrollUrlsToCheck(domain: string): { agent: string; program: string } {
  return { agent: qrDestinationFor(ENROLL_CHECK_AGENT_ID, domain), program: programEnrollmentUrl(domain) }
}

export async function checkEnrollDomain(domain: string): Promise<{ ok: boolean; checks: UrlCheck[] }> {
  const urls = enrollUrlsToCheck(domain)
  const checks = await Promise.all([checkUrlLoads(urls.agent), checkUrlLoads(urls.program)])
  return { ok: checks.every((c) => c.ok), checks }
}

export interface EnrollDomainLogEntry {
  at: string
  admin: string
  from: string
  to: string
  checks: UrlCheck[]
}

export type SetEnrollDomainResult =
  | { ok: true; entry: EnrollDomainLogEntry }
  | { ok: false; reason: "invalid" | "not_loading" | "link_too_long"; checks?: UrlCheck[]; linkWidthPx?: number; spacePx?: number }

export async function setEnrollDomain(raw: string, admin: string): Promise<SetEnrollDomainResult> {
  const to = raw.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/+$/, "")
  if (!isValidEnrollDomain(to)) return { ok: false, reason: "invalid" }
  if (!linkFitsKitV2Footer(to)) return { ok: false, reason: "link_too_long", linkWidthPx: Math.round(footerLinkWorstWidth(to)), spacePx: Math.floor(FOOTER_SPACE_PX) }
  const { ok, checks } = await checkEnrollDomain(to)
  if (!ok) return { ok: false, reason: "not_loading", checks }
  const entry: EnrollDomainLogEntry = { at: new Date().toISOString(), admin, from: await getEnrollDomain(), to, checks }
  await redis.hset(KEY, { enrollDomain: to })
  await redis.lpush(LOG_KEY, entry)
  console.log(`[nop] ${admin} set the enrollment domain ${entry.from} -> ${to}`)
  return { ok: true, entry }
}

export async function listEnrollDomainLog(limit = 50): Promise<EnrollDomainLogEntry[]> {
  return redis.lrange<EnrollDomainLogEntry>(LOG_KEY, 0, limit - 1)
}
