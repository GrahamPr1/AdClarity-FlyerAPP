import QRCode from "qrcode"
import { createTrackingRecord, updateTrackingRecordContent } from "@/lib/store"
import { getSiteUrl } from "@/lib/site-url"
import type { NormalizedIntake } from "./schemas/intake"
import type { FlyerSpecification } from "./schemas/flyer"

const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789" // same no-0/O-1/I alphabet as client access codes — avoids misread codes on a printed flyer
const CODE_LENGTH = 7

function generateTrackingCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(CODE_LENGTH))
  return Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("")
}

/**
 * Generates a flyer's tracking code and QR image BEFORE the Flyer Agent
 * runs (the agent needs a real, already-resolved image to embed — same
 * pattern as the client-photo pool) and saves a placeholder record with
 * only what's known this early: who it's for and their contact info.
 * headline/offer/cta/disclaimer get backfilled once the agent responds
 * (see backfillTrackingContent) — there's no way to know them before the
 * flyer itself is designed.
 */
export async function createFlyerTrackingCode(
  email: string,
  flyerId: string,
  intake: NormalizedIntake,
): Promise<{ code: string; qrDataUrl: string }> {
  const code = generateTrackingCode()
  const redeemUrl = `${getSiteUrl()}/r/${code}`
  const qrDataUrl = await QRCode.toDataURL(redeemUrl, { margin: 1, width: 512 })

  await createTrackingRecord(code, {
    email,
    flyerId,
    businessName: intake.businessName,
    headline: null,
    offer: null,
    cta: null,
    disclaimer: null,
    phone: intake.contact.phone,
    website: intake.contact.website,
    createdAt: new Date().toISOString(),
  })

  return { code, qrDataUrl }
}

/**
 * Rebuilds the QR image for a code that already exists.
 *
 * Deterministic: the image is a pure function of the redeem URL, so a
 * refinement re-embeds the SAME QR rather than issuing a new code. Issuing a
 * new one would silently invalidate every already-printed copy of that flyer.
 */
export async function qrDataUrlForCode(code: string): Promise<string> {
  return QRCode.toDataURL(`${getSiteUrl()}/r/${code}`, { margin: 1, width: 512 })
}

export async function backfillTrackingContent(code: string, flyer: FlyerSpecification): Promise<void> {
  await updateTrackingRecordContent(code, {
    headline: flyer.headline,
    offer: flyer.offer,
    cta: flyer.cta,
    disclaimer: flyer.disclaimer,
  })
}
