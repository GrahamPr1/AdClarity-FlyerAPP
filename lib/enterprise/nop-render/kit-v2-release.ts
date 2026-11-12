import { NOP_V2_TEMPLATES, v2Parts, type NopV2Id, type NopV2Size } from "./kit-v2"
import type { NopV2Lang } from "./kit-v2-ids"
import { renderNopV2WithAgentArea, type NopV2Fit } from "./render-v2"
import { NopRenderError } from "./render"
import { nopQrLink, printedEnrollAddress, type Enroll } from "@/lib/enterprise/nop-roster"

// Kit-v2 release check: every template, at both sizes, through the agent
// pipeline (renderNopV2WithAgentArea: locked sections, layout gates, fonts, QR
// read-back, PDF size) with fixed test values. Nothing is looked up or
// written: the code link is a made-up code, never issued to anyone. Used by
// the Spanish switch (a language can't go live while one of its flyers fails)
// and by tests/nop-kit-v2-release.test.ts.

export const RELEASE_CHECK_AGENT = { agentId: "858980", displayName: "Render Check Agent", displayPhone: "(270) 555-0100" }
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
  const { fit } = await renderNopV2WithAgentArea(id, size, RELEASE_CHECK_AGENT, printed.href, nopQrLink(RELEASE_CHECK_CODE), "pdf")
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
