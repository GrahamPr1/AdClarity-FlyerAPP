import { describe, it, expect } from "vitest"
import { NOP_V2_TEMPLATES, readV2Html, v2Parts, type NopV2Size } from "@/lib/enterprise/nop-render/kit-v2"
import { agentAreaHtml, printedLink } from "@/lib/enterprise/nop-render/agent-area"
import { MAIN_SPACING, placeAgentAreaInFooter } from "@/lib/enterprise/nop-render/footer-placement"

/**
 * Option B proposal: the agent area replaces the footer's generic link. The
 * agent area (agent-area.ts) knows nothing about the footer, and the placement
 * changes only the footer and, on P2/P3, <main>'s spacing values. Everything
 * else on every page stays byte-for-byte as Basic Benefits supplied it.
 */

const area = agentAreaHtml({ name: "Jordan Rivera", phone: "(555) 010-0142", enrollUrl: "https://neighbor.basicbenefits.com/123456", qrSvg: '<svg viewBox="0 0 29 29"></svg>' })
const footerOf = (h: string) => /<footer[\s\S]*<\/footer>/.exec(h)![0]
const PAGES = NOP_V2_TEMPLATES.flatMap((id) => (["letter", "bleed"] as NopV2Size[]).map((size) => [id, size] as const))

describe("placing the agent area in the footer", () => {
  it.each(PAGES)("%s %s: only the footer and <main> spacing change", (id, size) => {
    const src = readV2Html(id, size), out = placeAgentAreaInFooter(src, v2Parts(id).pkg, area)
    const spacing = MAIN_SPACING[v2Parts(id).pkg]
    const restore = (h: string) => (spacing ? h.replace(spacing[1], spacing[0]) : h).replace(footerOf(h), "FOOTER")
    expect(restore(out)).toBe(src.replace(footerOf(src), "FOOTER"))

    const before = footerOf(src), after = footerOf(out)
    const stamp = />(NOP-P\d-(EN|ES) · [^<]+)</.exec(before)![1]
    expect(after).toContain(stamp)
    expect(after).not.toContain(">neighbor.basicbenefits.com<")
    expect(after).toContain(area)
    // Basic Benefits' own footer text is all still there.
    for (const text of before.match(/>[^<>]*\S[^<>]*</g)!.filter((t) => !t.includes("neighbor.basicbenefits.com"))) expect(after).toContain(text)
  })

  it("refuses a master whose footer isn't the one it was written for", () => {
    const src = readV2Html("NOP2_P1_EN_PRICE", "letter")
    expect(() => placeAgentAreaInFooter(src.replace("neighbor.basicbenefits.com</a>", "basicbenefits.com</a>"), "P1", area)).toThrow(/footer link column/)
    expect(() => placeAgentAreaInFooter(readV2Html("NOP2_P2_EN_PRICE", "letter"), "P3", area)).toThrow(/<main> spacing/)
  })
})

describe("the agent area", () => {
  it("prints exactly the agent's values, escaped, and the QR at 0.7in in a 0.9in white box", () => {
    const html = agentAreaHtml({ name: `<b>Pat & "Lee"</b>`, phone: "555", enrollUrl: "https://neighbor.basicbenefits.com/1", qrSvg: "<svg viewBox='0 0 1 1'></svg>" })
    expect(html).toContain("&lt;b&gt;Pat &amp; &quot;Lee&quot;&lt;/b&gt;")
    expect(html).not.toContain("<b>")
    expect(html).toContain('href="https://neighbor.basicbenefits.com/1"')
    expect(html).toContain(">neighbor.basicbenefits.com/1<")
    expect(html).toMatch(/width:0\.9in;height:0\.9in;padding:0\.1in;background:#fff/)
    expect(html).toContain('<svg width="0.7in" height="0.7in"')
  })

  it("prints the link without the scheme", () => {
    expect(printedLink("https://neighbor.basicbenefits.com/858980")).toBe("neighbor.basicbenefits.com/858980")
  })
})
