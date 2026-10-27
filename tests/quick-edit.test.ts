import { describe, it, expect } from "vitest"
import { fillTemplate, TEMPLATES } from "@/lib/agent-pipeline/template-mode"
import { substituteQr, substituteLogo } from "@/lib/agent-pipeline/flyer-html"
import { applyQuickEdit, applyQuickEditStyle, readQuickEditStyle } from "@/lib/agent-pipeline/quick-edit"
import { checkEditInvariants } from "@/lib/agent-pipeline/edit-invariants"
import { readEditableFields } from "@/lib/agent-pipeline/flyer-edit"
import { POLISH_AGENT_SYSTEM_PROMPT } from "@/lib/agent-pipeline/prompts/polish"
import { QUICK_EDIT_AGENT_SYSTEM_PROMPT } from "@/lib/agent-pipeline/prompts/quick-edit"
import { COPY_RULES, MARKETING_PRINCIPLES } from "@/lib/agent-pipeline/prompts/marketing-guidance"
import type { QuickEditAgentOutput } from "@/lib/agent-pipeline/schemas/quick-edit"

const QR = "data:image/png;base64,QRQRQR"
const LOGO = "https://oneflyer.org/api/photos/onboarding-photos/rehosted/logo/a.png"
const ctx = { businessName: "Miller Heating & Air", logoUrl: LOGO, qrDataUrl: QR }

/** A stored template flyer: real template output with the QR and logo substituted in, as the pipeline saves it. */
const flyer = substituteLogo(
  substituteQr(
    fillTemplate({
      template: TEMPLATES[0],
      headline: "Fall Furnace Tune-Up for $89",
      supporting: "21-point safety check before the cold hits. Book by November 30.",
      businessName: "Miller Heating & Air",
      phone: "(502) 555-0142",
      address: "Louisville, KY",
      hasLogo: true,
      hasQr: true,
      photoUrl: null,
      colors: { primary: "#12314f", secondary: "#e8edf2", accent: "#e39a2b" },
      fonts: { heading: "Georgia, serif", body: "Georgia, serif" },
    }).html,
    QR,
  ),
  LOGO,
)

const proposal = (over: Partial<QuickEditAgentOutput> = {}): QuickEditAgentOutput => ({
  fields: { headline: null, supporting: null, phone: null, address: null, price: null, offer: null, deadline: null },
  style: { look: "unchanged", emphasis: "unchanged" },
  cannotApply: null,
  summary: "Done.",
  ...over,
})
const field = (html: string, name: string) => readEditableFields(html).find((f) => f.field === name)?.value

describe("shared guidance", () => {
  it("the quick edit gets the same copy rules and marketing principles as generation — from one module", () => {
    expect(POLISH_AGENT_SYSTEM_PROMPT).toContain(COPY_RULES)
    expect(QUICK_EDIT_AGENT_SYSTEM_PROMPT).toContain(COPY_RULES)
    expect(QUICK_EDIT_AGENT_SYSTEM_PROMPT).toContain(MARKETING_PRINCIPLES)
  })
})

describe("applyQuickEdit", () => {
  it("changes only the fields the edit names", () => {
    const r = applyQuickEdit(flyer, proposal({ fields: { headline: null, supporting: "24/7 emergency service. 21-point check for $89.", phone: null, address: null, price: null, offer: null, deadline: null } }))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.changedFields).toEqual(["supporting"])
    expect(field(r.html, "supporting")).toBe("24/7 emergency service. 21-point check for $89.")
    expect(field(r.html, "headline")).toBe("Fall Furnace Tune-Up for $89")
    expect(r.html).toContain(QR)
    expect(r.html).toContain(LOGO)
  })

  it("refuses text over a field's physical limit instead of overflowing it", () => {
    const r = applyQuickEdit(flyer, proposal({ fields: { headline: "x".repeat(200), supporting: null, phone: null, address: null, price: null, offer: null, deadline: null } }))
    expect(r.ok).toBe(false)
  })

  it("inserts the model's text as text, never markup", () => {
    const r = applyQuickEdit(flyer, proposal({ fields: { headline: '<img src=x onerror="alert(1)">', supporting: null, phone: null, address: null, price: null, offer: null, deadline: null } }))
    expect(r.ok && r.html.includes("<img src=x")).toBe(false)
  })

  it("reports a no-op honestly", () => {
    const r = applyQuickEdit(flyer, proposal({ cannotApply: "This layout has no room for a second photo." }))
    expect(r).toEqual({ ok: false, reason: "This layout has no room for a second photo." })
  })

  it("style is one replaceable block: looks and emphasis don't stack", () => {
    const once = applyQuickEditStyle(flyer, { look: "editorial", emphasis: "supporting" })
    const twice = applyQuickEditStyle(once, { look: "unchanged", emphasis: "headline" })
    expect(readQuickEditStyle(twice)).toEqual({ look: "editorial", emphasis: "headline" })
    expect(twice.match(/data-quick-edit-style/g)).toHaveLength(1)
    expect(twice).toContain("Palatino")
    // The highlight uses the brand's own accent colour, never a new one.
    expect(twice).toContain("var(--brand-accent)")
    expect(twice).not.toMatch(/--brand-(primary|secondary|accent)\s*:\s*#(?!12314f|e8edf2|e39a2b)/)
  })
})

