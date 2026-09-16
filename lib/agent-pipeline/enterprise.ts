import { z } from "zod"
import type { ContentAsset, CampaignSource } from "@/lib/types"
import { FlyerSpecificationSchema } from "./schemas/flyer"

/**
 * Enterprise generation mode — select from an approved library instead of
 * writing freely.
 *
 * Everything here is additive and reachable only when generationMode is
 * "enterprise". SMB generation must be byte-for-byte unchanged, which
 * constrains the design more than it looks:
 *
 *   - The system prompt is APPENDED to, never edited, and only in enterprise
 *     mode. A shared prompt with an `if enterprise` paragraph inside it would
 *     change the bytes SMB sends.
 *   - The agent input gains fields only in enterprise mode. runJsonAgent
 *     serialises the whole input object, so adding `generationMode: "smb"`
 *     to an SMB call would change its payload.
 *   - The output schema is EXTENDED into a separate schema rather than
 *     gaining an optional field. Structured outputs compile the schema into
 *     a token grammar, so an extra optional property changes what SMB
 *     generation is constrained by.
 */

export type GenerationMode = "smb" | "enterprise"

/** What the agent is shown about one approved asset. */
export interface EnterpriseAssetContext {
  assetId: string
  label: string
  locked: boolean
  content: string
}

/**
 * Binary assets (logo, image, pdf) carry a Blob URL rather than prose, and
 * document extraction is explicitly out of scope for this prototype — so
 * only text assets can be quoted. The others are still listed, because
 * "there is an approved logo" is useful context even when its bytes aren't.
 */
export function toAssetContext(assets: ContentAsset[]): EnterpriseAssetContext[] {
  return assets.map((a) => ({
    assetId: a.id,
    label: a.sourceLabel,
    locked: a.locked,
    content: a.assetType === "text" ? a.content : `[${a.assetType} asset — not quotable: ${a.content}]`,
  }))
}

/** Output schema for enterprise mode only. SMB keeps FlyerAgentOutputSchema untouched. */
export const EnterpriseFlyerAgentOutputSchema = z.object({
  flyers: z.array(FlyerSpecificationSchema),
  /** Which approved assets backed this piece. One entry per asset actually used. */
  sources: z.array(
    z.object({
      assetId: z.string(),
      label: z.string(),
      locked: z.boolean(),
    }),
  ),
})

export type EnterpriseFlyerAgentOutput = z.infer<typeof EnterpriseFlyerAgentOutputSchema>

/**
 * Appended to the flyer system prompt in enterprise mode.
 *
 * Deliberately phrased as a narrowing of what the agent may do, not as extra
 * capability: everything the SMB prompt says about composition still applies,
 * but the WORDS now come from a library a compliance team has already signed
 * off on.
 */
export const ENTERPRISE_MODE_PROMPT = `

---

## ENTERPRISE MODE — compose from approved content only

This generation runs for an organisation whose marketing copy has already been
reviewed and approved. \`approvedAssets\` in the input is that library. Every
design instruction above still applies; what changes is where the WORDS come
from.

### Selecting

Read every asset's \`label\` and \`content\` and use only the ones genuinely
relevant to the promotion or event being requested. Ignoring an irrelevant
asset is correct — a flyer that includes an approved paragraph about a product
nobody asked about is worse than one that leaves it out.

### Locked assets are reproduced character for character

An asset with \`locked: true\` is a compliance-controlled string — a
disclosure, a required footer, an approved call to action. Where you use one,
its \`content\` must appear in your HTML EXACTLY as given:

- Do not reword, shorten, expand, re-punctuate or "improve" it.
- Do not split it across elements in a way that changes the text.
- Do not change its capitalisation.
- You may wrap it in markup and style it freely. The characters must survive.

A reworded disclosure is a regulatory failure, not a style choice. This is
checked in code after you respond, and a paraphrase is caught.

### What you may write yourself — a closed list

You may freely write ONLY these four things. Nothing else on the piece may be
your own words:

1. A greeting or short transition between approved blocks.
2. Event logistics supplied in this request — date, time, venue, RSVP method.
3. The agent's own contact block — name, title, phone, licence states.
4. A short wrapper around an approved call to action ("Seating is limited —
   RSVP below").

If something you want to say is not in that list and not in an approved
asset, it does not go on the piece. Leaving a gap is correct.

### Never write anything that sounds like a disclosure

This is the single most important rule here, and it is absolute.

Do NOT generate, adapt, extend or "round out" any language resembling:

- a disclaimer or legal notice
- a guarantee, or any statement about what is or isn't guaranteed
- a risk statement, or wording about claims-paying ability or backing
- a regulatory notice, suitability statement or licensing caveat
- "this is not advice" / "not intended as individualized advice" framing
- "no purchase or obligation is necessary" framing
- "not a recommendation to buy" framing

Regulatory-sounding text is ASSET-SOURCED OR ABSENT. There is no third
option. If the library contains a disclosure, reproduce it verbatim and add
nothing around it. If it does not, the piece carries no disclosure at all.

Inventing text that READS as approved compliance language is worse than
paraphrasing an approved disclosure: a reviewer cannot tell it apart from
material their compliance team actually cleared. Do not place your own
sentences adjacent to a locked disclosure — a reader will take the whole
block as approved.

### Reporting what you used

Return a \`sources\` array naming every approved asset you actually used —
\`assetId\`, \`label\` and \`locked\` copied from the input. List an asset only
if its content really appears in the output; the client is shown this as a
provenance record, so a source you didn't use is a false claim about where the
content came from.`

