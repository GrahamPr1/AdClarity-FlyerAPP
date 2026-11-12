/**
 * Generates AI-path documents at minimal and maximal content, for the
 * template stress test's --extra row.
 *
 *   npx tsx scripts/ai-format-stress.ts <out-dir> [format=proposal]
 *
 * The proposal is the one format with no code-built template (it paginates),
 * so it always comes from the real Flyer Agent. Each result goes through the
 * same post-processing a PUBLIC account's AI flyer gets before it is stored —
 * the legibility chain from pipeline.ts, then the AI finishing step
 * (redundancy repair, contrast repair) — and is written as <case>.html.
 *
 * Costs one Flyer Agent call per case (~$0.10).
 */
import "./load-env"
import fs from "node:fs"
import path from "node:path"
import { runFlyerAgent } from "../lib/agent-pipeline/agents/flyerAgent"
import type { FlyerAgentInput } from "../lib/agent-pipeline/schemas/flyer"
import { LAYOUT_ARCHETYPES } from "../lib/agent-pipeline/design-variants"
import { formatForAgent, getFormat } from "../lib/agent-pipeline/formats"
import { enforceBoundedContent, enforceCtaOwnRow, enforceSingleBottomAnchor, ensurePageSize, ensureScrollable } from "../lib/agent-pipeline/flyer-html"
import { applyLegibilityGuardrails } from "../lib/agent-pipeline/legibility"
import { repairRedundancy } from "../lib/agent-pipeline/redundancy"
import { repairContrast } from "../lib/agent-pipeline/contrast-repair"

const OUT = process.argv[2]
const FORMAT = process.argv[3] ?? "proposal"
if (!OUT) {
  console.error("usage: ai-format-stress.ts <out-dir> [format]")
  process.exit(2)
}

// Invented business, plain facts only — no ratings, reviews, results or names of customers.
const brandProfile: FlyerAgentInput["brandProfile"] = {
  businessName: "Pearl Test Roofing",
  targetAudience: ["Homeowners"],
  positioning: "Local residential roofing.",
  brandVoice: ["direct", "plain-spoken"],
  colors: [
    { name: "primary", hex: "#12314f", usage: "headers and backgrounds" },
    { name: "secondary", hex: "#eef1f4", usage: "supporting blocks" },
    { name: "accent", hex: "#e39a2b", usage: "CTAs and highlights only" },
  ],
  fonts: { heading: "'Helvetica Neue', Arial, sans-serif", body: "'Helvetica Neue', Arial, sans-serif" },
  approvedClaims: ["Residential roof replacement", "Free written estimates"],
  prohibitedClaims: ["No claims beyond approvedClaims", "No ratings, reviews or customer counts"],
  requiredDisclaimers: [],
  colorSource: "client_provided",
  assumptionsMade: [],
}

const CASES = [
  {
    name: "min",
    layout: "editorial-stack",
    purpose: "Roof replacement",
    notes: "$500 off.",
  },
  {
    name: "max",
    layout: "corner-frame",
    purpose: "Full architectural shingle roof replacement for a two-story home with detached garage",
    notes:
      "Scope: tear-off of two existing layers, deck inspection and replacement of up to 6 sheets of damaged decking, synthetic underlayment, ice-and-water shield at eaves and valleys, drip edge, step and counter flashing, ridge ventilation, pipe boots, architectural shingles in the owner's choice of colour, magnetic nail sweep, full debris haul-away. Detached garage included. Price $18,400, 30% deposit, balance on completion. Estimated 3 working days, weather permitting. Permit pulled by us. Valid for 30 days.",
  },
]

function legibility(html: string): string {
  // The same order as pipeline.ts applyLegibility.
  const lifted = enforceCtaOwnRow(html).html
  const grown = enforceBoundedContent(lifted).html
  const anchored = enforceSingleBottomAnchor(grown).html
  return applyLegibilityGuardrails(anchored).html
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true })
  for (const c of CASES) {
    const archetype = LAYOUT_ARCHETYPES.find((a) => a.name === c.layout)!
    const input: FlyerAgentInput = {
      brandProfile,
      hasLogo: false,
      contact: { phone: "270-555-0142", address: "Bowling Green, KY", website: null, social: [] },
      photos: [],
      flyerRequests: [
        {
          id: `${FORMAT}-${c.name}`,
          purpose: c.purpose,
          notes: c.notes,
          qrCodeDataUrl: null,
          format: formatForAgent(FORMAT),
          designVariant: { layoutName: archetype.name, layoutBrief: archetype.brief, palette: null },
        },
      ],
      batchSize: 1,
      includeRepurposing: false,
    }
    const out = await runFlyerAgent(input, "ai-format-stress@local.test")
    // The agent's own output too, so a finishing-step change can be re-checked without another paid call.
    fs.writeFileSync(path.join(OUT, `${FORMAT}-${c.name}.raw.html`), out.flyers[0].html)
    // As finishAiFlyer: redundancy repair is skipped for paginated formats.
    const legible = legibility(out.flyers[0].html)
    const red = getFormat(FORMAT).paginates ? { html: legible, removed: [] as string[] } : repairRedundancy(legible, brandProfile.businessName)
    const cr = await repairContrast(red.html)
    for (const r of red.removed) console.log(`  [redundancy] ${c.name}: removed "${r}"`)
    for (const r of cr.repaired) console.log(`  [contrast] ${c.name}: "${r.text}" ${r.from}:1 -> ${r.to}`)
    for (const v of cr.covered) console.log(`  [layout] ${c.name}: "${v.text}" is ${v.why}`)
    fs.writeFileSync(path.join(OUT, `${FORMAT}-${c.name}.html`), ensurePageSize(ensureScrollable(cr.html)))
    console.log(`${FORMAT}-${c.name}: written`)
  }
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