describe("checkEditInvariants", () => {
  const withSupporting = (text: string) => applyQuickEdit(flyer, proposal({ fields: { headline: null, supporting: text, phone: null, address: null, price: null, offer: null, deadline: null } }))
  const withFields = (f: Partial<QuickEditAgentOutput["fields"]>) =>
    applyQuickEdit(flyer, proposal({ fields: { headline: null, supporting: null, phone: null, address: null, price: null, offer: null, deadline: null, ...f } }))
  const html = (r: ReturnType<typeof applyQuickEdit>) => (r.ok ? r.html : "")

  it("passes a good edit", () => {
    expect(checkEditInvariants(flyer, html(withSupporting("24/7 emergency service. 21-point check, book by Nov 30.")), "add 24/7 emergency service", ctx)).toEqual([])
  })

  it("rejects losing or altering the phone number", () => {
    expect(checkEditInvariants(flyer, html(withFields({ phone: "(502) 555-0000" })), "make it feel more premium", ctx)).toContain("it removed or changed the phone number")
  })

  it("allows a second phone number, and requires the one given", () => {
    const two = html(withFields({ phone: "(502) 555-0142 · (502) 555-0199" }))
    expect(checkEditInvariants(flyer, two, "add a second phone number, (502) 555-0199", ctx)).toEqual([])
    const wrong = html(withFields({ phone: "(502) 555-0142 · (502) 555-0198" }))
    expect(checkEditInvariants(flyer, wrong, "add a second phone number, (502) 555-0199", ctx)).toContain(
      "the phone number you gave isn't on the flyer exactly as written",
    )
  })

  it("allows replacing the phone number when asked", () => {
    expect(checkEditInvariants(flyer, html(withFields({ phone: "(502) 555-0199" })), "change the phone number to (502) 555-0199", ctx)).toEqual([])
  })

  it("rejects dropping the price unless the request is about price, and requires a requested price", () => {
    const noPrice = html(withFields({ headline: "Fall Furnace Tune-Up" }))
    expect(checkEditInvariants(flyer, noPrice, "shorten the text", ctx)).toContain("it dropped the offer's price")
    const p79 = html(withFields({ headline: "Fall Furnace Tune-Up for $79" }))
    expect(checkEditInvariants(flyer, p79, "change the price to $89", ctx)).toContain("the price you asked for ($89) isn't on the flyer")
    const p89 = html(withFields({ headline: "Fall Furnace Tune-Up, Now $89" }))
    expect(checkEditInvariants(flyer, p89, "change the price to $89", ctx)).toEqual([])
  })

  it("rejects removing the QR code, logo or business name", () => {
    expect(checkEditInvariants(flyer, flyer.replace(QR, "x"), "x", ctx)).toContain("it removed the QR code")
    expect(checkEditInvariants(flyer, flyer.split(LOGO).join("https://example.com/l.png"), "x", ctx)).toContain("it removed the logo")
    expect(checkEditInvariants(flyer, flyer.split("Miller Heating &amp; Air").join("Miller"), "x", ctx)).toContain("it removed the business name")
  })

  it("rejects a changed page size and anything executable", () => {
    expect(checkEditInvariants(flyer, flyer.replace("html,body{width:850px;height:1100px}", "html,body{width:850px;height:1400px}"), "x", ctx)).toContain(
      "it changed the page size or layout box",
    )
    expect(checkEditInvariants(flyer, flyer.replace("</body>", "<script>alert(1)</script></body>"), "x", ctx)).toContain("it added script or other unsafe content")
    expect(checkEditInvariants(flyer, flyer.replace('alt=""', 'alt="" onload="x()"'), "x", ctx)).toContain("it added script or other unsafe content")
  })

  it("does not block an edit for something the flyer never had", () => {
    expect(checkEditInvariants(flyer, html(withSupporting("21-point check before winter. Book by Nov 30.")), "shorten the text", { ...ctx, qrDataUrl: "data:other" })).toEqual([])
  })
})
