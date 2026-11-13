import { NOP_V2_TEMPLATES, v2Parts, type NopV2Id, type NopV2Size } from "./kit-v2"
import type { NopV2Lang } from "./kit-v2-ids"
import { renderNopV2WithAgentArea, v2PrintedLink, type NopV2Fit } from "./render-v2"
import { NopRenderError } from "./render"
import { enrollTargets, nopQrLink, printedEnrollAddress, type Enroll } from "@/lib/enterprise/nop-roster"

// Kit-v2 release check: every template, at both sizes, through the agent
// pipeline (renderNopV2WithAgentArea: locked sections, layout gates, fonts, QR
// read-back, PDF size) with fixed test values. Nothing is looked up or
// written: the code link is a made-up code, never issued to anyone. Used by
// the Spanish switch (a language can't go live while one of its flyers fails)
// and by tests/nop-kit-v2-release.test.ts.

// A typical issued Agent ID (letters, digits and dashes).
export const RELEASE_CHECK_AGENT = { agentId: "CP-VLN-H5J", displayName: "Render Check Agent", displayPhone: "(270) 555-0100" }
const RELEASE_CHECK_CODE = "RndrChk"
export const V2_SIZES: NopV2Size[] = ["letter", "bleed"]

// Room to spare, so a page still fits under small rendering differences on
// production (another Chromium build): at least 0.05in above the footer, and
// at least 0.08in between any two blocks. Agent downloads only require that
// the page fits; a language can't be switched on unless its pages meet these.
export const MIN_FOOTER_MARGIN_PX = 0.05 * 96
export const MIN_GAP_PX = 0.08 * 96

export interface V2ReleaseFailure {
  template: NopV2Id
  size: NopV2Size
  code: string
  message: string
}

/** One template at one size; throws NopRenderError on the first failed check. Returns the measured fit. */
export async function checkV2Release(id: NopV2Id, size: NopV2Size, enroll: Enroll): Promise<NopV2Fit> {
  const printed = printedEnrollAddress(RELEASE_CHECK_AGENT.agentId, RELEASE_CHECK_CODE, enroll)
  const { fit } = await renderNopV2WithAgentArea(id, size, RELEASE_CHECK_AGENT, { href: printed.href, lines: printed.lines }, nopQrLink(RELEASE_CHECK_CODE), "pdf")
  const inches = (px: number) => `${(px / 96).toFixed(3)}in`
  if (fit.footerMargin < MIN_FOOTER_MARGIN_PX) throw new NopRenderError("master_invalid", `only ${inches(fit.footerMargin)} to spare above the footer, need ${inches(MIN_FOOTER_MARGIN_PX)}`)
  if (fit.minGap < MIN_GAP_PX) throw new NopRenderError("master_invalid", `blocks only ${inches(fit.minGap)} apart, need ${inches(MIN_GAP_PX)}`)
  return fit
}

/** Every template in `lang` at both sizes, one at a time; the failures, empty when all pass. */
export async function v2ReleaseFailures(lang: NopV2Lang, enroll: Enroll): Promise<V2ReleaseFailure[]> {
  const failures: V2ReleaseFailure[] = []
  for (const template of NOP_V2_TEMPLATES.filter((id) => v2Parts(id).lang === lang)) {
    for (const size of V2_SIZES) {
      try {
        await checkV2Release(template, size, enroll)
      } catch (err) {
        failures.push({ template, size, code: err instanceof NopRenderError ? err.code : "render_failed", message: err instanceof Error ? err.message : String(err) })
      }
    }
  }
  return failures
}

export interface FullLinkMeasure {
  template: NopV2Id
  size: NopV2Size
  /** What the page printed: the full URL, or (if it didn't fit) the agent's code link. */
  printed: "full" | "code"
  lineWidths: number[]
  space: number
  /** space minus the widest line, in CSS px (96 per inch). */
  sparePx: number
  footerMarginPx: number
  minGapPx: number
  /** Why the full URL fell back, with the measured widths. */
  fallback: string | null
}

/**
 * Admin measurement (render-check ?measure=full-link): every template at both
 * sizes with the sample agent and the full-URL option, exactly as an agent's
 * download would lay it out, without saving or writing anything. Records how
 * much room line 1 has, and whether any page falls back to the code link.
 */
export async function measureFullLink(enroll: Enroll): Promise<FullLinkMeasure[]> {
  const out: FullLinkMeasure[] = []
  const qrLink = nopQrLink(RELEASE_CHECK_CODE)
  for (const template of NOP_V2_TEMPLATES) {
    for (const size of V2_SIZES) {
      const chosen = v2PrintedLink(RELEASE_CHECK_AGENT.agentId, RELEASE_CHECK_CODE, enroll)
      let fallback: string | null = chosen.fullUrl ? null : "the estimate says the full URL doesn't fit"
      let fit: NopV2Fit
      try {
        fit = (await renderNopV2WithAgentArea(template, size, RELEASE_CHECK_AGENT, chosen.link, qrLink, "preview")).fit
      } catch (err) {
        if (!(chosen.fullUrl && err instanceof NopRenderError && err.field === "enroll_link")) throw err
        fallback = err.message
        const code = v2PrintedLink(RELEASE_CHECK_AGENT.agentId, RELEASE_CHECK_CODE, { ...enrollTargets(enroll), printed: "code", printedTemplate: null })
        fit = (await renderNopV2WithAgentArea(template, size, RELEASE_CHECK_AGENT, code.link, qrLink, "preview")).fit
      }
      const r1 = (n: number) => Math.round(n * 10) / 10
      out.push({
        template, size, printed: fallback ? "code" : "full",
        lineWidths: fit.linkLineWidths.map(r1), space: r1(fit.linkSpace), sparePx: r1(fit.linkSpace - Math.max(...fit.linkLineWidths)),
        footerMarginPx: r1(fit.footerMargin), minGapPx: r1(fit.minGap), fallback,
      })
    }
  }
  return out
}
