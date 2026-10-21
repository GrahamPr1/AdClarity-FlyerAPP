import { getClient, listAllUserEmails, listBillingEvents, listDisputes, listWaitlistEntries } from "./store"
import type { ClientRecord } from "./types"

/**
 * Everything the admin billing pages read, in one pass over Redis. At this
 * app's scale (tens to hundreds of accounts) a full read per page load is
 * cheaper than keeping aggregates in sync — the same trade the users page
 * already makes.
 */
export async function loadBillingData() {
  const [emails, waitlist, events, disputes] = await Promise.all([
    listAllUserEmails(),
    listWaitlistEntries(),
    listBillingEvents(),
    listDisputes(),
  ])
  const clients = (await Promise.all(emails.map((e) => getClient(e)))).filter((c): c is ClientRecord => c !== null)
  return {
    clients,
    totalSignups: emails.length,
    waitlistEmails: new Set(waitlist.map((w) => w.email.toLowerCase())),
    waitlistEntries: waitlist.length,
    events,
    disputes,
  }
}

/** Live-mode Stripe key → live dashboard links; anything else → test links. */
export function stripeLiveMode(): boolean {
  return /^(sk|rk)_live_/.test(process.env.STRIPE_SECRET_KEY ?? "")
}
