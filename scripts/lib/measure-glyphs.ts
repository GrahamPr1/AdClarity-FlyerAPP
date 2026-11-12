import { chromium } from "playwright-core"
import { CURATED_FONTS } from "../../lib/brand-controls"
import { CONTENT, productionFontCss } from "./flyer-fixtures"
async function main() {
  const b = await chromium.launch(); const p = await b.newPage()
  for (const mode of ["production", "local"]) {
    await p.setContent(`<html><head>${mode === "production" ? `<style>${productionFontCss()}</style>` : ""}</head><body></body></html>`)
    await p.evaluate("window.__name = (f) => f")
    const samples = [CONTENT.max.headline, CONTENT.max.supporting, CONTENT.max.businessName.toUpperCase(), "Is Your Roof 15 Years Or Older?", "Fall Furnace Tune-Up Special WWW MMM"]
    for (const f of CURATED_FONTS) {
      const r = (await p.evaluate(({ f, samples }) => {
        const out: number[] = []
        return (async () => {
        for (const [fam, w] of [[f.heading, 700], [f.body, 400]] as [string, number][]) await document.fonts.load(`${w} 100px ${fam}`)
        for (const [fam, w] of [[f.heading, 700], [f.body, 400]] as [string, number][]) {
          for (const s of samples) {
            const el = document.createElement("span"); el.style.cssText = `font-family:${fam};font-weight:${w};font-size:100px;white-space:nowrap;letter-spacing:0`
            el.textContent = s; document.body.appendChild(el); out.push(el.getBoundingClientRect().width / (s.length * 100)); el.remove()
          }
        }
        return out
        })()
      }, { f, samples })) as number[]
      console.log(mode, f.id.padEnd(18), "heading", r.slice(0, 5).map((x) => x.toFixed(3)).join(" "), "| body", r.slice(5).map((x) => x.toFixed(3)).join(" "))
    }
  }
  await b.close()
}
main()
