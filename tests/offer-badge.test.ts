import { describe, it, expect } from "vitest"
import * as cheerio from "cheerio"
import { extractPrice, extractDeadline, offerFromText, offerFromProduct, offerBadgeText, offerBadgeNote, enforceOfferBadgeStyle } from "@/lib/agent-pipeline/offer"
import { fillTemplate, TEMPLATES, readableOn } from "@/lib/agent-pipeline/template-mode"
import { keepPhonesTogether, ensureScrollable } from "@/lib/agent-pipeline/flyer-html"
import { readEditableFields, applyFieldEdits } from "@/lib/agent-pipeline/flyer-edit"
import { checkEditInvariants } from "@/lib/agent-pipeline/edit-invariants"
import { applyQuickEdit } from "@/lib/agent-pipeline/quick-edit"

const OFFER: { price: string; line: string | null; deadline: string | null } = { price: "$99", line: "Fall furnace tune-up", deadline: "Book by Nov 30" }
const fill = (template = TEMPLATES[0], offer: typeof OFFER | null = OFFER, phone = "(502) 555-0142") =>
  fillTemplate({
    template,
    headline: "Beat the first cold snap",
    supporting: "A 21-point safety check for your furnace before winter.",
    businessName: "Miller Heating & Air",
    phone,
    address: "Louisville, KY",
    hasLogo: false,
    hasQr: false,
    photoUrl: null,
    colors: { primary: "#1e3a5c", secondary: "#e8edf2", accent: "#e39a2b" },
    fonts: { heading: "Georgia, serif", body: "Georgia, serif" },
    offer,
  }).html
const ctx = { businessName: "Miller Heating & Air", logoUrl: null, qrDataUrl: null }
const fields = (html: string) => Object.fromEntries(readEditableFields(html).map((f) => [f.field, f.value]))

describe("offer facts come verbatim from the owner's words", () => {
  it("reads the Miller Heating product exactly", () => {
    const text = "Fall furnace tune-up, $99, includes a 21-point safety check. Book by November 30."
    expect(extractPrice(text)).toBe("$99")
    expect(extractDeadline(text)).toBe("Book by Nov 30")
    expect(offerFromProduct({ name: "Fall furnace tune-up", offer: "", pricing: "$99", limitations: ["Book by November 30"] })).toEqual(OFFER)
  })

  it("keeps qualifiers that change the meaning, never invents a price", () => {
    expect(extractPrice("from $350 installed")).toBe("From $350")
    expect(extractPrice("only $1,299.50")).toBe("$1,299.50")
    expect(extractPrice("Save 20% off repairs")).toBe("20% off")
    expect(extractPrice("Free estimates")).toBeNull()
    expect(extractDeadline("offer valid through Sept. 9")).toBe("Ends Sep 9")
    expect(extractDeadline("until 12/15")).toBe("Ends Dec 15")
    expect(offerFromText("Spring cleaning special", "No price given")).toBeNull()
  })

  it("uses the offer half of a product purpose as the line", () => {
    expect(offerFromText("Fall furnace tune-up special — A 21-point safety check", "PRICING (verbatim): $99. Book by November 30.")).toEqual({
      price: "$99",
      line: "Fall furnace tune-up special",
      deadline: "Book by Nov 30",
    })
    expect(offerBadgeText(OFFER)).toBe("$99 · Fall furnace tune-up · Book by Nov 30")
  })
})

describe("the offer badge in every template", () => {
  it.each(TEMPLATES.map((t) => [t.id, t] as const))("%s shows price, line and deadline as editable fields", (_id, template) => {
    const html = fill(template)
    const $ = cheerio.load(html)
    expect($("[data-offer-slot]")).toHaveLength(1)
    expect(fields(html)).toMatchObject({ price: "$99", offer: "Fall furnace tune-up", deadline: "Book by Nov 30" })
  })

  it.each(TEMPLATES.map((t) => [t.id, t] as const))("%s has no badge at all without a price", (_id, template) => {
    const html = fill(template, null)
    expect(html).not.toContain("data-offer-slot")
    expect(html).not.toContain("{{OFFER_BLOCK}}")
    expect(fields(html).price).toBeUndefined()
  })

  it("hides an absent deadline cleanly (empty, :empty-hidden) but keeps it editable", () => {
    const html = fill(TEMPLATES[0], { ...OFFER, deadline: null })
    expect(html).toContain(".offer-deadline:empty")
    expect(fields(html).deadline).toBe("")
  })

  it("puts the editor's fields in reading order: headline, then the offer", () => {
    expect(readEditableFields(fill()).map((f) => f.field).slice(0, 4)).toEqual(["headline", "price", "offer", "deadline"])
  })

  it("sets the badge text for contrast against the brand accent", () => {
    expect(readableOn("#e39a2b")).toBe("#111") // light orange: dark text
    expect(readableOn("#1e3a5c")).toBe("#fff") // navy: white text
    expect(fill()).toContain("--offer-bg:#e39a2b;--offer-fg:#111")
  })
})

