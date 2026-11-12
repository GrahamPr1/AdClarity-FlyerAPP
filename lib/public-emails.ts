import { Resend } from "resend"
import { getSiteUrl } from "@/lib/site-url"
import { listUnsubscribeHeaders, unsubscribeFooterHtml } from "@/lib/email-preferences"

/**
 * Emails of the PUBLIC product that go out on a schedule (the daily lead
 * digest; the monthly results email). Kept apart from lib/email.ts, which
 * also holds the NOP agent portal's emails, so these can change without
 * touching that file.
 *
 * Every one carries the signed one-click unsubscribe (RFC 8058 headers) and
 * the footer link — see lib/email-preferences.ts. Builders are pure (render
 * returns subject/html/text) so the sample script and the tests can see
 * exactly what would be sent without sending it.
 */

const FROM_ADDRESS = process.env.RESEND_FROM_ADDRESS ?? "OneFlyer <onboarding@resend.dev>"

export interface RenderedEmail {
  to: string
  subject: string
  html: string
  text: string
  headers: Record<string, string>
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")

/* ------------------------------- Lead digest ------------------------------- */

export interface DigestLead {
  name: string
  phone: string
  email: string | null
  message: string | null
  createdAt: string
  /** The offer's headline — which flyer it came from. */
  flyerTitle: string | null
  afterOfferEnded: boolean
}

/** Listed in full up to this many; beyond it the email says how many more and points to the dashboard. */
export const DIGEST_LIST_LIMIT = 25

export function renderLeadDigest(input: { to: string; leads: DigestLead[]; subjectPrefix?: string }): RenderedEmail {
  const n = input.leads.length
  const shown = input.leads.slice(0, DIGEST_LIST_LIMIT)
  const dashboard = `${getSiteUrl()}/dashboard`
  const subject = `${input.subjectPrefix ?? ""}${n === 1 ? "1 new lead" : `${n} new leads`} from your flyers`

  const row = (l: DigestLead) => {
    const from = l.flyerTitle ? `from “${esc(l.flyerTitle)}”` : "from your flyer"
    return (
      `<tr><td style="padding:10px 0;border-top:1px solid #eee">` +
      `<strong>${esc(l.name)}</strong> <span style="color:#666">${from}</span><br>` +
      `<a href="tel:${esc(l.phone.replace(/[^0-9+]/g, ""))}">${esc(l.phone)}</a>` +
      (l.email ? ` · <a href="mailto:${esc(l.email)}">${esc(l.email)}</a>` : "") +
      (l.message ? `<br><span style="white-space:pre-wrap;color:#333">${esc(l.message)}</span>` : "") +
      (l.afterOfferEnded ? `<br><span style="color:#8a5a00">Came in after this offer ended.</span>` : "") +
      `</td></tr>`
    )
  }

  const html = `
    <div style="font-family:system-ui,-apple-system,sans-serif;line-height:1.5;max-width:560px">
      <p>${n === 1 ? "One person" : `${n} people`} filled in the form on your offer pages since your last digest.</p>
      <table style="border-collapse:collapse;width:100%">${shown.map(row).join("")}</table>
      ${n > shown.length ? `<p>And ${n - shown.length} more — all of them are on your dashboard.</p>` : ""}
      <p><a href="${esc(dashboard)}">See all your leads on your OneFlyer dashboard</a></p>
      ${unsubscribeFooterHtml(input.to, "leads")}
    </div>`

  const text = [
    `${n === 1 ? "One person" : `${n} people`} filled in the form on your offer pages since your last digest.`,
    "",
    ...shown.map((l) => `- ${l.name}${l.flyerTitle ? ` (${l.flyerTitle})` : ""}: ${l.phone}${l.email ? `, ${l.email}` : ""}${l.message ? ` — ${l.message}` : ""}${l.afterOfferEnded ? " [after the offer ended]" : ""}`),
    ...(n > shown.length ? ["", `And ${n - shown.length} more on your dashboard.`] : []),
    "",
    `All your leads: ${dashboard}`,
  ].join("\n")

  return { to: input.to, subject, html, text, headers: listUnsubscribeHeaders(input.to, "leads") }
}

/* ----------------------------- Monthly results ----------------------------- */

/** One flyer's month. Trial rows carry scans only: clicks and leads are absent, not zero. */
export interface MonthlyFlyerResult {
  title: string
  scans: number
  clicks?: number
  leads?: number
}

/** "2026-10" -> "October 2026". */
export function monthName(month: string): string {
  const [y, m] = month.split("-").map(Number)
  return new Date(Date.UTC(y, m - 1, 15)).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" })
}

const count = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

export function renderMonthlyResults(input: {
  to: string
  month: string
  scansOnly: boolean
  /** Paused account: scans only, and a link to resume instead of the plan comparison. */
  paused?: boolean
  flyers: MonthlyFlyerResult[]
  subjectPrefix?: string
  /** Rows listed before "and N more"; see MONTHLY_LIST_LIMIT. */
  listLimit?: number
}): RenderedEmail {
  const name = monthName(input.month)
  const rows = [...input.flyers].sort((a, b) => b.scans - a.scans || (b.leads ?? 0) - (a.leads ?? 0))
  const shown = rows.slice(0, input.listLimit ?? 15)
  const total = {
    scans: rows.reduce((n, r) => n + r.scans, 0),
    clicks: rows.reduce((n, r) => n + (r.clicks ?? 0), 0),
    leads: rows.reduce((n, r) => n + (r.leads ?? 0), 0),
  }
  const dashboard = `${getSiteUrl()}/dashboard`
  const pricing = `${getSiteUrl()}/#pricing`
  const resume = `${getSiteUrl()}/profile`
  const nudgeHtml = input.paused
    ? `<p>Your account is paused, so this email shows scans only. <a href="${esc(resume)}">Resume your account</a> to see clicks and leads again.</p>`
    : input.scansOnly
      ? `<p>On Basic and Pro, you also see clicks and leads for every flyer. <a href="${esc(pricing)}">Compare plans</a></p>`
      : ""
  const nudgeText = input.paused
    ? `Your account is paused, so this email shows scans only. Resume your account to see clicks and leads again: ${resume}`
    : input.scansOnly
      ? `On Basic and Pro, you also see clicks and leads for every flyer: ${pricing}`
      : ""

  const headline = input.scansOnly
    ? count(total.scans, "scan")
    : `${count(total.scans, "scan")}, ${count(total.clicks, "click")}, ${count(total.leads, "lead")}`
  const subject = `${input.subjectPrefix ?? ""}Your flyers in ${name}: ${headline}`
  const quiet = total.scans === 0 && total.clicks === 0 && total.leads === 0

  const cell = "padding:8px 10px;border-top:1px solid #eee;text-align:right"
  const head = "padding:8px 10px;text-align:right;color:#666;font-weight:normal"
  const row = (r: MonthlyFlyerResult) =>
    `<tr><td style="padding:8px 10px 8px 0;border-top:1px solid #eee">${esc(r.title)}</td>` +
    `<td style="${cell}">${r.scans}</td>` +
    (input.scansOnly ? "" : `<td style="${cell}">${r.clicks ?? 0}</td><td style="${cell}">${r.leads ?? 0}</td>`) +
    `</tr>`
  const totalRow =
    rows.length > 1
      ? `<tr><td style="padding:8px 10px 8px 0;border-top:2px solid #ddd"><strong>All flyers</strong></td>` +
        `<td style="${cell};border-top:2px solid #ddd"><strong>${total.scans}</strong></td>` +
        (input.scansOnly ? "" : `<td style="${cell};border-top:2px solid #ddd"><strong>${total.clicks}</strong></td><td style="${cell};border-top:2px solid #ddd"><strong>${total.leads}</strong></td>`) +
        `</tr>`
      : ""

  const intro = quiet
    ? `None of your flyers' QR codes were scanned in ${name}. Here they are, so you can see where each one stands.`
    : `Here's how your flyers did in ${name}.`
  const explain = input.scansOnly
    ? "Scans are people who scanned a flyer's QR code."
    : "Scans are people who scanned a flyer's QR code; clicks are taps on its offer page; leads are people who sent you their details."

  const html = `
    <div style="font-family:system-ui,-apple-system,sans-serif;line-height:1.5;max-width:560px">
      <p>${intro}</p>
      <table style="border-collapse:collapse;width:100%;font-size:14px">
        <tr><th style="padding:8px 10px 8px 0;text-align:left;color:#666;font-weight:normal">Flyer</th><th style="${head}">Scans</th>${input.scansOnly ? "" : `<th style="${head}">Clicks</th><th style="${head}">Leads</th>`}</tr>
        ${shown.map(row).join("")}
        ${totalRow}
      </table>
      ${rows.length > shown.length ? `<p>And ${rows.length - shown.length} more on your dashboard.</p>` : ""}
      <p style="color:#666;font-size:13px">${explain}</p>
      ${nudgeHtml}
      <p><a href="${esc(dashboard)}">See your flyers on your OneFlyer dashboard</a></p>
      ${unsubscribeFooterHtml(input.to, "results")}
    </div>`

  const line = (r: MonthlyFlyerResult) =>
    input.scansOnly ? `- ${r.title}: ${count(r.scans, "scan")}` : `- ${r.title}: ${count(r.scans, "scan")}, ${count(r.clicks ?? 0, "click")}, ${count(r.leads ?? 0, "lead")}`
  const text = [
    intro,
    "",
    ...shown.map(line),
    ...(rows.length > 1 ? ["", `All flyers: ${headline}`] : []),
    ...(rows.length > shown.length ? ["", `And ${rows.length - shown.length} more on your dashboard.`] : []),
    "",
    explain,
    ...(nudgeText ? ["", nudgeText] : []),
    "",
    `Your dashboard: ${dashboard}`,
  ].join("\n")

  return { to: input.to, subject, html, text, headers: listUnsubscribeHeaders(input.to, "results") }
}

/* ---------------------------------- Send ----------------------------------- */

export async function sendRendered(email: RenderedEmail): Promise<{ sent: boolean; reason?: string }> {
  const key = process.env.RESEND_API_KEY
  if (!key) return { sent: false, reason: "RESEND_API_KEY is not configured" }
  try {
    const { error } = await new Resend(key).emails.send({ from: FROM_ADDRESS, to: email.to, subject: email.subject, html: email.html, text: email.text, headers: email.headers })
    return error ? { sent: false, reason: error.message } : { sent: true }
  } catch (err) {
    return { sent: false, reason: err instanceof Error ? err.message : "unknown error" }
  }
}
