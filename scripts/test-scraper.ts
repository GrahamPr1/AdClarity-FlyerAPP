import "./load-env"
import { crawlWebsite } from "../lib/agent-pipeline/scraper"

async function main() {
  const url = process.argv[2]
  if (!url) throw new Error("Usage: npx tsx scripts/test-scraper.ts <url>")
  const t0 = Date.now()
  const result = await crawlWebsite(url)
  console.log(`Took ${Date.now() - t0}ms`)
  if ("error" in result) {
    console.log("FAILED:", result.error)
    return
  }
  console.log(`Pages crawled: ${result.pages.length}`)
  result.pages.forEach((p) => console.log(` - ${p.url} (${p.text.length} chars)`))
  console.log("Logo:", result.logoUrl)
  console.log("Colors:", result.colors)
  console.log("Social:", result.socialLinks)
  console.log("\nFirst page text sample:\n", result.pages[0]?.text.slice(0, 400))
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
