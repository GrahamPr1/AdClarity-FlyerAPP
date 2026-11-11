import { Resend } from "resend"
import { tNop, type NopLang, type NopStringKey } from "@/lib/enterprise/nop-i18n"

/**
 * Where operational alerts go. Distinct from any customer-facing address:
 * these are for whoever runs the service, not whoever uses it.
 */
const ALERT_RECIPIENT = process.env.ALERT_EMAIL?.trim()

// Real transactional email via Resend — the only thing this app currently
// needs to send is a password-reset link, so this stays scoped to exactly
// that rather than becoming a generic mailer. FROM_ADDRESS defaults to
// Resend's own shared onboarding@resend.dev sender, which works without a
// verified sending domain — override with RESEND_FROM_ADDRESS once
// oneflyer.org (or whichever domain) is verified with Resend, for a
// properly branded "from".
const FROM_ADDRESS = process.env.RESEND_FROM_ADDRESS ?? "OneFlyer <onboarding@resend.dev>"

/** The bare address in FROM_ADDRESS, for "add us to your contacts". */
export const FROM_EMAIL = FROM_ADDRESS.match(/<([^>]+)>/)?.[1] ?? FROM_ADDRESS

/**
 * Where a reply to an agent email goes when there's no person to reply to
 * (sign-in codes, approvals). Unset: no reply-to, as before. Set it only to an
 * inbox that can receive mail.
 */
const SUPPORT_REPLY_TO = process.env.EMAIL_REPLY_TO?.trim() || undefined

function getClient(): Resend | null {
  const key = process.env.RESEND_API_KEY
  if (!key) return null
  return new Resend(key)
}

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")

/** One piece of an agent email; each renders the same in HTML and plain text. */
type MailBlock =
  | { p: string }
  | { code: string }
  | { rows: { label: string; value: string; href?: string; pre?: boolean }[] }
  | { link: { label: string; url: string } }
  | { small: string }

/**
 * Builds an agent email's HTML and plain-text bodies from the same blocks, so
 * the two never drift apart, with the footer saying who sent it and why.
 */
function agentMail(lang: NopLang, blocks: MailBlock[], footer: string): { html: string; text: string } {
  const html = blocks.map((b) => {
    if ("p" in b) return `<p>${escapeHtml(b.p)}</p>`
    if ("code" in b) return `<p style="font-size:24px;font-weight:600;letter-spacing:4px">${escapeHtml(b.code)}</p>`
    if ("small" in b) return `<p style="color:#888;font-size:12px">${escapeHtml(b.small)}</p>`
    if ("link" in b) return `<p><a href="${escapeHtml(b.link.url)}">${escapeHtml(b.link.label)}</a></p>`
    return `<table style="border-collapse:collapse;margin:12px 0">${b.rows.map((r) => {
      const value = r.href ? `<a href="${escapeHtml(r.href)}">${escapeHtml(r.value)}</a>` : r.pre ? `<span style="white-space:pre-wrap">${escapeHtml(r.value)}</span>` : escapeHtml(r.value)
      return `<tr><td style="padding:4px 12px 4px 0;color:#666;vertical-align:top">${escapeHtml(r.label)}</td><td style="padding:4px 0">${value}</td></tr>`
    }).join("")}</table>`
  }).join("\n")
  const text = blocks.map((b) => {
    if ("p" in b) return b.p
    if ("code" in b) return b.code
    if ("small" in b) return b.small
    if ("link" in b) return `${b.link.label}: ${b.link.url}`
    return b.rows.map((r) => `${r.label}: ${r.value}`).join("\n")
  }).join("\n\n")
  return {
    html: `<div lang="${lang}" style="font-family:system-ui,-apple-system,sans-serif;line-height:1.5;max-width:520px">\n${html}\n<hr style="margin:16px 0;border:none;border-top:1px solid #ddd">\n<p style="color:#888;font-size:12px">${escapeHtml(footer)}</p>\n</div>`,
    text: `${text}\n\n--\n${footer}\n`,
  }
}

/**
 * Sends the password-reset link. Returns false (never throws) on any
 * failure — missing API key, Resend error, network error — so the caller
 * can show a generic "couldn't send, try again later" to the client while
 * logging the real reason server-side for diagnosis, without leaking
 * internal configuration state to whoever clicked "forgot password".
 */
