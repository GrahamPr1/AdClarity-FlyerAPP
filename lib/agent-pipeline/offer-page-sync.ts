import { readEditableFields } from "./flyer-edit"
import { getTrackingRecord, updateTrackingContentForFlyer } from "@/lib/store"

/**
 * Carries an edit through to the QR offer page (/r/<code>), which shows its
 * own copy of the headline, offer, CTA and phone — the flyer's original code
 * and every per-channel code. Without this, a corrected price or phone number
 * appeared on the flyer but not on the page its QR code opens.
 *
 * The offer page's "offer" is the agent's summary, not a field on the flyer.
 * It follows the flyer's supporting text only when it was the same text to
 * begin with; otherwise it isn't touched, rather than overwritten with
 * something that was never the offer.
 */
export async function syncOfferPage(flyerId: string, trackingCode: string | undefined, before: string, after: string) {
  if (!trackingCode) return
  const was = Object.fromEntries(readEditableFields(before).map((f) => [f.field, f.value]))
  const now = Object.fromEntries(readEditableFields(after).map((f) => [f.field, f.value]))
  const changed = (field: string) => (now[field] !== undefined && now[field] !== was[field] ? now[field] : undefined)
  const record = await getTrackingRecord(trackingCode)
  const supporting = changed("supporting")
  // The offer badge: when its price, line or deadline changed, the offer page
  // states the new badge — if it was showing the old badge to begin with.
  const badge = (f: Record<string, string>) => [f.price, f.offer, f.deadline].filter(Boolean).join(" · ")
  const badgeChanged = (was.price ?? "") !== "" && badge(now) !== badge(was)
  await updateTrackingContentForFlyer(flyerId, trackingCode, {
    headline: changed("headline"),
    cta: changed("cta"),
    phone: changed("phone"),
    offer:
      badgeChanged && record?.offer?.trim() === badge(was)
        ? badge(now)
        : supporting !== undefined && record?.offer?.trim() === was.supporting?.trim()
          ? supporting
          : undefined,
  })
}
