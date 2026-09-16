import * as cheerio from "cheerio"
import {
  normaliseForComparison,
  phraseWords,
  approvedPhrases,
  MIN_APPROVED_PHRASE_WORDS,
  type EnterpriseAssetContext,
} from "./enterprise"

/**
 * Per-block provenance for a finished enterprise flyer.
 *
 * `sources[]` on the deliverable answers "which approved assets backed this
 * piece". This answers the question a reviewer actually asks while looking at
 * the page: "where did THIS line come from". They are different questions, and
 * only the second one can be spot-checked.
 *
 * DERIVED, NOT DECLARED. Attribution is computed from the rendered HTML
 * against the library, using the same matching the two enterprise checks use.
 * Asking the model to emit a per-block mapping would have been less code and
 * strictly worse: it would be another unverified claim from the same model
 * whose claims the checks exist to verify. A reviewer needs the panel to be
 * independent of the thing it is auditing.
 *
 * Two axes, kept separate because they answer to different guarantees:
 *
 *   - WHICH ASSET, and whether that asset is locked.
 *   - HOW FAITHFULLY — verbatim, or reworded.
 *
 * Collapsing them into one "sourced vs generated" badge would hide the case
 * the pilot-readiness doc calls item 1: text that is genuinely asset-backed but
 * reformatted into a stronger claim than its source made. "From the approved
 * sheet, reworded" and "the exact approved text" are materially different
 * things to sign off on.
 *
 * It also makes one failure visible rather than merely logged: a block matched
 * to a LOCKED asset but only loosely is a verbatim violation, the exact case
 * findVerbatimViolations catches. Here it renders on the page.
 *
 * Limits, stated plainly. This is evidence for a human, not proof. A short
 * block that happens to share vocabulary with an asset can be attributed to it
 * by coincidence, and a heavily reworded block can fall under the coverage
 * threshold and read as generated. Both directions are possible; the panel is
 * there to direct attention, not to certify a piece.
 */

/** Verbatim from an asset, traceable but reworded, or the model's own words. */
export type BlockFidelity = "exact" | "adapted" | "generated"

export interface AttributedBlock {
  /** The block's visible text, as rendered. */
  text: string
  fidelity: BlockFidelity
  assetId: string | null
  label: string | null
  locked: boolean | null
  /** For "adapted": share of the block's words traceable to the asset, 0–1. */
  coverage: number | null
}

/**
 * Below this, a block carries too little text to attribute honestly. "Date",
 * "6:00 PM" and a phone number are all substrings of plenty of prose; matching
 * them would manufacture provenance rather than find it.
 */
const MIN_ATTRIBUTABLE_CHARS = 12

/** Share of a block's words that must trace to one asset before it's "adapted". */
const ADAPTED_COVERAGE_THRESHOLD = 0.5

/** Share of a block's words covered by runs appearing in `phrases`. */
function coverageAgainst(words: string[], phrases: Set<string>): number {
  if (words.length === 0 || phrases.size === 0) return 0
  const covered = new Array<boolean>(words.length).fill(false)
  for (let i = 0; i + MIN_APPROVED_PHRASE_WORDS <= words.length; i++) {
    if (!phrases.has(words.slice(i, i + MIN_APPROVED_PHRASE_WORDS).join(" "))) continue
    for (let k = i; k < i + MIN_APPROVED_PHRASE_WORDS; k++) covered[k] = true
  }
  return covered.filter(Boolean).length / words.length
}

/**
 * The visible text blocks of a flyer, in document order.
 *
 * Leaf-first: an element counts as a block only when no descendant element
 * carries text of its own, so a wrapping <div> doesn't swallow the six lines
 * inside it and report them as one.
 */
function textBlocks(html: string): string[] {
  const $ = cheerio.load(html)
  $("script, style, head").remove()

  const out: string[] = []
  $("body *").each((_, el) => {
    const $el = $(el)
    const text = ($el.text() ?? "").replace(/\s+/g, " ").trim()
    if (!text) return
    const childCarriesText = $el.children().toArray().some((c) => ($(c).text() ?? "").trim().length > 0)
    if (childCarriesText) return
    out.push(text)
  })
  return out
}

export function attributeBlocks(html: string, library: EnterpriseAssetContext[]): AttributedBlock[] {
  // Indexed once per asset rather than once per block — a flyer has a few
  // dozen blocks and the phrase set is the expensive half.
  const indexed = library.map((asset) => {
    const normalised = normaliseForComparison(asset.content)
    return { asset, normalised, normalisedLower: normalised.toLowerCase(), phrases: approvedPhrases([asset]) }
  })

  // Locked first, so a block present in both a locked and an unlocked asset is
  // reported against the locked one — the more consequential fact for a
  // reviewer, and the one with a hard guarantee attached.
  indexed.sort((a, b) => Number(b.asset.locked) - Number(a.asset.locked))

  return textBlocks(html).map((text): AttributedBlock => {
    const generated: AttributedBlock = {
      text,
      fidelity: "generated",
      assetId: null,
      label: null,
      locked: null,
      coverage: null,
    }

    const norm = normaliseForComparison(text)
    if (norm.length < MIN_ATTRIBUTABLE_CHARS) return generated

    // Case matters for a LOCKED asset and not for an unlocked one, which is
    // the same split the rest of enterprise mode already draws. The prompt
    // tells the agent not to change a locked asset's capitalisation, so a case
    // change there is a verbatim violation and must not be absorbed here.
    // Sentence-casing an unlocked line for a bullet ("Spousal continuation"
    // from "...and spousal continuation") is permitted reformatting that makes
    // no different claim — counting it as adapted overstated the risk, and
    // missing it entirely reported approved product wording as AI-invented.
    const exact = indexed.find((a) =>
      a.asset.locked ? a.normalised.includes(norm) : a.normalisedLower.includes(norm.toLowerCase()),
    )
    if (exact) {
      return {
        text,
        fidelity: "exact",
        assetId: exact.asset.assetId,
        label: exact.asset.label,
        locked: exact.asset.locked,
        coverage: 1,
      }
    }

    const words = phraseWords(norm)
    let best: { entry: (typeof indexed)[number]; coverage: number } | null = null
    for (const entry of indexed) {
      const coverage = coverageAgainst(words, entry.phrases)
      if (!best || coverage > best.coverage) best = { entry, coverage }
    }
    if (!best || best.coverage < ADAPTED_COVERAGE_THRESHOLD) return generated

    return {
      text,
      fidelity: "adapted",
      assetId: best.entry.asset.assetId,
      label: best.entry.asset.label,
      locked: best.entry.asset.locked,
      coverage: Number(best.coverage.toFixed(2)),
    }
  })
}

/**
 * A block traced to a LOCKED asset but not reproduced exactly.
 *
 * The same condition findVerbatimViolations reports at the campaign level,
 * localised to the line that caused it so a reviewer can see which one.
 */
export function isVerbatimViolation(block: AttributedBlock): boolean {
  return block.locked === true && block.fidelity === "adapted"
}

export interface AttributionSummary {
  exact: number
  adapted: number
  generated: number
  /** Blocks traced to a locked asset but reworded — should always be zero. */
  violations: number
}

export function summariseAttribution(blocks: AttributedBlock[]): AttributionSummary {
  return {
    exact: blocks.filter((b) => b.fidelity === "exact").length,
    adapted: blocks.filter((b) => b.fidelity === "adapted").length,
    generated: blocks.filter((b) => b.fidelity === "generated").length,
    violations: blocks.filter(isVerbatimViolation).length,
  }
}