export async function sendPasswordResetEmail(
  email: string,
  resetUrl: string,
  /** Set only for NOP visitors (see nopLangForPasswordReset). Everyone else gets the original email below, untouched. */
  nopLang: NopLang | null = null,
): Promise<boolean> {
  const resend = getClient()
  if (!resend) {
    console.error("[email] RESEND_API_KEY is not configured — cannot send password reset email.")
    return false
  }

  const message = nopLang
    ? {
        subject: tNop(nopLang, "reset_email.subject"),
        html: `
        <div lang="${nopLang}">
          <p>${tNop(nopLang, "reset_email.intro")}</p>
          <p><a href="${resetUrl}">${resetUrl}</a></p>
          <p>${tNop(nopLang, "reset_email.expires")}</p>
        </div>
      `,
      }
    : {
        subject: "Reset your OneFlyer password",
        html: `
        <p>Click the link below to set a new password for your OneFlyer account.</p>
        <p><a href="${resetUrl}">${resetUrl}</a></p>
        <p>This link expires in 30 minutes and can only be used once. If you didn't request this, you can safely ignore this email.</p>
      `,
      }

  try {
    const { error } = await resend.emails.send({
      from: FROM_ADDRESS,
      to: email,
      ...message,
    })
    if (error) {
      console.error("[email] Resend rejected the password reset email:", error.message)
      return false
    }
    return true
  } catch (err) {
    console.error("[email] Failed to send password reset email:", err instanceof Error ? err.message : err)
    return false
  }
}

/**
 * Sends an operational alert to whoever runs the service.
 *
 * Never throws and never rejects: every caller is on a path where the alert
 * is strictly secondary to the work in progress (the environment guardrail
 * calls it during server boot), so a mail failure must never be able to take
 * a deployment down or mask the condition being reported. The condition is
 * always logged as well, so the console remains the source of truth and the
 * email is an escalation on top of it.
 *
 * Returns why it did or didn't send, so callers can log that too rather than
 * assuming an alert went out.
 */
export async function sendOperationalAlert(
  subject: string,
  bodyLines: string[],
): Promise<{ sent: boolean; reason?: string }> {
  if (!ALERT_RECIPIENT) {
    return { sent: false, reason: "ALERT_EMAIL is not configured" }
  }
  const resend = getClient()
  if (!resend) {
    return { sent: false, reason: "RESEND_API_KEY is not configured" }
  }

  const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")

  try {
    const { error } = await resend.emails.send({
      from: FROM_ADDRESS,
      to: ALERT_RECIPIENT,
      subject,
      html: `
        <div style="font-family:system-ui,-apple-system,sans-serif;line-height:1.5">
          <h2 style="margin:0 0 12px">${escape(subject)}</h2>
          ${bodyLines.map((l) => `<p style="margin:0 0 8px">${escape(l)}</p>`).join("")}
          <hr style="margin:16px 0;border:none;border-top:1px solid #ddd">
          <p style="margin:0;color:#666;font-size:12px">
            Automated alert from OneFlyer. Sent because ALERT_EMAIL is configured.
          </p>
        </div>
      `,
    })
    if (error) return { sent: false, reason: `Resend rejected the alert: ${error.message}` }
    return { sent: true }
  } catch (err) {
    return { sent: false, reason: err instanceof Error ? err.message : "unknown error" }
  }
}

/**
 * Delivers a contact-form submission.
 *
 * Goes to ALERT_EMAIL — the operator address already used for environment
 * alerts — rather than a new variable, so there's one place to change where
 * mail lands. replyTo is the sender's own address so hitting reply in the
 * inbox answers the person directly rather than the app.
 *
 * Returns why it failed rather than throwing: the form needs to tell the
 * visitor honestly whether their message got through, and "sent" must never
 * be shown for a message that didn't.
 */
