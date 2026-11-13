import { describe, it, expect } from "vitest"
import { fillTemplate, selectTemplate } from "@/lib/agent-pipeline/template-mode"
import { templateById } from "@/lib/agent-pipeline/templates"
import { FlyerRequestSchema } from "@/lib/agent-pipeline/schemas/flyer"
import { encodeFlyerHtml } from "@/lib/flyer-data-url"
import { designInputs, designOfDeliverable, readFlyerDesign, templateForRequest } from "@/lib/flyer-design"

/**
 * "New promotion from this campaign" keeps the source flyer's design: the
 * layout template (print and Instagram square), colours and fonts are read
 * back from its stored HTML and used instead of a fresh per-flyer pick.
 * Requests without a kept design are drawn exactly as before.
 */

const colors = { primary: "#7a1f2b", secondary: "#f4e9e1", accent: "#d9a441" }
const fonts = { heading: `"Playfair Display", Georgia, serif`, body: `"Source Sans 3", Arial, sans-serif` }
const draw = (templateId: string) =>
  fillTemplate({
    template: templateById(templateId)!,
    headline: "Roof inspection",
    supporting: "Free for homeowners this month.",
    businessName: "Pearl Roofing",
    phone: "270-555-0100",
    address: null,
    hasLogo: false,
    hasQr: true,
    photoUrl: null,
    colors,
    fonts,
  }).html

/** A flyer id whose own per-flyer pick is NOT `templateId`, so keeping it is visible. */
function idNotPicking(templateId: string, formatId = "flyer"): string {
  for (let i = 0; ; i++) if (selectTemplate(`new-${i}`, formatId)?.id !== templateId) return `new-${i}`
}

describe("reading a stored flyer's design", () => {
  it("round-trips layout, colours and fonts from a drawn template flyer, and the square's layout", () => {
    expect(readFlyerDesign(draw("split-vertical"), draw("social-square"))).toEqual({
      templateId: "split-vertical",
      squareTemplateId: "social-square",
      colors,
      fonts,
    })
  })
  it("from a deliverable's stored data URLs", () => {
    const design = designOfDeliverable({ downloadUrl: encodeFlyerHtml(draw("door-hanger-stack")), repurposed: undefined })
    expect(design).toMatchObject({ templateId: "door-hanger-stack", colors })
  })
  it("an AI-drawn flyer (no template, no variables) gives nothing to keep", () => {
    expect(readFlyerDesign("<html><body><h1>Roof sale</h1></body></html>", null)).toEqual({})
    expect(designOfDeliverable({ downloadUrl: undefined, repurposed: undefined })).toEqual({})
  })
  it("anything that isn't a plain colour or font name is dropped, not passed into CSS", () => {
    const html = `<style>:root{--brand-primary:red;--brand-secondary:#fff;--brand-accent:#000;--font-heading:x</style><script>;--font-body:Arial}</style>`
    expect(readFlyerDesign(html)).toEqual({})
  })
})

describe("drawing a request", () => {
  it("a kept template is used instead of the per-flyer pick", () => {
    const id = idNotPicking("split-vertical")
    expect(templateForRequest({ id, keepDesign: { templateId: "split-vertical" } }, "flyer")?.id).toBe("split-vertical")
  })
  it("the kept Instagram square is used for the square", () => {
    expect(templateForRequest({ id: "x", keepDesign: { squareTemplateId: "social-square" } }, "social-post", "square")?.id).toBe("social-square")
  })
  it("a kept template that doesn't suit the format is ignored", () => {
    const id = idNotPicking("door-hanger-stack")
    expect(templateForRequest({ id, keepDesign: { templateId: "door-hanger-stack" } }, "flyer")?.id).toBe(selectTemplate(id, "flyer")?.id)
  })
  it("without a kept design, exactly the previous choice and colours (agent and NOP requests never carry one)", () => {
    for (const id of ["a", "b", "c", "d"]) {
      expect(templateForRequest({ id }, "flyer")).toBe(selectTemplate(id, "flyer"))
      expect(templateForRequest({ id }, "social-post", "square")).toBe(selectTemplate(id, "social-post"))
    }
    const brand = { colors: [{ hex: "#111111" }, { hex: "#222222" }, { hex: "#333333" }], fonts: { heading: "Georgia, serif", body: "Arial" } }
    expect(designInputs({}, brand)).toEqual({ colors: { primary: "#111111", secondary: "#222222", accent: "#333333" }, fonts: brand.fonts })
    expect(designInputs({}, null)).toEqual({ colors: { primary: "#12314f", secondary: "#eef1f4", accent: "#e39a2b" }, fonts: { heading: "Georgia, serif", body: "Georgia, serif" } })
  })
  it("kept colours and fonts win over the brand profile", () => {
    expect(designInputs({ keepDesign: { colors, fonts } }, { colors: [{ hex: "#111111" }], fonts: { heading: "A", body: "B" } })).toEqual({ colors, fonts })
  })
  it("the request schema keeps keepDesign and refuses a colour that isn't a hex value", () => {
    expect(FlyerRequestSchema.parse({ id: "x", purpose: "p", notes: null, keepDesign: { templateId: "split-vertical", colors } }).keepDesign).toEqual({ templateId: "split-vertical", colors })
    expect(FlyerRequestSchema.safeParse({ id: "x", purpose: "p", notes: null, keepDesign: { colors: { ...colors, primary: "red" } } }).success).toBe(false)
  })
})
