import { Resend } from "resend"

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
