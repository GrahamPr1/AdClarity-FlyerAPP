import "./load-env"
import { recordGenerationLogEntry, getGenerationLog, getGenerationLogForEmail } from "../lib/store"
import { estimateCostUsd } from "../lib/agent-pipeline/pricing"

async function main() {
  const email = "gen-log-test@example.com"
  const now = Date.now()

  const entries = [
    { agentType: "intake" as const, flyerId: null, inputTokens: 2100, outputTokens: 900 },
    { agentType: "brand" as const, flyerId: null, inputTokens: 1800, outputTokens: 1200 },
    { agentType: "flyer" as const, flyerId: "flyer-test-1", inputTokens: 5200, outputTokens: 9400 },
  ]

  for (const e of entries) {
    await recordGenerationLogEntry({
      email,
      flyerId: e.flyerId,
      agentType: e.agentType,
      model: "claude-sonnet-5",
      inputTokens: e.inputTokens,
      outputTokens: e.outputTokens,
      estimatedCostUsd: estimateCostUsd("claude-sonnet-5", e.inputTokens, e.outputTokens),
      createdAt: new Date().toISOString(),
    })
  }

  console.log("--- getGenerationLogForEmail ---")
  const perEmail = await getGenerationLogForEmail(email)
  console.log(JSON.stringify(perEmail, null, 2))

  console.log("--- getGenerationLog (global, last hour) ---")
  const global = await getGenerationLog(now - 60 * 60 * 1000)
  console.log(`Global log entries in last hour: ${global.length}`)
  const thisTest = global.filter((g) => g.email === email)
  console.log(`Of which belong to this test run: ${thisTest.length}`)

  const totalCost = perEmail.reduce((sum, e) => sum + e.estimatedCostUsd, 0)
  console.log(`Total estimated cost for this simulated submission: $${totalCost.toFixed(6)}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
