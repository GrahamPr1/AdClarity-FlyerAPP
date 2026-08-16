// Configurable per-model pricing for the generation-cost log (see
// recordGenerationLogEntry in lib/store.ts) — a real price change or a
// model swap (see ADCLARITY_MODEL in client.ts) only ever needs a new entry
// here, never a change to the cost-calculation logic itself. Prices are
// USD per MILLION tokens, matching how providers publish them.

export interface ModelPricing {
  inputPerMillionUsd: number
  outputPerMillionUsd: number
}

// claude-sonnet-5: confirmed current, PERMANENT pricing (Anthropic dropped
// the planned Sept 2026 increase to $3/$15 and kept the introductory rate)
// as of August 2026 — see https://www.anthropic.com/news/claude-sonnet-5.
export const MODEL_PRICING: Record<string, ModelPricing> = {
  "claude-sonnet-5": { inputPerMillionUsd: 2, outputPerMillionUsd: 10 },
}

const FALLBACK_MODEL = "claude-sonnet-5"

/**
 * Never throws — an unrecognized model (e.g. ADCLARITY_MODEL pointed at
 * something new) falls back to claude-sonnet-5's rates rather than crashing
 * the pipeline over a cost-logging concern, but logs loudly so an approximate
 * figure doesn't go unnoticed. Add a real entry to MODEL_PRICING as soon as
 * you see this warning.
 */
export function estimateCostUsd(model: string, inputTokens: number, outputTokens: number): number {
  let pricing = MODEL_PRICING[model]
  if (!pricing) {
    console.error(`[pricing] No configured pricing for model "${model}" — using ${FALLBACK_MODEL} rates as a fallback. Cost figures for this call are approximate; add a real entry to MODEL_PRICING in lib/agent-pipeline/pricing.ts.`)
    pricing = MODEL_PRICING[FALLBACK_MODEL]
  }
  return (inputTokens / 1_000_000) * pricing.inputPerMillionUsd + (outputTokens / 1_000_000) * pricing.outputPerMillionUsd
}
