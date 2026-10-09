import { Redis } from "@upstash/redis"
import { sendOperationalAlert } from "@/lib/email"
import { getDeliverablesForEmail } from "@/lib/store"
import { qrDestinationFor } from "@/lib/enterprise/nop-roster"
import { RENDER_CHECK_AGENT } from "@/lib/enterprise/nop-render/test-agent"
import { HEALTH_TOKEN_HEADER, mintHealthToken } from "./health-token"
import { inspectPdf } from "./pdf-check"

// The daily health check (Vercel cron -> /api/cron/health). It downloads one
// NOP flyer (render-check) and one business flyer PDF through the REAL
// production routes over HTTP, each with a single-use token scoped to that
// one request, and checks the files. Any failure — including this code
// itself throwing — emails HEALTHCHECK_ALERT_EMAIL. On Mondays a passing
// run also sends a weekly summary, so a silent week (the cron not running
// at all) is noticeable too.
//
//   health:runs   HealthRun, newest first (last 100)

const redis = Redis.fromEnv()
const RUNS_KEY = "health:runs"
const CHECK_TIMEOUT_MS = 55_000
/** A daily cron that hasn't run for this long missed at least one day. */
const GAP_HOURS = 30

export const NOP_CHECK = { template: "NOP_P2_EN", format: "print" } as const

export interface CheckResult {
  name: "nop-render-check" | "business-pdf"
  ok: boolean
  ms: number
  status: number | null
  detail: string
}

export interface HealthRun {
  at: string
  ok: boolean
  checks: CheckResult[]
  baseUrl: string
  deployment: string
  /** Set when the previous run was more than GAP_HOURS earlier. */
  gapHours?: number
  alert?: { sent: boolean; reason?: string; kind: "failure" | "weekly" }
}

export type Simulate = "nop" | "business" | null

