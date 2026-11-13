import { describe, it, expect } from "vitest"
import { NOP_V2_TEMPLATES, readV2Html, v2Parts, type NopV2Size } from "@/lib/enterprise/nop-render/kit-v2"
import { agentAreaHtml, printedLink } from "@/lib/enterprise/nop-render/agent-area"
import { SPACING, applySpacing, assertOnlyFooterChanged, placeAgentAreaInFooter } from "@/lib/enterprise/nop-render/footer-placement"
import { agentTemplates, flyerLabels, flyerLangs } from "@/lib/enterprise/nop-render/flyer-labels"
import { agentFlyerKit } from "@/lib/enterprise/nop-render/kit-v2-access"

/**
 * Option B, approved by Basic Benefits: the agent area replaces the footer's generic link. The
 * agent area (agent-area.ts) knows nothing about the footer, and the placement
 * changes only the footer and, where a page needs the room, vertical spacing
 * values (SPACING). Everything
 * else on every page stays byte-for-byte as Basic Benefits supplied it.
 */

const area = agentAreaHtml({ name: "Jordan Rivera", phone: "(555) 010-0142", link: { href: "https://neighbor.basicbenefits.com/member-enrollment?agent_code=CP-VLN-H5J", lines: ["neighbor.basicbenefits.com/member-enrollment", "?agent_code=CP-VLN-H5J"] }, qrSvg: '<svg viewBox="0 0 29 29"></svg>' })
const footerOf = (h: string) => /<footer[\s\S]*<\/footer>/.exec(h)![0]
const PAGES = NOP_V2_TEMPLATES.flatMap((id) => (["letter", "bleed"] as NopV2Size[]).map((size) => [id, size] as const))

describe("placing the agent area in the footer", () => {
  it.each(PAGES)("%s %s: only the footer and the spacing values change", (id, size) => {
    const { pkg, lang } = v2Parts(id)
    const src = readV2Html(id, size), out = placeAgentAreaInFooter(src, pkg, lang, area)
    expect(out.replace(footerOf(out), "FOOTER")).toBe(applySpacing(src, SPACING[pkg][lang]).replace(footerOf(src), "FOOTER"))
    // Spacing edits are only ever px values in style attributes: no text, tag or other property differs.
    const strip = (h: string) => h.replace(footerOf(h), "").replace(/\d+px/g, "N")
    expect(strip(out)).toBe(strip(src))

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
    expect(() => placeAgentAreaInFooter(src.replace("neighbor.basicbenefits.com</a>", "basicbenefits.com</a>"), "P1", "EN", area)).toThrow(/footer link column/)
    expect(() => placeAgentAreaInFooter(readV2Html("NOP2_P2_EN_PRICE", "letter"), "P3", "EN", area)).toThrow(/<main> spacing/)
    // A card whose padding differs from the others: the edit no longer matches 3 times.
    const es = readV2Html("NOP2_P1_ES_PRICE", "letter")
    expect(() => placeAgentAreaInFooter(es.replace("padding:16px 16px 18px;", "padding:16px 16px 19px;"), "P1", "ES", area)).toThrow(/expected 3 benefit card padding, found 2/)
  })
})

