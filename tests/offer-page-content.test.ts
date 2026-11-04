import { describe, it, expect } from "vitest"
import { OwnerOfferSchema, applyFlyerSync, applyOwnerEdit, isOfferExpired, ownerContentOf, resetToFlyer, restoreSnapshot, snapshotOf, type OwnerOfferContent } from "@/lib/offer-page-content"
import type { TrackingRecord } from "@/lib/types"

/**
 * The rules for editing a flyer's offer page: the owner's edit sticks, flyer
 * edits stop overwriting it but are kept for "Reset offer page to match
 * flyer", one-level undo works through edits and resets, and nothing about
 * where the QR code goes ever changes.
 */

const base: TrackingRecord = {
  email: "owner@example.test", flyerId: "flyer-1", businessName: "Pearl Roofing",
  headline: "Spring roof check", offer: "Free gutter clean with any repair", cta: "Call now", disclaimer: "Residential only.",
  phone: "555-0142", website: "pearlroofing.example", createdAt: "2026-01-01T00:00:00.000Z",
  redeemUrl: "https://oneflyer.org/r/ABC2345",
}
const edit: OwnerOfferContent = { headline: "Fall roof check", offer: "Gutters cleaned free", price: "$49", expiresAt: "2026-11-30", cta: "Book now", phone: "555-0199" }
/** Identity fields: who, which flyer, where the QR goes. No edit may touch them. */
const identity = (r: TrackingRecord) => ({ email: r.email, flyerId: r.flyerId, businessName: r.businessName, website: r.website, disclaimer: r.disclaimer, createdAt: r.createdAt, redeemUrl: r.redeemUrl, channelLabel: r.channelLabel, parentCode: r.parentCode })

describe("an owner edit", () => {
  it("shows the owner's content and marks the page edited", () => {
    const r = applyOwnerEdit(base, edit)
    expect(ownerContentOf(r)).toEqual(edit)
    expect(r.offerPageEdited).toBe(true)
    expect(r.flyerCopy).toEqual({ headline: base.headline, offer: base.offer, cta: base.cta, disclaimer: base.disclaimer, phone: base.phone })
  })

  it("never changes the QR target, the business or the website", () => {
    const r = applyOwnerEdit(base, edit)
    expect(identity(r)).toEqual(identity(base))
    expect(r.redeemUrl).toBe("https://oneflyer.org/r/ABC2345")
  })
})

describe("flyer edits after the owner's edit", () => {
  it("don't overwrite the page, and are kept for reset", () => {
    const edited = applyOwnerEdit(base, edit)
    const synced = applyFlyerSync(edited, { headline: "Winter roof check", phone: "555-0100" })
    expect(ownerContentOf(synced)).toEqual(edit)
    expect(synced.flyerCopy).toMatchObject({ headline: "Winter roof check", phone: "555-0100" })
  })

  it("still flow straight through to a page nobody has edited (the old behaviour)", () => {
    const synced = applyFlyerSync(base, { headline: "Winter roof check" })
    expect(synced.headline).toBe("Winter roof check")
    expect(synced.offerPageEdited).toBeUndefined()
  })
})

describe("reset to match flyer", () => {
  it("puts back what the flyer says now, including flyer edits made since, and clears owner-only fields", () => {
    const edited = applyFlyerSync(applyOwnerEdit(base, edit), { headline: "Winter roof check" })
    const r = resetToFlyer(edited)
    expect(r.headline).toBe("Winter roof check")
    expect(r.phone).toBe(base.phone)
    expect(r.cta).toBe(base.cta)
    for (const k of ["price", "expiresAt", "offerPageEdited", "flyerCopy"] as const) expect(k in r).toBe(false)
    expect(identity(r)).toEqual(identity(base))
  })
})