export async function sendContactMessage(input: {
  name: string
  email: string
  message: string
}): Promise<{ sent: boolean; reason?: string }> {
  if (!ALERT_RECIPIENT) return { sent: false, reason: "ALERT_EMAIL is not configured" }
  const resend = getClient()
  if (!resend) return { sent: false, reason: "RESEND_API_KEY is not configured" }

  const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")

  try {
    const { error } = await resend.emails.send({
      from: FROM_ADDRESS,
      to: ALERT_RECIPIENT,
      replyTo: input.email,
      subject: `OneFlyer contact form — ${input.name}`,
      html: `
        <div style="font-family:system-ui,-apple-system,sans-serif;line-height:1.5">
          <p><strong>From:</strong> ${escape(input.name)} &lt;${escape(input.email)}&gt;</p>
          <hr style="margin:12px 0;border:none;border-top:1px solid #ddd">
          <p style="white-space:pre-wrap">${escape(input.message)}</p>
        </div>
      `,
    })
    if (error) return { sent: false, reason: error.message }
    return { sent: true }
  } catch (err) {
    return { sent: false, reason: err instanceof Error ? err.message : "unknown error" }
  }
}

/**
 * Tells a business owner someone just filled in the form on one of their
 * offer pages. replyTo is the visitor's email when they gave one, so replying
 * reaches them directly.
 *
 * Returns why it failed rather than throwing: the lead is already saved by
 * the time this runs, and a failed email must not lose it (see
 * app/api/leads/[code]/route.ts).
 */
export async function sendLeadNotification(input: {
  to: string
  businessName: string
  /** The offer's headline, to say which flyer it came from. */
  flyerTitle: string | null
  /** The channel the scanned code was handed out through, if it had one. */
  channelLabel: string | null
  lead: { name: string; phone: string; email: string | null; message: string | null }
  /** It came in after the offer's end date. */
  afterOfferEnded?: boolean
  dashboardUrl: string
}): Promise<{ sent: boolean; reason?: string }> {
  const resend = getClient()
  if (!resend) return { sent: false, reason: "RESEND_API_KEY is not configured" }

  const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
  const { lead } = input
  const from = input.flyerTitle ? `your flyer \u201c${input.flyerTitle}\u201d` : "your flyer"
  const row = (label: string, value: string) =>
    `<tr><td style="padding:4px 12px 4px 0;color:#666;vertical-align:top">${label}</td><td style="padding:4px 0">${value}</td></tr>`

  try {
    const { error } = await resend.emails.send({
      from: FROM_ADDRESS,
      to: input.to,
      ...(lead.email ? { replyTo: lead.email } : {}),
      subject: `New lead from your flyer: ${lead.name}`,
      html: `
        <div style="font-family:system-ui,-apple-system,sans-serif;line-height:1.5;max-width:520px">
          <p>${escape(lead.name)} filled in the form on ${escape(from)}${input.channelLabel ? ` (${escape(input.channelLabel)})` : ""}.</p>
          ${input.afterOfferEnded ? `<p style="color:#8a5a00"><strong>Came in after this offer ended.</strong> They asked for a quote.</p>` : ""}
          <table style="border-collapse:collapse;margin:12px 0">
            ${row("Name", escape(lead.name))}
            ${row("Phone", `<a href="tel:${escape(lead.phone.replace(/[^0-9+]/g, ""))}">${escape(lead.phone)}</a>`)}
            ${lead.email ? row("Email", `<a href="mailto:${escape(lead.email)}">${escape(lead.email)}</a>`) : ""}
            ${lead.message ? row("Message", `<span style="white-space:pre-wrap">${escape(lead.message)}</span>`) : ""}
          </table>
          <p><a href="${escape(input.dashboardUrl)}">See all your leads on your OneFlyer dashboard</a></p>
          <p style="color:#888;font-size:12px">They agreed that ${escape(input.businessName)} may contact them about ${input.afterOfferEnded ? "their services" : "this offer"}.</p>
        </div>
      `,
    })
    if (error) return { sent: false, reason: error.message }
    return { sent: true }
  } catch (err) {
    return { sent: false, reason: err instanceof Error ? err.message : "unknown error" }
  }
}

/**
 * A new lead for a NOP agent, in the agent's language. Separate from the SMB
 * email above: different wording, bilingual, and it quotes the consent the
 * person ticked rather than a business's offer.
 */
