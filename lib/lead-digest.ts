import { Redis } from "@upstash/redis"
import { getEmailPreferences } from "@/lib/email-preferences"
import { offerPageFeaturesEnabledFor } from "@/lib/offer-page-access"
import { renderLeadDigest, sendRendered, type DigestLead } from "@/lib/public-emails"

/**
 * The daily lead digest — the alternative to an email per lead.
 *
 * A lead whose owner chose "Once a day" is saved as always (the dashboard is
 * unaffected) and queued here; the daily job (/api/cron/public-emails) sends
 * each account one email listing what came in, then clears its queue.
 *
 * Who gets one is decided AT SEND TIME, not when the lead arrived:
 *   - lead emails switched off since -> the queue is dropped, nothing sent;
 *   - the account no longer has lead capture (downgraded to trial, paused,
 *     or an enterprise/agent account) -> nothing sent, queue dropped.
 * Lead capture is Basic and up, so this is too.
 */

const redis = Redis.fromEnv()
const queueKey = (email: string) => `lead-digest:v1:queue:${email.trim().toLowerCase()}`
const PENDING = "lead-digest:v1:pending"

export async function queueLeadForDigest(ownerEmail: string, lead: DigestLead): Promise<void> {
  await redis.rpush(queueKey(ownerEmail), JSON.stringify(lead))
  await redis.sadd(PENDING, ownerEmail.trim().toLowerCase())
}

export interface DigestRun {
  live: boolean
  accounts: number
  sent: string[]
  /** Not live: what would have gone out (queues are kept, so nothing is lost when it goes live). */
  wouldSend: { to: string; leads: number }[]
  dropped: { to: string; why: string }[]
  failed: { to: string; reason: string }[]
}

async function drop(email: string) {
  await redis.del(queueKey(email))
  await redis.srem(PENDING, email)
}

export async function runLeadDigest(opts: { live: boolean }): Promise<DigestRun> {
  const run: DigestRun = { live: opts.live, accounts: 0, sent: [], wouldSend: [], dropped: [], failed: [] }
  const emails = ((await redis.smembers(PENDING)) ?? []) as string[]
  for (const email of emails) {
    run.accounts++
    const raw = ((await redis.lrange(queueKey(email), 0, -1)) ?? []) as (string | DigestLead)[]
    const leads = raw.map((r) => (typeof r === "string" ? (JSON.parse(r) as DigestLead) : r))
    if (!leads.length) {
      await redis.srem(PENDING, email)
      continue
    }
    const prefs = await getEmailPreferences(email)
    if (prefs.leads === "off") {
      await drop(email)
      run.dropped.push({ to: email, why: "lead emails switched off" })
      continue
    }
    if (!(await offerPageFeaturesEnabledFor(email).catch(() => false))) {
      await drop(email)
      run.dropped.push({ to: email, why: "no lead capture on this account now (trial, paused or enterprise)" })
      continue
    }
    if (!opts.live) {
      run.wouldSend.push({ to: email, leads: leads.length })
      continue
    }
    const result = await sendRendered(renderLeadDigest({ to: email, leads }))
    if (!result.sent) {
      // Kept for tomorrow: a provider outage must not lose a day's leads.
      run.failed.push({ to: email, reason: result.reason ?? "unknown" })
      continue
    }
    // Only what was sent: leads that arrived during the send stay queued.
    await redis.ltrim(queueKey(email), leads.length, -1)
    if (!((await redis.llen(queueKey(email))) > 0)) await redis.srem(PENDING, email)
    run.sent.push(email)
  }
  return run
}