describe("one-level undo", () => {
  it("undoing the first edit returns to following the flyer", () => {
    const snap = snapshotOf(base)
    const r = restoreSnapshot(applyOwnerEdit(base, edit), snap)
    expect(ownerContentOf(r)).toEqual(ownerContentOf(base))
    expect(r.offerPageEdited).toBeUndefined()
  })

  it("undoing a second edit returns to the first", () => {
    const first = applyOwnerEdit(base, edit)
    const snap = snapshotOf(first)
    const second = applyOwnerEdit(first, { ...edit, headline: "Second headline", price: null })
    const r = restoreSnapshot(second, snap)
    expect(ownerContentOf(r)).toEqual(edit)
    expect(r.offerPageEdited).toBe(true)
    expect(r.flyerCopy).toEqual(first.flyerCopy)
  })

  it("undoing a reset brings the owner's edits back", () => {
    const edited = applyOwnerEdit(base, edit)
    const snap = snapshotOf(edited)
    const r = restoreSnapshot(resetToFlyer(edited), snap)
    expect(ownerContentOf(r)).toEqual(edit)
    expect(r.offerPageEdited).toBe(true)
  })
})

describe("records from before offer-page editing", () => {
  it("read with sensible defaults and no new fields required", () => {
    const old = { ...base, cta: null } as TrackingRecord
    delete (old as Partial<TrackingRecord>).redeemUrl
    expect(ownerContentOf(old)).toEqual({ headline: base.headline, offer: base.offer, price: null, expiresAt: null, cta: "Call now", phone: base.phone })
    expect(isOfferExpired(old.expiresAt)).toBe(false)
  })
})

describe("the edit form's server-side validation", () => {
  const ok = { headline: "Fall roof check", offer: "", price: "", expiresAt: "", cta: "Book now", phone: "(555) 010-0142" }

  it("accepts a minimal edit and turns blanks into null", () => {
    expect(OwnerOfferSchema.parse(ok)).toEqual({ headline: "Fall roof check", offer: null, price: null, expiresAt: null, cta: "Book now", phone: "(555) 010-0142" })
  })

  it("drops anything that isn't a content field: no URL, host, code or business can be set", () => {
    const parsed = OwnerOfferSchema.parse({ ...ok, redeemUrl: "https://evil.example", website: "https://evil.example", code: "XYZ", email: "x@y", businessName: "Not you", flyerId: "other" })
    expect(Object.keys(parsed).sort()).toEqual(["cta", "expiresAt", "headline", "offer", "phone", "price"])
  })

  it.each([
    ["an empty headline", { headline: " " }],
    ["a headline over 100", { headline: "x".repeat(101) }],
    ["an offer over 240", { offer: "x".repeat(241) }],
    ["a price over 40", { price: "x".repeat(41) }],
    ["an empty button label", { cta: "" }],
    ["a button label over 40", { cta: "x".repeat(41) }],
    ["a phone with letters", { phone: "call us" }],
    ["a phone with too few digits", { phone: "12345" }],
    ["a date that doesn't exist", { expiresAt: "2026-02-30" }],
    ["a date in the wrong format", { expiresAt: "11/30/2026" }],
  ])("rejects %s", (_label, over) => {
    expect(OwnerOfferSchema.safeParse({ ...ok, ...over }).success).toBe(false)
  })
})

describe("offer end date", () => {
  it("runs through the whole end date everywhere, then ends", () => {
    // 2026-11-30 is over everywhere at 2026-12-01 11:59:59.999 UTC (end of day at UTC-12).
    expect(isOfferExpired("2026-11-30", new Date("2026-11-30T23:00:00Z"))).toBe(false)
    expect(isOfferExpired("2026-11-30", new Date("2026-12-01T11:59:59.000Z"))).toBe(false)
    expect(isOfferExpired("2026-11-30", new Date("2026-12-01T12:00:00.000Z"))).toBe(true)
  })

  it("is never expired without a valid date", () => {
    expect(isOfferExpired(null)).toBe(false)
    expect(isOfferExpired("not a date")).toBe(false)
  })
})
