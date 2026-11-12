import { createHmac, timingSafeEqual } from "node:crypto"
import { Redis } from "@upstash/redis"

/**
 * What happens AFTER Resend accepts a public email: bounces, a single retry,
 * and telling the owner when their lead email didn't arrive.
 *
 * "Sent" from the API only means Resend took the message. A production lead
 * email to iCloud was then refused by Apple (554 5.7.1, transient) and nobody
 * could tell. Resend reports that outcome by webhook (/api/webhooks/resend):
 *
 *   - Each public email we want followed is recorded at send time by its
 *     Resend id (email-sent:v1:<id>, 14 days). Events for any other mail on
 *     the same Resend account — NOP's sign-in codes and the rest — have no
 *     record and are ignored.
 *   - A TRANSIENT bounce is retried once, an hour later, using Resend's own
 *     scheduled send (no cron). The retry is attempt 2 and is never retried.
 *   - Any bounce leaves a notice on the owner's account, shown on the
 *     dashboard; a later lead email that IS delivered clears it.
 */

const redis = Redis.fromEnv()

export interface SentRecord {
  kind: "lead"
  owner: string
  /** The tracking code and lead, to re-send the same email. */
  code: string
  leadId: string
  attempt: 1 | 2
}

const sentKey = (id: string) => `email-sent:v1:${id}`
const noticeKey = (owner: string) => `email-notice:v1:${owner.trim().toLowerCase()}`
const SENT_TTL_SECONDS = 14 * 24 * 60 * 60

export async function recordSent(id: string | undefined, record: SentRecord): Promise<void> {
  if (!id) return
  await redis.set(sentKey(id), record, { ex: SENT_TTL_SECONDS }).catch((err) => console.warn(`[email-delivery] could not record ${id}: ${err instanceof Error ? err.message : err}`))
}

export interface DeliveryNotice {
  kind: "lead"
  /** The address that refused it. */
  address: string
  /** "temporary" while a retry is pending, "permanent" when the address itself was refused. */
  type: "temporary" | "permanent"
  retrying: boolean
  at: string
}

export async function getDeliveryNotice(owner: string): Promise<DeliveryNotice | null> {
  return (await redis.get<DeliveryNotice>(noticeKey(owner)).catch(() => null)) ?? null
}

/* ----------------------------- Signature check ----------------------------- */

/** Svix-style webhooks (what Resend sends): reject anything unsigned, tampered, or older than this. */
const TOLERANCE_SECONDS = 5 * 60

export function verifyResendSignature(
  body: string,
  headers: { id: string | null; timestamp: string | null; signature: string | null },
  secret: string,
  now: number = Date.now(),
): boolean {
  if (!headers.id || !headers.timestamp || !headers.signature) return false
  const ts = Number(headers.timestamp)
  if (!Number.isFinite(ts) || Math.abs(now / 1000 - ts) > TOLERANCE_SECONDS) return false
  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64")
  const expected = createHmac("sha256", key).update(`${headers.id}.${headers.timestamp}.${body}`).digest()
  // The header can carry several signatures ("v1,<b64> v1,<b64>") during a secret rotation.
  return headers.signature.split(" ").some((part) => {
    const [version, sig] = part.split(",")
    if (version !== "v1" || !sig) return false
    const given = Buffer.from(sig, "base64")
    return given.length === expected.length && timingSafeEqual(given, expected)
  })
}

/* --------------------------------- Events ---------------------------------- */

export interface ResendEvent {
  type: string
  created_at?: string
  data: {
    email_id: string
    to?: string[]
    bounce?: { type?: string; subType?: string; message?: string }
  }
}

export type EventOutcome =
  | { handled: false; why: string }
  | { handled: true; action: "retry_scheduled" | "notice_set" | "notice_cleared" | "nothing" }

/**
 * Applies one webhook event. `resend` re-sends the original email (an hour
 * later) and returns the new Resend id — injected so this stays testable and
 * so the lead email is built in exactly one place (lib/email.ts).
 */
export async function handleResendEvent(event: ResendEvent, resend: (record: SentRecord) => Promise<string | null>): Promise<EventOutcome> {
  const record = await redis.get<SentRecord>(sentKey(event.data.email_id)).catch(() => null)
  if (!record) return { handled: false, why: "not an email we follow" }

  if (event.type === "email.delivered") {
    const notice = await getDeliveryNotice(record.owner)
    if (!notice) return { handled: true, action: "nothing" }
    await redis.del(noticeKey(record.owner))
    console.log(`[email-delivery] ${event.data.email_id}: delivered to ${record.owner}; delivery notice cleared`)
    return { handled: true, action: "notice_cleared" }
  }

  if (event.type !== "email.bounced") return { handled: true, action: "nothing" }

  const temporary = (event.data.bounce?.type ?? "").toLowerCase() === "transient"
  const address = event.data.to?.[0] ?? record.owner
  const retry = temporary && record.attempt === 1
  let retried = false
  if (retry) {
    const newId = await resend(record).catch((err) => {
      console.error(`[email-delivery] retry of ${event.data.email_id} failed to schedule: ${err instanceof Error ? err.message : err}`)
      return null
    })
    if (newId) {
      await recordSent(newId, { ...record, attempt: 2 })
      retried = true
    }
  }
  const notice: DeliveryNotice = { kind: "lead", address, type: temporary ? "temporary" : "permanent", retrying: retried, at: new Date().toISOString() }
  await redis.set(noticeKey(record.owner), notice)
  console.warn(
    `[email-delivery] ${event.data.email_id} bounced (${event.data.bounce?.type ?? "unknown"}: ${event.data.bounce?.message ?? ""}) for ${record.owner}; ` +
      (retried ? "retry scheduled for an hour from now" : "not retried"),
  )
  return { handled: true, action: retried ? "retry_scheduled" : "notice_set" }
}