describe("phone numbers never wrap", () => {
  it("wraps each number on its own, so two can still break between them", () => {
    const html = fill(TEMPLATES[0], OFFER, "(502) 555-0142 · (502) 555-0199")
    const $ = cheerio.load(html)
    expect($(".oneflyer-nowrap").map((_, el) => $(el).text()).get()).toEqual(["(502) 555-0142", "(502) 555-0199"])
    expect($(".oneflyer-nowrap").first().attr("style")).toBe("white-space:nowrap")
  })

  it("covers AI-written and already-stored flyers, idempotently, and leaves other text alone", () => {
    const ai = `<html><head><title>Call (502) 555-0142</title></head><body><p>Call us at 502-555-0142 &amp; save</p></body></html>`
    const once = ensureScrollable(ai)
    expect(once).toContain(`<span class="oneflyer-nowrap" style="white-space:nowrap">502-555-0142</span> &amp; save`)
    expect(once).toContain("<title>Call (502) 555-0142</title>")
    expect(keepPhonesTogether(once)).toBe(once)
    const plain = "<html><body><p>No numbers here</p></body></html>"
    expect(keepPhonesTogether(plain)).toBe(plain)
  })

  it("survives a field edit", () => {
    const edited = applyFieldEdits(fill(), { phone: "(502) 555-0199" }).html
    expect(cheerio.load(edited)(".oneflyer-nowrap").text()).toBe("(502) 555-0199")
  })
})

describe("quick edits and checks act on the badge", () => {
  const base = fill()
  const edit = (f: Record<string, string | null>, emphasis: "unchanged" | "offer" = "unchanged") =>
    applyQuickEdit(base, {
      fields: { headline: null, supporting: null, phone: null, address: null, price: null, offer: null, deadline: null, ...f },
      style: { look: "unchanged", emphasis },
      cannotApply: null,
      summary: "x",
    })

  it("'change the price to $89' edits the badge and passes the checks", () => {
    const r = edit({ price: "$89" })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(fields(r.html).price).toBe("$89")
    expect(fields(r.html).supporting).toBe(fields(base).supporting)
    expect(checkEditInvariants(base, r.html, "change the price to $89", ctx)).toEqual([])
  })

  it("'make the offer stand out' emphasises the badge", () => {
    const r = edit({}, "offer")
    expect(r.ok && r.html).toContain("[data-offer-slot]{font-size:115%")
    expect(r.ok && checkEditInvariants(base, r.html, "make the offer stand out", ctx)).toEqual([])
  })

  it("rejects an unasked price change, a wrong requested price, a dropped badge or deadline", () => {
    const changed = edit({ price: "$79" })
    expect(changed.ok && checkEditInvariants(base, changed.html, "make it feel more premium", ctx)).toContain("it changed the offer's price")
    expect(changed.ok && checkEditInvariants(base, changed.html, "change the price to $89", ctx)).toContain("the offer badge doesn't show $89")
    const noDeadline = edit({ deadline: "" })
    expect(noDeadline.ok && checkEditInvariants(base, noDeadline.html, "shorten the text", ctx)).toContain("it changed or removed the offer's deadline")
    expect(noDeadline.ok && checkEditInvariants(base, noDeadline.html, "remove the deadline", ctx)).toEqual([])
    const $ = cheerio.load(base)
    $("[data-offer-slot]").remove()
    const gone = $.html()
    expect(checkEditInvariants(base, gone, "shorten the text", ctx)).toContain("it removed the offer badge")
  })

  it("won't empty the price through the editor", () => {
    expect(applyFieldEdits(base, { price: "" }).rejected[0]?.reason).toBe("empty")
  })
})

describe("the badge in AI-written documents (the proposal)", () => {
  it("asks for the exact facts, with hooks that don't make the document field-editable", () => {
    const note = offerBadgeNote(OFFER)
    expect(note).toContain('data-offer-field="price">$99<')
    expect(note).toContain("Book by Nov 30")
    expect(note).not.toContain("data-field=")
  })

  it("enforces prominence in code, once, and leaves documents without a badge alone", () => {
    const doc = `<html><head><style>.offer{font-size:9px}</style></head><body><div class="offer" data-offer-slot><span data-offer-field="price">$99</span></div></body></html>`
    const styled = enforceOfferBadgeStyle(doc)
    expect(styled).toContain('[data-offer-slot] [data-offer-field="price"]{font-size:2.4em!important')
    expect(enforceOfferBadgeStyle(styled)).toBe(styled)
    const plain = "<html><head></head><body><p>No offer</p></body></html>"
    expect(enforceOfferBadgeStyle(plain)).toBe(plain)
  })
})
