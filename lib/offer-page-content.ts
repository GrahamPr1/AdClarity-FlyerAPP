import { z } from "zod"
import type { TrackingRecord } from "./types"

/**
 * The owner-editable content of a flyer's offer page (/r/<code>), and the
 * pure rules for editing it. No Redis here, so every rule is unit-tested; the
 * store applies them to each of the flyer's codes (lib/store.ts).
 *
 * CONTENT ONLY. Nothing here can change where a QR code goes: the code, its
 * redeemUrl and the page's host are untouched, there is no URL field, and
 * every value is rendered as text. The website link keeps coming from the
 * business profile and is not editable.
 *
 * Once the owner edits the page, flyer edits stop overwriting it
 * (offerPageEdited). What the flyer would have set is kept in flyerCopy, so
 * "Reset offer page to match flyer" can restore it.
 */

/** Fields the flyer itself keeps in sync while the page hasn't been edited. */
export type FlyerSyncedContent = Pick<TrackingRecord, "headline" | "offer" | "cta" | "disclaimer" | "phone">

/** Fields the owner can change. Disclaimer, business name and website aren't among them. */
export interface OwnerOfferContent {
  headline: string
  offer: string | null
  price: string | null
  /** YYYY-MM-DD, or null for no end date. */
  expiresAt: string | null
  cta: string
  phone: string
}

/** One-level undo: the page as it was before the last save, reset or undo. */
export interface OfferPageSnapshot extends OwnerOfferContent {
  edited: boolean
}

export const OFFER_PAGE_LIMITS = { headline: 100, offer: 240, price: 40, cta: 40, phone: 30 } as const

const PHONE = /^[0-9+().\-\s]+$/
const digits = (v: string) => v.replace(/\D/g, "").length
const optional = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, `${label} can be at most ${max} characters.`)
    .nullable()
    .optional()
    .transform((v) => (v ? v : null))

export const OwnerOfferSchema = z.object({
  headline: z.string().trim().min(1, "Add a headline.").max(OFFER_PAGE_LIMITS.headline, `The headline can be at most ${OFFER_PAGE_LIMITS.headline} characters.`),
  offer: optional(OFFER_PAGE_LIMITS.offer, "The offer"),
  price: optional(OFFER_PAGE_LIMITS.price, "The price"),
  expiresAt: z
    .string()
    .trim()
    .nullable()
    .optional()
    .transform((v) => (v ? v : null))
    .refine((v) => v === null || isCalendarDate(v), "Pick a real date for the end of the offer."),
  cta: z.string().trim().min(1, "Add a button label.").max(OFFER_PAGE_LIMITS.cta, `The button label can be at most ${OFFER_PAGE_LIMITS.cta} characters.`),
  phone: z
    .string()
    .trim()
    .max(OFFER_PAGE_LIMITS.phone, "That phone number is too long.")
    .refine((v) => PHONE.test(v) && digits(v) >= 7 && digits(v) <= 15, "Add a phone number customers can call."),
})

function isCalendarDate(v: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v)
  if (!m) return false
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const date = new Date(Date.UTC(y, mo - 1, d))
  return y >= 2000 && y <= 2100 && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d
}

/**
 * Whether an offer with this end date has ended at `now`.
 *
 * The date carries no timezone and the business's own isn't known, so the
 * offer runs until that date is over EVERYWHERE (end of day at UTC-12). An
 * offer can end a few hours late for some visitors, but never early.
 */
export function isOfferExpired(expiresAt: string | null | undefined, now: Date = new Date()): boolean {
  if (!expiresAt || !isCalendarDate(expiresAt)) return false
  return now.getTime() > Date.parse(`${expiresAt}T23:59:59.999-12:00`)
}

/** What the owner sees and edits, read from a record (old records included). */
export function ownerContentOf(record: TrackingRecord): OwnerOfferContent {
  return {
    headline: record.headline ?? "",
    offer: record.offer ?? null,
    price: record.price ?? null,
    expiresAt: record.expiresAt ?? null,
    cta: record.cta ?? "Call now",
    phone: record.phone,
  }
}

export function snapshotOf(record: TrackingRecord): OfferPageSnapshot {
  return { ...ownerContentOf(record), edited: !!record.offerPageEdited }
}

/** The flyer-synced fields as they stand: kept aside while edited, live otherwise. */
function flyerContentOf(record: TrackingRecord): FlyerSyncedContent {
  if (record.offerPageEdited && record.flyerCopy) return record.flyerCopy
  const { headline, offer, cta, disclaimer, phone } = record
  return { headline, offer, cta, disclaimer, phone }
}

/** Removes the owner-only fields and the edit flag. */
function withoutOwnerEdits(record: TrackingRecord): TrackingRecord {
  const rest = { ...record }
  delete rest.price
  delete rest.expiresAt
  delete rest.offerPageEdited
  delete rest.flyerCopy
  return rest
}

/** The owner saved the editor. */
export function applyOwnerEdit(record: TrackingRecord, edit: OwnerOfferContent): TrackingRecord {
  return { ...record, ...edit, offerPageEdited: true, flyerCopy: flyerContentOf(record) }
}

/** "Reset offer page to match flyer": back to whatever the flyer says now. */
export function resetToFlyer(record: TrackingRecord): TrackingRecord {
  return { ...withoutOwnerEdits(record), ...flyerContentOf(record) }
}

/** Undo: restore the page as it was before the last change. */
export function restoreSnapshot(record: TrackingRecord, snapshot: OfferPageSnapshot): TrackingRecord {
  if (!snapshot.edited) return resetToFlyer(record)
  const { edited: _edited, ...content } = snapshot
  return applyOwnerEdit(record, content)
}

/**
 * A flyer edit or refinement reaching the offer page. Applied to the live
 * page until the owner has edited it; after that it only updates the copy
 * kept for "Reset offer page to match flyer".
 */
export function applyFlyerSync(record: TrackingRecord, changes: Partial<FlyerSyncedContent>): TrackingRecord {
  if (!record.offerPageEdited) return { ...record, ...changes }
  return { ...record, flyerCopy: { ...flyerContentOf(record), ...changes } }
}
