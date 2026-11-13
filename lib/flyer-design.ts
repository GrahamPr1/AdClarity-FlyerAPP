import { decodeFlyerHtml } from "@/lib/flyer-data-url"
import type { FlyerDeliverable } from "@/lib/types"
import type { FlyerRequest } from "@/lib/agent-pipeline/schemas/flyer"
import { selectTemplate, templateById } from "@/lib/agent-pipeline/template-mode"
import type { FlyerTemplate } from "@/lib/agent-pipeline/templates"

/**
 * The design an existing flyer was drawn with, read back from its stored HTML,
 * so "new promotion from this campaign" keeps it and only the offer changes.
 *
 * A template flyer records everything needed: the layout on the page element
 * (data-template="split-vertical") and the colours and fonts in one :root rule
 * (--brand-primary/secondary/accent, --font-heading/body), written by
 * fillTemplate. Reading the stored flyer, rather than saving the design at
 * generation time, gives exactly what was drawn and covers flyers made before
 * this existed. Anything missing or malformed is simply left out, and the
 * pipeline picks as normal for that part (an AI-drawn flyer has no template).
 */

export type KeptDesign = NonNullable<FlyerRequest["keepDesign"]>

const HEX = /^#[0-9a-f]{3,8}$/i
const FONT = /^[\w\s,"'-]+$/

function rootVars(html: string): Map<string, string> {
  const vars = new Map<string, string>()
  const rule = html.match(/:root\{([^}]*)\}/)
  if (!rule) return vars
  for (const decl of rule[1].split(";")) {
    const i = decl.indexOf(":")
    if (i > 0) vars.set(decl.slice(0, i).trim(), decl.slice(i + 1).trim())
  }
  return vars
}

const templateIdOf = (html: string) => html.match(/<div class="page" data-template="([a-z0-9-]+)"/)?.[1]

/** The parts of a stored flyer's design that can be reused; empty when none can. */
export function readFlyerDesign(flyerHtml: string | null, squareHtml?: string | null): KeptDesign {
  const design: KeptDesign = {}
  if (flyerHtml) {
    const templateId = templateIdOf(flyerHtml)
    if (templateId) design.templateId = templateId
    const vars = rootVars(flyerHtml)
    const [primary, secondary, accent] = ["--brand-primary", "--brand-secondary", "--brand-accent"].map((k) => vars.get(k) ?? "")
    if ([primary, secondary, accent].every((c) => HEX.test(c))) design.colors = { primary, secondary, accent }
    const [heading, body] = ["--font-heading", "--font-body"].map((k) => vars.get(k) ?? "")
    if (heading && body && FONT.test(heading) && FONT.test(body)) design.fonts = { heading, body }
  }
  const squareId = squareHtml ? templateIdOf(squareHtml) : undefined
  if (squareId) design.squareTemplateId = squareId
  return design
}

/** readFlyerDesign for a deliverable: its print HTML and its Instagram square. */
export function designOfDeliverable(flyer: Pick<FlyerDeliverable, "downloadUrl" | "repurposed">): KeptDesign {
  const html = flyer.downloadUrl ? decodeFlyerHtml(flyer.downloadUrl) : null
  const square = flyer.repurposed?.instagramDownloadUrl ? decodeFlyerHtml(flyer.repurposed.instagramDownloadUrl) : null
  return readFlyerDesign(html, square)
}

/* ------------------------- Used by the template path ------------------------ */

/**
 * The template a request is drawn with: the kept one when it suits this
 * format, otherwise the usual per-flyer choice (selectTemplate).
 */
export function templateForRequest(
  request: Pick<FlyerRequest, "id" | "keepDesign">,
  formatId: string,
  which: "page" | "square" = "page",
): FlyerTemplate | null {
  const keptId = which === "page" ? request.keepDesign?.templateId : request.keepDesign?.squareTemplateId
  const kept = keptId ? templateById(keptId) : null
  return kept?.formatIds.includes(formatId) ? kept : selectTemplate(request.id, formatId)
}

export interface DesignInputs {
  colors: { primary: string; secondary: string; accent: string }
  fonts: { heading: string; body: string }
}

/** Colours and fonts: the kept ones when present, otherwise the brand profile's (with the usual defaults). */
export function designInputs(
  request: Pick<FlyerRequest, "keepDesign">,
  brand: { colors?: { hex: string }[]; fonts?: { heading: string; body: string } } | null | undefined,
): DesignInputs {
  const palette = brand?.colors ?? []
  return {
    colors: request.keepDesign?.colors ?? {
      primary: palette[0]?.hex ?? "#12314f",
      secondary: palette[1]?.hex ?? "#eef1f4",
      accent: palette[2]?.hex ?? "#e39a2b",
    },
    fonts: request.keepDesign?.fonts ?? brand?.fonts ?? { heading: "Georgia, serif", body: "Georgia, serif" },
  }
}
