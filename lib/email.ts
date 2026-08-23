import { Resend } from "resend"

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

function getClient(): Resend | null {
  const key = process.env.RESEND_API_KEY
  if (!key) return null
  return new Resend(key)
}

/**
 * Sends the password-reset link. Returns false (never throws) on any
 * failure — missing API key, Resend error, network error — so the caller
 * can show a generic "couldn't send, try again later" to the client while
 * logging the real reason server-side for diagnosis, without leaking
 * internal configuration state to whoever clicked "forgot password".
 */
export async function sendPasswordResetEmail(email: string, resetUrl: string): Promise<boolean> {
  const resend = getClient()
  if (!resend) {
    console.error("[email] RESEND_API_KEY is not configured — cannot send password reset email.")
    return false
  }

  try {
    const { error } = await resend.emails.send({
      from: FROM_ADDRESS,
      to: email,
      subject: "Reset your OneFlyer password",
      html: `
        <p>Click the link below to set a new password for your OneFlyer account.</p>
        <p><a href="${resetUrl}">${resetUrl}</a></p>
        <p>This link expires in 30 minutes and can only be used once. If you didn't request this, you can safely ignore this email.</p>
      `,
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