export async function sendNopAgentLeadNotification(input: {
  to: string
  lang: NopLang
  lead: { name: string; phone: string; email: string | null; message: string | null; consent?: { text: string }; smsConsent?: { agreed: boolean } | null }
  portalUrl: string
  /** The form was on the agent's personal page, not the flyer's QR lead page. */
  fromPage?: boolean
  /** An RSVP on one of the agent's event pages. */
  event?: { title: string; guests: number }
  /** A walk-in who checked in at one of the agent's events (Part H). */
  checkIn?: { title: string }
}): Promise<{ sent: boolean; reason?: string }> {
  const resend = getClient()
  if (!resend) return { sent: false, reason: "RESEND_API_KEY is not configured" }

  const t = (k: NopStringKey, v?: Record<string, string>) => tNop(input.lang, k, v)
  const { lead } = input
  const body = agentMail(input.lang, [
    { p: input.checkIn ? t("email.checkin_intro", { title: input.checkIn.title }) : input.event ? t("email.rsvp_intro", { title: input.event.title }) : t(input.fromPage ? "email.lead_intro_page" : "email.lead_intro") },
    { rows: [
      { label: t("lead.name"), value: lead.name },
      { label: t("lead.phone"), value: lead.phone, href: `tel:${lead.phone.replace(/[^0-9+]/g, "")}` },
      ...(lead.email ? [{ label: t("portal.lead_email"), value: lead.email, href: `mailto:${lead.email}` }] : []),
      ...(lead.message ? [{ label: t("lead.message_optional").replace(/\s*\(.*\)$/, ""), value: lead.message, pre: true }] : []),
      ...(input.event ? [{ label: t("email.rsvp_guests"), value: String(input.event.guests) }] : []),
      ...(lead.smsConsent?.agreed ? [{ label: t("sms.email_label"), value: t("sms.badge_ok") }] : []),
    ] },
    { p: t(lead.email ? "email.lead_reply" : "email.lead_call", { name: lead.name }) },
    { link: { label: t("email.lead_open"), url: input.portalUrl } },
    ...(lead.consent ? [{ small: `☑ ${lead.consent.text}` }] : []),
  ], t("email.footer_agent"))

  try {
    const replyTo = lead.email ?? SUPPORT_REPLY_TO
    const { error } = await resend.emails.send({
      from: FROM_ADDRESS,
      to: input.to,
      ...(replyTo ? { replyTo } : {}),
      subject: input.checkIn ? t("email.checkin_subject", { name: lead.name, title: input.checkIn.title }) : input.event ? t("email.rsvp_subject", { name: lead.name, title: input.event.title }) : t("email.lead_subject", { name: lead.name }),
      ...body,
    })
    if (error) return { sent: false, reason: error.message }
    return { sent: true }
  } catch (err) {
    return { sent: false, reason: err instanceof Error ? err.message : "unknown error" }
  }
}

/**
 * Tells a self-signed-up agent an admin approved (with a sign-in link) or
 * rejected their sign-up, in the language they signed up in. A rejection
 * never says why. The approval asks them to add our address to their
 * contacts, so lead alerts don't land in spam.
 */
export async function sendAgentSignupDecision(input: {
  to: string
  name: string
  lang: NopLang
  approved: boolean
  programName: string
  signInUrl: string
}): Promise<{ sent: boolean; reason?: string }> {
  const resend = getClient()
  if (!resend) return { sent: false, reason: "RESEND_API_KEY is not configured" }
  const t = (k: NopStringKey, v?: Record<string, string>) => tNop(input.lang, k, v)
  const v = { program: input.programName, name: input.name }
  const body = input.approved
    ? agentMail(input.lang, [
        { p: t("email.approved_intro", v) },
        { link: { label: t("email.approved_cta"), url: input.signInUrl } },
        { p: t("email.approved_signin_how") },
        { p: t("email.approved_contacts", { from: FROM_EMAIL }) },
      ], t("email.footer_agent"))
    : agentMail(input.lang, [{ p: t("email.rejected_body", v) }], "OneFlyer · oneflyer.org")
  try {
    const { error } = await resend.emails.send({
      from: FROM_ADDRESS,
      to: input.to,
      ...(SUPPORT_REPLY_TO ? { replyTo: SUPPORT_REPLY_TO } : {}),
      subject: t(input.approved ? "email.approved_subject" : "email.rejected_subject", v),
      ...body,
    })
    if (error) return { sent: false, reason: error.message }
    return { sent: true }
  } catch (err) {
    return { sent: false, reason: err instanceof Error ? err.message : "unknown error" }
  }
}