/* ------------------------- Enforced verbatim check ------------------------- */

export interface VerbatimViolation {
  assetId: string
  label: string
  /** The opening of the text that should have appeared, for the log. */
  expectedOpening: string
}

/** Markup and entity differences are not paraphrase; whitespace shape isn't either. */
export function normaliseForComparison(value: string): string {
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, " ")
    .trim()
}

/**
 * Checks that every locked asset the agent SAID it used is actually present
 * verbatim in the generated HTML.
 *
 * Enforced in code, not by the prompt, for the same reason as the QR token and
 * the Unsplash credit — and with more at stake: a paraphrased disclosure is a
 * compliance failure that nobody notices until it matters. The prompt asks;
 * this verifies.
 *
 * Only assets claimed in `sources` are checked. Checking every locked asset in
 * the library would flag a disclosure the agent correctly decided not to use,
 * which would make the signal useless.
 *
 * Comparison is on normalised text, so markup, entities and whitespace shape
 * don't register as tampering — but wording and punctuation do, which is the
 * thing being protected.
 */
export function findVerbatimViolations(
  html: string,
  claimedSources: CampaignSource[],
  library: EnterpriseAssetContext[],
): VerbatimViolation[] {
  const haystack = normaliseForComparison(html)
  const byId = new Map(library.map((a) => [a.assetId, a]))

  return claimedSources
    .filter((s) => s.locked)
    .map((s) => {
      const asset = byId.get(s.assetId)
      if (!asset) return null
      const needle = normaliseForComparison(asset.content)
      if (!needle || haystack.includes(needle)) return null
      return { assetId: s.assetId, label: s.label, expectedOpening: asset.content.slice(0, 60) }
    })
    .filter((v): v is VerbatimViolation => v !== null)
}


/* ------------------ Invented compliance language (check 2) ----------------- */

export interface InventedComplianceViolation {
  /** The offending sentence, as it appears in the generated copy. */
  text: string
  /** Which pattern matched, for the log. */
  pattern: string
}

/**
 * Catches a DIFFERENT failure from findVerbatimViolations: not approved text
 * that was altered, but unapproved text that was invented.
 *
 * Seen on a real generation — the model wrote "not intended as individualized
 * financial, legal, or tax advice. No purchase, obligation, or commitment is
 * necessary to attend" and placed it immediately before the genuine locked
 * disclosure. The verbatim check passed, correctly and uselessly: every
 * claimed source WAS reproduced exactly. Nothing was watching for the
 * sentences added around it.
 *
 * For a compliance buyer this is the worse direction. A paraphrased
 * disclosure is at least recognisably derived from something approved;
 * invented regulatory language is indistinguishable from cleared material to
 * anyone reviewing the output, including the agent who sends it.
 *
 * Method: strip every approved asset's text out of the document first, then
 * scan only what the model wrote itself. That ordering matters — the locked
 * disclosure legitimately contains "guarantees" and "not a recommendation to
 * buy", so scanning the whole document would flag the approved text it exists
 * to protect.
 *
 * Stripping happens in two passes, and the split mirrors what locked/unlocked
 * already mean rather than adding a heuristic on top of them:
 *
 *   1. EXACT, over every asset. A locked asset must survive character for
 *      character, so exact removal is the whole of its treatment.
 *   2. PHRASE-LEVEL, over UNLOCKED assets only. Unlocked content may be
 *      reworded, so a legitimate adaptation never matches pass 1 and its
 *      vocabulary lands in the residue. A real generation reformatted the
 *      approved line "Options include guaranteed lifetime income, flexible
 *      withdrawal schedules, and spousal continuation" into bullets, and the
 *      bare `guarantee` pattern fired on asset-backed copy.
 *
 * Locked assets are deliberately excluded from pass 2. Fuzzy-stripping them
 * would dissolve exactly the near-miss paraphrases findVerbatimViolations
 * exists to catch, so the two checks would blind each other.
 *
 * Known limitation: an unlocked asset that itself contains compliance-sounding
 * phrasing lends that phrasing to pass 2, so invented text reusing it would
 * pass. That is the correct trade — the phrasing is approved content — but it
 * means this check bounds invention, not claim strength.
 */
