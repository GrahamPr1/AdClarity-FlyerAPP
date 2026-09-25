import { describe, expect, it } from "vitest"
import { readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"

/**
 * Guards the failure class that produced "Failed to parse structured output
 * as JSON: Unterminated string".
 *
 * The bug was never in the JSON handling. Three agents were running against
 * output ceilings smaller than the responses they actually produce — polish
 * at 2048, intake and scrape on the 4096 default — so the model's output was
 * clipped mid-string and the SDK, quite correctly, refused to parse it. It
 * was invisible because the error surfaced far from its cause.
 *
 * The measured evidence at the time of the fix, from the generation log:
 *
 *   agent    n    p50     p99     max      ceiling
 *   polish   120  584     1901    2048  =  2048   <- clipped
 *   intake   51   1984    4096    4096  =  4096   <- clipped
 *   scrape   10   1496    4096    4096  =  4096   <- clipped
 *   flyer    108  5789    25794   27929 <  60000     healthy
 *
 * A maximum that lands exactly on the ceiling is the signature. These tests
 * pin the corrected budgets so nobody trims them back without deciding to.
 */

const AGENT_DIR = join(process.cwd(), "lib/agent-pipeline/agents")

function sourceOf(file: string): string {
  return readFileSync(join(AGENT_DIR, file), "utf8")
}

/** The literal passed as maxTokens, resolving a `const X = N` indirection. */
function maxTokensOf(file: string): number | null {
  const src = sourceOf(file)
  const direct = src.match(/maxTokens:\s*(\d+)/)
  if (direct) return Number(direct[1])
  const viaConst = src.match(/maxTokens:\s*([A-Z_]+)/)
  if (viaConst) {
    const decl = src.match(new RegExp(`const\\s+${viaConst[1]}\\s*=\\s*(\\d+)`))
    if (decl) return Number(decl[1])
  }
  // Computed (the flyer agent scales with batch size) — read its per-unit const.
  const perFlyer = src.match(/const\s+TOKENS_PER_FLYER\s*=\s*(\d+)/)
  if (perFlyer) return Number(perFlyer[1])
  return null
}

describe("agent output-token budgets", () => {
  // Floors derived from the measured p99 of each agent, with headroom. Not
  // arbitrary: each is comfortably above the largest response that agent has
  // ever actually produced.
  const MINIMUMS: Record<string, number> = {
    "polishAgent.ts": 4096, // p99 1901; was 2048 and clipping
    "intakeAgent.ts": 8192, // p99 4096 (clipped); was the 4096 default
    "scrapeAgent.ts": 8192, // p99 4096 (clipped); was the 4096 default
    "brandAgent.ts": 8192, // max 3611 against a 4096 default
    "flyerAgent.ts": 30000, // max 27929
    "coloringAgent.ts": 28000, // max 25997
  }

  for (const [file, floor] of Object.entries(MINIMUMS)) {
    it(`${file} asks for at least ${floor} output tokens`, () => {
      const got = maxTokensOf(file)
      expect(got, `${file}: could not find a maxTokens value`).not.toBeNull()
      expect(got!).toBeGreaterThanOrEqual(floor)
    })
  }

  it("every agent states a budget explicitly rather than inheriting the 4096 default", () => {
    // The default is fine for a tiny response and dangerous for anything
    // else, and "we never thought about it" is indistinguishable from "we
    // decided 4096" once it's implicit. intake and scrape were both caught
    // this way.
    const missing = readdirSync(AGENT_DIR)
      .filter((f) => f.endsWith("Agent.ts"))
      .filter((f) => !/maxTokens/.test(sourceOf(f)))
    expect(missing, `these agents inherit the default ceiling silently: ${missing.join(", ")}`).toEqual([])
  })

  it("no budget exceeds the model's 128000 output ceiling", () => {
    for (const file of readdirSync(AGENT_DIR).filter((f) => f.endsWith("Agent.ts"))) {
      const got = maxTokensOf(file)
      if (got !== null) expect(got, file).toBeLessThanOrEqual(128000)
    }
  })
})