/**
 * The day-before reminder to someone who RSVP'd with an email, in the language
 * they used on the RSVP form. Reply goes to the agent.
 */
export async function sendEventReminder(input: {
  to: string
  lang: NopLang
  firstName: string
  title: string
  when: string
  place: string
  agentName: string
  agentPhone: string
  agentEmail: string
  pageUrl: string
}): Promise<{ sent: boolean; reason?: string }> {
  const resend = getClient()
  if (!resend) return { sent: false, reason: "RESEND_API_KEY is not configured" }
  const t = (k: NopStringKey, v?: Record<string, string>) => tNop(input.lang, k, v)
  const body = agentMail(input.lang, [
    { p: t("email.reminder_body", { first: input.firstName, title: input.title, when: input.when, place: input.place }) },
    { p: t("email.reminder_host", { name: input.agentName, phone: input.agentPhone }) },
    { link: { label: input.pageUrl.replace(/^https?:\/\//, ""), url: input.pageUrl } },
  ], t("email.reminder_footer", { name: input.agentName }))
  try {
    const { error } = await resend.emails.send({
      from: FROM_ADDRESS,
      to: input.to,
      replyTo: input.agentEmail,
      subject: t("email.reminder_subject", { title: input.title }),
      ...body,
    })
    if (error) return { sent: false, reason: error.message }
    return { sent: true }
  } catch (err) {
    return { sent: false, reason: err instanceof Error ? err.message : "unknown error" }
  }
}

/**
 * The agent's day-before email for one of their events, in the agent's
 * language: when and where, and everyone who RSVP'd (name, guests, phone,
 * email), so they have the list in hand. Sent once per event.
 */
export async function sendEventAgentReminder(input: {
  to: string
  lang: NopLang
  title: string
  when: string
  place: string
  rsvps: { name: string; phone: string; email: string | null; guests: number }[]
  eventUrl: string
}): Promise<{ sent: boolean; reason?: string }> {
  const resend = getClient()
  if (!resend) return { sent: false, reason: "RESEND_API_KEY is not configured" }
  const t = (k: NopStringKey, v?: Record<string, string>) => tNop(input.lang, k, v)
  const people = input.rsvps.reduce((n, r) => n + 1 + r.guests, 0)
  const body = agentMail(input.lang, [
    { p: t("email.agent_reminder_body", { title: input.title, when: input.when, place: input.place }) },
    { p: input.rsvps.length === 0 ? t("email.agent_reminder_none") : t(input.rsvps.length === 1 ? "email.agent_reminder_count_one" : "email.agent_reminder_count", { n: String(input.rsvps.length), guests: String(people) }) },
    ...(input.rsvps.length ? [{ rows: input.rsvps.map((r) => ({
      label: r.name,
      value: [r.phone, r.email, r.guests ? t("email.agent_reminder_guests", { n: String(r.guests) }) : ""].filter(Boolean).join(" · "),
    })) }] : []),
    ...(input.rsvps.some((r) => r.email) ? [{ p: t("email.agent_reminder_sent") }] : []),
    { link: { label: t("email.agent_reminder_open"), url: input.eventUrl } },
  ], t("email.footer_agent"))
  try {
    const { error } = await resend.emails.send({
      from: FROM_ADDRESS,
      to: input.to,
      ...(SUPPORT_REPLY_TO ? { replyTo: SUPPORT_REPLY_TO } : {}),
      subject: t("email.agent_reminder_subject", { title: input.title }),
      ...body,
    })
    if (error) return { sent: false, reason: error.message }
    return { sent: true }
  } catch (err) {
    return { sent: false, reason: err instanceof Error ? err.message : "unknown error" }
  }
}

/**
 * Tells an agent an admin took down (hid) one of their event pages, or put it
 * back, in the agent's language.
 */
export async function sendEventHiddenNotice(input: {
  to: string
  lang: NopLang
  title: string
  hidden: boolean
  eventUrl: string
}): Promise<{ sent: boolean; reason?: string }> {
  const resend = getClient()
  if (!resend) return { sent: false, reason: "RESEND_API_KEY is not configured" }
  const t = (k: NopStringKey, v?: Record<string, string>) => tNop(input.lang, k, v)
  const body = agentMail(input.lang, [
    { p: t(input.hidden ? "email.event_hidden_body" : "email.event_unhidden_body", { title: input.title }) },
    ...(input.hidden ? [{ p: t("email.event_hidden_next") }] : []),
    { link: { label: t("email.agent_reminder_open"), url: input.eventUrl } },
  ], t("email.footer_agent"))
  try {
    const { error } = await resend.emails.send({
      from: FROM_ADDRESS,
      to: input.to,
      ...(SUPPORT_REPLY_TO ? { replyTo: SUPPORT_REPLY_TO } : {}),
      subject: t(input.hidden ? "email.event_hidden_subject" : "email.event_unhidden_subject", { title: input.title }),
      ...body,
    })
    if (error) return { sent: false, reason: error.message }
    return { sent: true }
  } catch (err) {
    return { sent: false, reason: err instanceof Error ? err.message : "unknown error" }
  }
}

/**
 * The monthly results email to a Pro/Leader agent (monthly-email.ts), in their
 * language: last month's numbers and one link to the portal. Rows for features
 * the org has off are left out. The footer says how to turn it off.
 */
export async function sendMonthlyResults(input: {
  to: string
  lang: NopLang
  /** "2026-11" */
  month: string
  results: { scans: number; leads: number; rsvps: number | null; recruits: number | null }
  portalUrl: string
  profileUrl: string
}): Promise<{ sent: boolean; reason?: string }> {
  const resend = getClient()
  if (!resend) return { sent: false, reason: "RESEND_API_KEY is not configured" }
  const t = (k: NopStringKey, v?: Record<string, string>) => tNop(input.lang, k, v)
  const [y, m] = input.month.split("-").map(Number)
  const monthName = new Intl.DateTimeFormat(input.lang === "es" ? "es-US" : "en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, 15)))
  const r = input.results
  const body = agentMail(input.lang, [
    { p: t("monthly.intro", { month: monthName }) },
    { rows: [
      { label: t("portal.results_scans"), value: String(r.scans) },
      { label: t("portal.results_leads"), value: String(r.leads) },
      ...(r.rsvps !== null ? [{ label: t("monthly.rsvps"), value: String(r.rsvps) }] : []),
      ...(r.recruits !== null ? [{ label: t("monthly.recruits"), value: String(r.recruits) }] : []),
    ] },
    { link: { label: t("monthly.open"), url: input.portalUrl } },
    { small: t("monthly.turn_off", { url: input.profileUrl }) },
  ], t("email.footer_agent"))
  try {
    const { error } = await resend.emails.send({
      from: FROM_ADDRESS,
      to: input.to,
      ...(SUPPORT_REPLY_TO ? { replyTo: SUPPORT_REPLY_TO } : {}),
      subject: t("monthly.subject", { month: monthName }),
      ...body,
    })
    if (error) return { sent: false, reason: error.message }
    return { sent: true }
  } catch (err) {
    return { sent: false, reason: err instanceof Error ? err.message : "unknown error" }
  }
}

/**
 * The daily follow-up reminder to an agent (followup-reminders.ts), in their
 * language: the leads that need follow-up today, each linking straight to it
 * in the Leads tab, and how to turn the email off.
 */
export async function sendFollowUpReminder(input: {
  to: string
  lang: NopLang
  leads: { id: string; name: string; reason: { kind: "overdue"; on: string } | { kind: "today" } | { kind: "untouched"; days: number } }[]
  /** Leads due beyond the ones listed. */
  more: number
  leadUrl: (id: string) => string
  leadsUrl: string
  profileUrl: string
}): Promise<{ sent: boolean; reason?: string }> {
  const resend = getClient()
  if (!resend) return { sent: false, reason: "RESEND_API_KEY is not configured" }
  const t = (k: NopStringKey, v?: Record<string, string>) => tNop(input.lang, k, v)
  const total = input.leads.length + input.more
  const day = (d: string) => new Intl.DateTimeFormat(input.lang === "es" ? "es-US" : "en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${d}T12:00:00Z`))
  const why = (r: (typeof input.leads)[number]["reason"]) =>
    r.kind === "today" ? t("tracker.due_today") : r.kind === "overdue" ? t("tracker.overdue", { date: day(r.on) }) : t("tracker.untouched", { n: String(r.days) })
  const body = agentMail(input.lang, [
    { p: t(total === 1 ? "followup.intro_one" : "followup.intro", { n: String(total) }) },
    ...input.leads.map((l) => ({ link: { label: `${l.name} — ${why(l.reason)}`, url: input.leadUrl(l.id) } })),
    ...(input.more > 0 ? [{ p: t("followup.more", { n: String(input.more) }) }] : []),
    { link: { label: t("followup.open_leads"), url: input.leadsUrl } },
    { small: t("followup.turn_off", { url: input.profileUrl }) },
  ], t("email.footer_agent"))
  try {
    const { error } = await resend.emails.send({
      from: FROM_ADDRESS,
      to: input.to,
      ...(SUPPORT_REPLY_TO ? { replyTo: SUPPORT_REPLY_TO } : {}),
      subject: t(total === 1 ? "followup.subject_one" : "followup.subject", { n: String(total) }),
      ...body,
    })
    if (error) return { sent: false, reason: error.message }
    return { sent: true }
  } catch (err) {
    return { sent: false, reason: err instanceof Error ? err.message : "unknown error" }
  }
}

/**
 * Waitlist confirmation.
 *
 * Deliberately does NOT send yet — it logs. Sending real mail to people who
 * signed up for something that doesn't exist yet is a commitment worth making
 * on purpose rather than as a side effect of building the form.
 *
 * The copy already lives in lib/email-templates/waitlist-confirmation.ts, and
 * Resend is already wired up for password resets and contact messages, so
 * switching this on is replacing the console.info below with a resend.emails
 * .send call — not a rebuild.
 */
export async function sendWaitlistConfirmation(
  email: string,
  desiredPlan: "basic" | "pro",
  billingInterval: "monthly" | "annual",
): Promise<{ sent: boolean; reason?: string }> {
  const { waitlistConfirmation } = await import("./email-templates/waitlist-confirmation")
  const { subject } = waitlistConfirmation({ email, desiredPlan, billingInterval })
  console.info(`[waitlist] Would email ${email}: "${subject}" (sending is not enabled yet)`)
  return { sent: false, reason: "waitlist email sending is not enabled yet" }
}

/**
 * Sends a NOP agent code (registration, self sign-up or sign-in).
 *
 * Imported-roster registration and sign-in: the caller addresses it to the
 * roster email ON FILE, never to what the agent typed. Self sign-up: to the
 * typed email, which is what the code proves; nothing is granted until an
 * admin approves. Never throws; returns false and logs on any failure.
 */
export async function sendAgentVerificationCode(
  rosterEmail: string,
  code: string,
  programName: string,
  /** The language the agent is using at the moment they asked for the code. */
  lang: NopLang = "en",
  /** "signin" for a returning agent's code; "register" (default) for a first-time one. */
  purpose: "register" | "signin" = "register",
): Promise<boolean> {
  const resend = getClient()
  if (!resend) {
    console.error("[email] RESEND_API_KEY is not configured — cannot send agent verification code.")
    return false
  }
  try {
    const { error } = await resend.emails.send({
      from: FROM_ADDRESS,
      to: rosterEmail,
      ...(SUPPORT_REPLY_TO ? { replyTo: SUPPORT_REPLY_TO } : {}),
      subject: tNop(lang, purpose === "signin" ? "email.subject_signin" : "email.subject", { program: programName, code }),
      ...agentMail(lang, [
        { p: tNop(lang, purpose === "signin" ? "email.intro_signin" : "email.intro", { program: programName }) },
        { code },
        { p: tNop(lang, purpose === "signin" ? "email.expires_signin" : "email.expires") },
      ], "OneFlyer · oneflyer.org"),
    })
    if (error) {
      console.error("[email] Resend rejected the agent verification email:", error.message)
      return false
    }
    return true
  } catch (err) {
    console.error("[email] Failed to send agent verification email:", err instanceof Error ? err.message : err)
    return false
  }
}