export function healthBaseUrl(): string {
  const configured = process.env.HEALTHCHECK_BASE_URL?.trim()
  if (configured) return configured.replace(/\/+$/, "")
  if (process.env.VERCEL_ENV === "production" && process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`
  return "http://localhost:3000"
}

export const alertRecipient = () => process.env.HEALTHCHECK_ALERT_EMAIL?.trim() || process.env.ALERT_EMAIL?.trim() || undefined

async function timedFetch(url: string, token: string): Promise<{ res: Response | null; body: Buffer | null; ms: number; error?: string }> {
  const t0 = Date.now()
  try {
    const res = await fetch(url, { headers: { [HEALTH_TOKEN_HEADER]: token }, signal: AbortSignal.timeout(CHECK_TIMEOUT_MS), cache: "no-store" })
    const body = Buffer.from(await res.arrayBuffer())
    return { res, body, ms: Date.now() - t0 }
  } catch (err) {
    const timedOut = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError")
    return { res: null, body: null, ms: Date.now() - t0, error: timedOut ? `no response within ${CHECK_TIMEOUT_MS / 1000} s` : err instanceof Error ? err.message : String(err) }
  }
}

function errorText(body: Buffer | null): string {
  if (!body) return ""
  const text = body.toString("utf8", 0, Math.min(body.length, 600))
  try {
    const j = JSON.parse(text) as { error?: string; message?: string }
    return [j.error, j.message].filter(Boolean).join(": ")
  } catch {
    return text.replace(/\s+/g, " ").slice(0, 300)
  }
}

export async function checkNopRender(base: string, simulate: Simulate): Promise<CheckResult> {
  const template = simulate === "nop" ? "NOP_SIMULATED_FAILURE" : NOP_CHECK.template
  const token = await mintHealthToken({ route: "nop-render-check", template, format: NOP_CHECK.format })
  const url = `${base}/api/admin/enterprise/nop/render-check?template=${template}&format=${NOP_CHECK.format}`
  const { res, body, ms, error } = await timedFetch(url, token)
  const fail = (detail: string): CheckResult => ({ name: "nop-render-check", ok: false, ms, status: res?.status ?? null, detail })
  if (!res || !body) return fail(`GET ${url} failed: ${error}`)
  if (res.status !== 200) return fail(`HTTP ${res.status} from ${url}: ${errorText(body)}`)
  const pdf = inspectPdf(body)
  const expectedQr = qrDestinationFor(RENDER_CHECK_AGENT.agentId)
  const problems = [
    !pdf.isPdf && "the response is not a PDF",
    pdf.pages !== 1 && `${pdf.pages} pages (expected 1)`,
    pdf.size !== "630x810" && `page size ${pdf.size} (expected 630x810 pt)`,
    pdf.unembeddedFonts.length > 0 && `fonts not embedded: ${pdf.unembeddedFonts.join(", ")}`,
    res.headers.get("x-render-qr") !== expectedQr && `QR decoded to "${res.headers.get("x-render-qr")}" (expected ${expectedQr})`,
  ].filter(Boolean) as string[]
  if (problems.length) return fail(`${template} ${NOP_CHECK.format}: ${problems.join("; ")}`)
  return { name: "nop-render-check", ok: true, ms, status: 200, detail: `${template} print PDF, 1 page 630x810, ${pdf.fonts} fonts all embedded, QR ok (render ${res.headers.get("x-render-ms")} ms)` }
}

/** The business flyer to download: HEALTHCHECK_BUSINESS_FLYER_ID, else that account's flyer titled "test". */
async function findBusinessFlyer(email: string): Promise<{ id: string; title: string } | string> {
  const flyers = (await getDeliverablesForEmail(email)).flyers
  const pinned = process.env.HEALTHCHECK_BUSINESS_FLYER_ID?.trim()
  const flyer = pinned ? flyers.find((f) => f.id === pinned) : flyers.find((f) => f.title.trim().toLowerCase() === "test" && f.downloadUrl)
  if (!flyer) return pinned ? `flyer ${pinned} not found on ${email}` : `no ready flyer titled "test" on ${email} (${flyers.length} flyers)`
  return { id: flyer.id, title: flyer.title }
}

export async function checkBusinessPdf(base: string, simulate: Simulate): Promise<CheckResult> {
  const t0 = Date.now()
  const email = process.env.HEALTHCHECK_BUSINESS_EMAIL?.trim().toLowerCase()
  if (!email) return { name: "business-pdf", ok: false, ms: 0, status: null, detail: "HEALTHCHECK_BUSINESS_EMAIL is not configured" }
  const found = simulate === "business" ? { id: "health-simulated-missing-flyer", title: "(simulated)" } : await findBusinessFlyer(email)
  if (typeof found === "string") return { name: "business-pdf", ok: false, ms: Date.now() - t0, status: null, detail: found }
  const token = await mintHealthToken({ route: "business-pdf", email, flyerId: found.id, variant: "print" })
  const url = `${base}/api/flyers/${encodeURIComponent(found.id)}/pdf?variant=print&email=${encodeURIComponent(email)}`
  const { res, body, ms, error } = await timedFetch(url, token)
  const fail = (detail: string): CheckResult => ({ name: "business-pdf", ok: false, ms, status: res?.status ?? null, detail })
  const where = `flyer ${found.id} ("${found.title}")`
  if (!res || !body) return fail(`GET ${where} failed: ${error}`)
  if (res.status !== 200) return fail(`HTTP ${res.status} for ${where}: ${errorText(body)}`)
  const pdf = inspectPdf(body)
  const problems = [
    !pdf.isPdf && "the response is not a PDF",
    pdf.pages < 1 && "no pages",
    pdf.fonts === 0 && "no fonts at all",
    pdf.unembeddedFonts.length > 0 && `fonts not embedded: ${pdf.unembeddedFonts.join(", ")}`,
  ].filter(Boolean) as string[]
  if (problems.length) return fail(`${where}: ${problems.join("; ")}`)
  return { name: "business-pdf", ok: true, ms, status: 200, detail: `${where}: PDF, ${pdf.pages} page(s) ${pdf.size}, ${pdf.fonts} fonts all embedded` }
}

export async function listHealthRuns(limit = 30): Promise<HealthRun[]> {
  return redis.lrange<HealthRun>(RUNS_KEY, 0, limit - 1)
}

async function saveRun(run: HealthRun): Promise<void> {
  await redis.lpush(RUNS_KEY, run)
  await redis.ltrim(RUNS_KEY, 0, 99)
}

function failureEmail(run: HealthRun): [string, string[]] {
  const failed = run.checks.filter((c) => !c.ok)
  const subject = `OneFlyer health check FAILED: ${failed.map((c) => c.name).join(" + ") || "the check itself"}`
  const lines = [
    `Time: ${run.at} (UTC)`,
    `Site checked: ${run.baseUrl}`,
    `Deployment: ${run.deployment}`,
    ...run.checks.map((c) => `${c.ok ? "OK" : "FAILED"} — ${c.name} (${c.ms} ms${c.status ? `, HTTP ${c.status}` : ""}): ${c.detail}`),
    ...(run.gapHours ? [`Also: the previous health check ran ${run.gapHours} hours before this one, so at least one daily run was missed.`] : []),
    "Check it now: the NOP flyer and business PDF downloads go through these same routes.",
  ]
  return [subject, lines]
}

function weeklyEmail(run: HealthRun, recent: HealthRun[]): [string, string[]] {
  const week = recent.filter((r) => Date.parse(r.at) > Date.parse(run.at) - 7.5 * 86400_000)
  const passed = week.filter((r) => r.ok).length
  const lines = [
    `Last 7 days: ${week.length} daily run(s), ${passed} passed, ${week.length - passed} failed${week.length < 7 ? ` — ${7 - week.length} day(s) with NO run: check the Vercel cron` : ""}.`,
    ...week.map((r) => `${r.at.slice(0, 16).replace("T", " ")} UTC — ${r.ok ? "passed" : "FAILED"} (${r.checks.map((c) => `${c.name} ${c.ok ? "ok" : "failed"} ${c.ms} ms`).join(", ")})`),
    `Site checked: ${run.baseUrl}`,
  ]
  return [`OneFlyer weekly health summary: ${passed}/${week.length} passed${week.length < 7 ? `, ${7 - week.length} missed` : ""}`, lines]
}

/** Runs both checks, stores the run, and emails on failure (or the Monday summary). Never throws. */
export async function runHealthCheck(opts: { simulate?: Simulate; forceWeekly?: boolean; now?: Date } = {}): Promise<HealthRun> {
  const now = opts.now ?? new Date()
  const base = healthBaseUrl()
  const run: HealthRun = { at: now.toISOString(), ok: false, checks: [], baseUrl: base, deployment: process.env.VERCEL_DEPLOYMENT_ID ?? process.env.VERCEL_URL ?? "local" }
  try {
    const previous = (await listHealthRuns(1))[0]
    if (previous) {
      const hours = Math.round((now.getTime() - Date.parse(previous.at)) / 3600_000)
      if (hours > GAP_HOURS) run.gapHours = hours
    }
    run.checks = await Promise.all([checkNopRender(base, opts.simulate ?? null), checkBusinessPdf(base, opts.simulate ?? null)])
    run.ok = run.checks.every((c) => c.ok)
  } catch (err) {
    run.ok = false
    run.checks.push({ name: "nop-render-check", ok: false, ms: 0, status: null, detail: `the health check itself crashed: ${err instanceof Error ? err.message : String(err)}` })
  }

  const to = alertRecipient()
  if (!run.ok) {
    const [subject, lines] = failureEmail(run)
    run.alert = { ...(await sendOperationalAlert(subject, lines, to)), kind: "failure" }
    console.error(`[health] FAILED: ${run.checks.filter((c) => !c.ok).map((c) => `${c.name}: ${c.detail}`).join(" | ")}; alert ${run.alert.sent ? "sent" : `NOT sent (${run.alert.reason})`}`)
  } else if (opts.forceWeekly || now.getUTCDay() === 1) {
    const recent = [run, ...(await listHealthRuns(10).catch(() => []))]
    const [subject, lines] = weeklyEmail(run, recent)
    run.alert = { ...(await sendOperationalAlert(subject, lines, to)), kind: "weekly" }
  }
  if (run.ok) console.log(`[health] passed: ${run.checks.map((c) => `${c.name} ${c.ms} ms`).join(", ")}`)

  await saveRun(run).catch((err) => console.error("[health] could not store the run:", err instanceof Error ? err.message : err))
  return run
}