const COMPLIANCE_PATTERNS: { label: string; re: RegExp }[] = [
  { label: "not-advice framing", re: /\bnot\s+(?:intended\s+as|to\s+be\s+construed\s+as|)\s*(?:individualized\s+)?(?:financial|legal|tax|investment)\s+advice\b/i },
  { label: "not-advice framing", re: /\bis\s+not\s+advice\b/i },
  { label: "no-obligation framing", re: /\bno\s+(?:purchase|obligation|commitment|cost)\b/i },
  { label: "recommendation disclaimer", re: /\bnot\s+a\s+recommendation\b/i },
  { label: "guarantee statement", re: /\bguarantee(?:s|d)?\b/i },
  { label: "claims-paying / backing statement", re: /\bclaims[- ]paying\b|\bbacked\s+(?:solely\s+)?by\b/i },
  { label: "suitability / licensing caveat", re: /\b(?:licensed\s+in|suitability|securities\s+offered|FINRA|SIPC|FDIC)\b/i },
  { label: "risk / performance disclaimer", re: /\bpast\s+performance\b|\bsubject\s+to\s+(?:market\s+)?risk\b/i },
  { label: "educational-purposes disclaimer", re: /\bfor\s+(?:general\s+|)educational\s+purposes\s+only\b/i },
  { label: "consult-a-professional framing", re: /\bconsult\s+(?:a|your|with)\b.{0,40}\b(?:advisor|adviser|attorney|professional|tax)\b/i },
]

/**
 * Shortest run of words treated as evidence that copy came from an approved
 * asset rather than from the model. Two is too weak — "is guaranteed" occurs
 * in approved and invented text alike.
 */
export const MIN_APPROVED_PHRASE_WORDS = 3

/** Comparable word forms; punctuation and casing are not part of a phrase. */
export function phraseWords(value: string): string[] {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(" ").filter(Boolean)
}

/** Every MIN_APPROVED_PHRASE_WORDS-gram appearing in the given assets. */
export function approvedPhrases(assets: EnterpriseAssetContext[]): Set<string> {
  const out = new Set<string>()
  for (const asset of assets) {
    const w = phraseWords(normaliseForComparison(asset.content))
    for (let i = 0; i + MIN_APPROVED_PHRASE_WORDS <= w.length; i++) {
      out.add(w.slice(i, i + MIN_APPROVED_PHRASE_WORDS).join(" "))
    }
  }
  return out
}

/**
 * Drops every word belonging to a run that appears in an approved phrase.
 *
 * Overlapping windows chain, so a reformatted eight-word span is removed
 * whole without needing to extend matches explicitly. Tokens keep their
 * original punctuation so whatever survives still reads as the model wrote it.
 */
function stripApprovedPhrases(residue: string, phrases: Set<string>): string {
  if (phrases.size === 0) return residue
  const tokens = residue.match(/\S+/g) ?? []

  // Purely punctuational tokens ("—", "•") carry no word and must not break a
  // run, so matching walks the wordy tokens and maps back by index.
  const positions: number[] = []
  const words: string[] = []
  tokens.forEach((t, i) => {
    const w = t.toLowerCase().replace(/[^a-z0-9]+/g, "")
    if (w) {
      positions.push(i)
      words.push(w)
    }
  })

  const drop = new Array<boolean>(tokens.length).fill(false)
  for (let i = 0; i + MIN_APPROVED_PHRASE_WORDS <= words.length; i++) {
    if (!phrases.has(words.slice(i, i + MIN_APPROVED_PHRASE_WORDS).join(" "))) continue
    for (let k = i; k < i + MIN_APPROVED_PHRASE_WORDS; k++) drop[positions[k]] = true
  }

  return tokens.filter((_, i) => !drop[i]).join(" ")
}

export function findInventedComplianceLanguage(
  html: string,
  library: EnterpriseAssetContext[],
): InventedComplianceViolation[] {
  let residue = normaliseForComparison(html)

  // Pass 1 — exact, over every asset, including ones the agent didn't claim so
  // an unclaimed-but-verbatim quote isn't reported as invented.
  for (const asset of library) {
    const approved = normaliseForComparison(asset.content)
    if (approved.length > 0) residue = residue.split(approved).join(" ")
  }

  // Pass 2 — phrase-level, unlocked only. See the note above on why locked
  // assets must not be fuzzy-stripped.
  residue = stripApprovedPhrases(residue, approvedPhrases(library.filter((a) => !a.locked)))

  // Sentence-level, so the log points at the offending clause rather than the
  // whole page.
  const sentences = residue.split(/(?<=[.!?])\s+/).map((x) => x.trim()).filter((x) => x.length > 12)
  const seen = new Set<string>()
  const out: InventedComplianceViolation[] = []
  for (const sentence of sentences) {
    for (const { label, re } of COMPLIANCE_PATTERNS) {
      if (!re.test(sentence)) continue
      const key = `${label}:${sentence}`
      if (seen.has(key)) continue
      seen.add(key)
      out.push({ text: sentence.slice(0, 160), pattern: label })
      break
    }
  }
  return out
}
