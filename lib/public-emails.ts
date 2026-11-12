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