describe("the agent area", () => {
  it("prints exactly the agent's values, escaped, and the QR at 0.7in in a 0.9in white box", () => {
    const html = agentAreaHtml({ name: `<b>Pat & "Lee"</b>`, phone: "555", link: { href: "https://neighbor.basicbenefits.com/1", lines: ["neighbor.basicbenefits.com/1"] }, qrSvg: "<svg viewBox='0 0 1 1'></svg>" })
    expect(html).toContain("&lt;b&gt;Pat &amp; &quot;Lee&quot;&lt;/b&gt;")
    expect(html).not.toContain("<b>")
    expect(html).toContain('href="https://neighbor.basicbenefits.com/1"')
    expect(html).toContain("><span>neighbor.basicbenefits.com/1</span></a>")
    expect(html).toMatch(/width:0\.9in;height:0\.9in;padding:0\.1in;background:#fff/)
    expect(html).toContain('<svg width="0.7in" height="0.7in"')
  })

  it("prints the link without the scheme", () => {
    expect(printedLink("https://neighbor.basicbenefits.com/858980")).toBe("neighbor.basicbenefits.com/858980")
  })

  it("prints the full URL on two lines, split before the '?', linking the whole URL; the ID exactly as issued", async () => {
    const { printedEnrollAddress } = await import("@/lib/enterprise/nop-roster")
    const full = { forwardTemplate: "https://neighbor.basicbenefits.com/member-enrollment?agent_code={id}", printed: "full" as const, printedTemplate: null, programUrl: "https://neighbor.basicbenefits.com/" }
    const p = printedEnrollAddress("CP-VLN-H5J", "Ab3dEf7", full)
    expect(p.lines).toEqual(["neighbor.basicbenefits.com/member-enrollment", "?agent_code=CP-VLN-H5J"])
    expect(p.href).toBe("https://neighbor.basicbenefits.com/member-enrollment?agent_code=CP-VLN-H5J")
    const html = agentAreaHtml({ name: "Jordan Rivera", phone: "555", link: { href: p.href, lines: p.lines }, qrSvg: "<svg viewBox='0 0 1 1'></svg>" })
    expect(html).toContain('href="https://neighbor.basicbenefits.com/member-enrollment?agent_code=CP-VLN-H5J"')
    expect(html).toContain("<span>neighbor.basicbenefits.com/member-enrollment</span><span>?agent_code=CP-VLN-H5J</span>")
    expect(html).toContain("gap:8px")
  })

  it("an ID too wide for the second line prints the agent's code link instead; text never shrinks", async () => {
    const { v2PrintedLink } = await import("@/lib/enterprise/nop-render/render-v2")
    const full = { forwardTemplate: "https://neighbor.basicbenefits.com/member-enrollment?agent_code={id}", printed: "full" as const, printedTemplate: null, programUrl: "https://neighbor.basicbenefits.com/" }
    expect(v2PrintedLink("CP-VLN-H5J", "Ab3dEf7", full)).toEqual({ fullUrl: true, link: { href: "https://neighbor.basicbenefits.com/member-enrollment?agent_code=CP-VLN-H5J", lines: ["neighbor.basicbenefits.com/member-enrollment", "?agent_code=CP-VLN-H5J"] } })
    expect(v2PrintedLink("MW-QmwO-8M4W-Qmd", "Ab3dEf7", full).fullUrl).toBe(true)
    expect(v2PrintedLink("W".repeat(32), "Ab3dEf7", full)).toEqual({ fullUrl: false, link: { href: "https://oneflyer.org/a/Ab3dEf7", lines: ["oneflyer.org/a/Ab3dEf7"] } })
  })
})

describe("release check: locked sections", () => {
  it.each(PAGES)("%s %s: the placed page passes", (id, size) => {
    const src = readV2Html(id, size), { pkg, lang } = v2Parts(id)
    expect(() => assertOnlyFooterChanged(src, placeAgentAreaInFooter(src, pkg, lang, area), pkg, lang)).not.toThrow()
  })

  it("refuses any change outside the footer, and a footer missing Basic Benefits' own text", () => {
    const src = readV2Html("NOP2_P2_EN_PRICE", "letter"), out = placeAgentAreaInFooter(src, "P2", "EN", area)
    expect(() => assertOnlyFooterChanged(src, out.replace("$118", "$117"), "P2", "EN")).toThrow(/locked section/)
    expect(() => assertOnlyFooterChanged(src, out.replace("not a substitute for emergency care", "not emergency care"), "P2", "EN")).toThrow(/locked section/)
    expect(() => assertOnlyFooterChanged(src, out.replace(">Sign in or enroll online<", "><"), "P2", "EN")).toThrow(/Sign in or enroll online/)
    expect(() => assertOnlyFooterChanged(src, out.replace(/NOP-P2-EN · 10\/2026/, "NOP-P2-EN"), "P2", "EN")).toThrow(/footer text/)
    // Spacing changes are only allowed on the pages they're listed for.
    expect(() => assertOnlyFooterChanged(src, out, "P1", "EN")).toThrow(/locked section/)
    const p1 = readV2Html("NOP2_P1_ES_PRICE", "letter"), p1Out = placeAgentAreaInFooter(p1, "P1", "ES", area)
    expect(() => assertOnlyFooterChanged(p1, p1Out, "P1", "EN")).toThrow(/locked section/)
    expect(() => assertOnlyFooterChanged(p1, p1Out.replace("padding:12px 16px 14px;", "padding:10px 16px 14px;"), "P1", "ES")).toThrow(/locked section/)
  })
})

describe("which flyers an agent's dashboard lists", () => {
  it("kit v1.1.1 until admin switches; then kit v2, English only until Spanish is switched on", () => {
    expect(agentFlyerKit({ agentKit: "v1", spanishV2: true })).toEqual({ kit: "v1", spanish: true })
    expect(agentFlyerKit({ agentKit: "v2", spanishV2: false })).toEqual({ kit: "v2", spanish: false })
    expect(agentTemplates({ kit: "v1", spanish: true }, "es")).toEqual(["NOP_P1_ES", "NOP_P2_ES", "NOP_P3_ES", "NOP_ALL_ES"])
    expect(agentTemplates({ kit: "v2", spanish: false }, "en")).toEqual(["NOP2_P1_EN_PRICE", "NOP2_P1_EN_NOPRICE", "NOP2_P2_EN_PRICE", "NOP2_P2_EN_NOPRICE", "NOP2_P3_EN_PRICE", "NOP2_P3_EN_NOPRICE"])
    expect(flyerLangs({ kit: "v2", spanish: false })).toEqual(["en"])
    expect(flyerLangs({ kit: "v2", spanish: true })).toEqual(["en", "es"])
  })

  it("kit-v2 card names are Basic Benefits' own headings, with or without prices", () => {
    expect(flyerLabels("NOP2_P3_EN_NOPRICE")).toEqual({ eyebrow: "pkg.P3", name: "pkg2.P3_name", pricing: "flyer.without_prices" })
    expect(flyerLabels("NOP_ALL_EN")).toEqual({ eyebrow: "pkg.ALL", name: "pkg.ALL_name", pricing: null })
  })
})
