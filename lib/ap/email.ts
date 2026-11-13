import { Resend } from "resend"
import { tAp } from "./i18n"
import type { ApLang } from "./types"

// The platform's one email: an agent's sign-in/sign-up code. Sent with Resend
// directly (lib/email.ts carries NOP's agent emails and stays untouched).

export async function sendApCode(to: string, orgName: string, lang: ApLang, code: string): Promise<{ sent: boolean; reason?: string }> {
  const key = process.env.RESEND_API_KEY
  if (!key) return { sent: false, reason: "RESEND_API_KEY not set" }
  const from = process.env.RESEND_FROM_ADDRESS ?? "OneFlyer <onboarding@resend.dev>"
  const vars = { org: orgName, code }
  const text = tAp(lang, "email.body", vars)
  const { error } = await new Resend(key).emails.send({
    from,
    to,
    subject: tAp(lang, "email.subject", vars),
    text,
    html: `<p style="font-family:system-ui,sans-serif;font-size:16px">${text.replace(code, `<strong style="font-size:22px;letter-spacing:2px">${code}</strong>`)}</p>`,
  })
  return error ? { sent: false, reason: error.message } : { sent: true }
}
