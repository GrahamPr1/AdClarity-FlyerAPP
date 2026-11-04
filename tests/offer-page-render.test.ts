import { describe, it, expect, vi, beforeEach } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import type { ClientRecord, TrackingRecord } from "@/lib/types"

/**
 * What /r/<code> shows for an edited page: the owner's content, price and end
 * date; past the end date, "This offer has ended" with the business's phone
 * number instead of a dead page, and (on a paid plan) a "Request a quote"
 * form with consent for the business's services; and in every case noindex
 * and a title of
 * "[Business Name] – [Offer headline]".
 */

const db = vi.hoisted(() => ({ record: null as unknown, owner: null as unknown }))
vi.mock("@/lib/store", () => ({
  getTrackingRecord: async () => db.record,
  getClient: async () => db.owner,
  getAgentProfile: async () => null,
  incrementTrackingScan: async () => 1,
}))

const record: TrackingRecord = {
  email: "owner@example.test", flyerId: "flyer-1", businessName: "Pearl Roofing",
  headline: "Fall roof check", offer: "Gutters cleaned free", cta: "Book now", disclaimer: null,
  phone: "(555) 010-0199", website: null, createdAt: "2026-01-01T00:00:00.000Z", redeemUrl: "https://oneflyer.org/r/ABC2345",
  price: "$49", expiresAt: "2099-12-31", offerPageEdited: true,
}
const client = (over: Partial<ClientRecord>) => ({ email: "owner@example.test", plan: "pro", pausedAt: null, ...over }) as ClientRecord
const params = Promise.resolve({ code: "ABC2345" })
const render = async () => {
  const { default: RedeemPage } = await import("@/app/r/[code]/page")
  return renderToStaticMarkup(await RedeemPage({ params }))
}
const metadata = async () => (await import("@/app/r/[code]/page")).generateMetadata({ params })
const FORM = "By submitting, you agree"
const OFFER_CONSENT = "By submitting, you agree Pearl Roofing may contact you about this offer."
const ENDED_CONSENT = "By submitting, you agree Pearl Roofing may contact you about their services."
const ENDED = "This offer has ended. Contact Pearl Roofing for current pricing."

beforeEach(() => {
  db.record = { ...record }
  db.owner = client({})
})

describe("an edited offer page", () => {
  it("shows the owner's headline, price, offer, end date and button", async () => {
    const html = await render()
    for (const text of ["Fall roof check", "$49", "Gutters cleaned free", "Offer ends December 31, 2099", "Book now"]) expect(html).toContain(text)
    expect(html).toContain('href="tel:5550100199"')
    expect(html).toContain(OFFER_CONSENT)
    expect(html).not.toContain("Request a quote")
  })
})

describe("past its end date", () => {
  it.each([
    ["Basic", client({ plan: "basic" })],
    ["Pro", client({ plan: "pro" })],
  ])("%s: says it has ended, with the call button, then a 'Request a quote' form with the services consent line", async (_label, owner) => {
    db.owner = owner
    db.record = { ...record, expiresAt: "2020-01-31" }
    const html = await render()
    expect(html).toContain(ENDED)
    expect(html).toContain("Call (555) 010-0199")
    expect(html).toContain('href="tel:5550100199"')
    expect(html).toContain("Request a quote")
    expect(html).toContain(ENDED_CONSENT)
    expect(html).not.toContain(OFFER_CONSENT)
    expect(html).not.toContain("Gutters cleaned free")
    // The message and call button come first, the form below them.
    expect(html.indexOf(ENDED)).toBeLessThan(html.indexOf("Request a quote"))
    expect(html.indexOf("Call (555) 010-0199")).toBeLessThan(html.indexOf("Request a quote"))
  })

  it.each([
    ["Trial", client({ plan: "trial" })],
    ["paused", client({ plan: "basic", pausedAt: "2026-11-01T00:00:00.000Z" })],
  ])("%s: says it has ended, with the phone number, and no form", async (_label, owner) => {
    db.owner = owner
    db.record = { ...record, expiresAt: "2020-01-31" }
    const html = await render()
    expect(html).toContain(ENDED)
    expect(html).toContain("Call (555) 010-0199")
    expect(html).not.toContain(FORM)
  })
})

describe("title and indexing", () => {
  it("is '[Business Name] – [Offer headline]' and noindex", async () => {
    expect(await metadata()).toEqual({ title: { absolute: "Pearl Roofing – Fall roof check" }, robots: { index: false, follow: false } })
  })

  it("falls back to the business name without a headline", async () => {
    db.record = { ...record, headline: null }
    expect((await metadata()).title).toEqual({ absolute: "Pearl Roofing" })
  })

  it("an unknown code is still noindex", async () => {
    db.record = null
    expect(await metadata()).toEqual({ title: { absolute: "Offer not found" }, robots: { index: false, follow: false } })
  })
})
