import type { BillingInterval, WaitlistEntry } from "@/lib/types"

/**
 * The real copy for the waitlist confirmation email.
 *
 * Kept as data rather than inlined at the send site so the wording can be
 * edited without touching delivery code, and so swapping the console stub for
 * Resend is a one-line change (see sendWaitlistConfirmation in lib/email.ts).
 *
 * Deliberately promises nothing beyond what's true: a place in line and an
 * email when checkout exists. No launch date, no discount — the annual option
 * is the standard pricing already published on the site.
 */
export function waitlistConfirmation(entry: Pick<WaitlistEntry, "email" | "desiredPlan" | "billingInterval">) {
  const plan = entry.desiredPlan === "pro" ? "Pro" : "Basic"
  const interval: Record<BillingInterval, string> = { monthly: "monthly", annual: "annual" }

  return {
    subject: `You're on the list for OneFlyer ${plan}`,
    text: [
      `Thanks for putting your name down for OneFlyer ${plan} (${interval[entry.billingInterval]}).`,
      ``,
      `We're not taking payment yet. When ${plan} billing goes live you'll get an email`,
      `from us with a checkout link — nothing happens automatically, and you won't be`,
      `charged without choosing to.`,
      ``,
      `In the meantime your account is on the free tier, so you can keep making`,
      `campaigns: https://oneflyer.org/dashboard`,
      ``,
      `— OneFlyer`,
    ].join("\n"),
  }
}
