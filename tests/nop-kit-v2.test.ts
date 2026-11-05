import { describe, it, expect } from "vitest"
import fs from "node:fs"
import path from "node:path"
import { ACCENT_METRICS, KIT_V2_DIR, KIT_V2_ORIGIN, NOP_V2_TEMPLATES, bodyOf, isNopV2Template, kitV2FileFor, readV2Html, v2FileName, v2HtmlForRender, v2Parts } from "@/lib/enterprise/nop-render/kit-v2"
import { agentMaySeeTemplate, AGENT_AREA_READY } from "@/lib/enterprise/nop-render/kit-v2-access"

/**
 * Kit v2: Basic Benefits' final flyers, imported as supplied. The renderer
 * adds a <base> tag and the accent-font metrics to <head> and nothing else, so every page's locked
 * content (benefits, prices, disclaimers) is byte-for-byte theirs. Only the
 * kit's own files are reachable; Opificio isn't shipped; Spanish and all of
 * kit v2 stay away from agents until approved.
 */

const SOURCE = "/Users/grahampearl/Downloads/NOP-Flyers-Handoff/html"

describe("the imported kit", () => {
  it("has all 12 designs, each as a Letter page and a bleed page", () => {
    expect(NOP_V2_TEMPLATES).toHaveLength(12)
    for (const id of NOP_V2_TEMPLATES) for (const size of ["letter", "bleed"] as const) {
      expect(fs.existsSync(path.join(KIT_V2_DIR, "html", v2FileName(id, size))), v2FileName(id, size)).toBe(true)
    }
    expect(NOP_V2_TEMPLATES.filter((t) => v2Parts(t).lang === "EN")).toHaveLength(6)
  })

  it.skipIf(!fs.existsSync(SOURCE))("every page is byte-identical to Basic Benefits' handoff", () => {
    for (const id of NOP_V2_TEMPLATES) for (const size of ["letter", "bleed"] as const) {
      expect(readV2Html(id, size), v2FileName(id, size)).toBe(fs.readFileSync(path.join(SOURCE, v2FileName(id, size)), "utf8"))
    }
  })

  it("price and no-price differ only in the price box being shown", () => {
    const a = readV2Html("NOP2_P1_EN_PRICE", "letter"), b = readV2Html("NOP2_P1_EN_NOPRICE", "letter")
    expect(a.replace("display:flex;border:1px solid rgba(255,255,255,.12)", "X")).toBe(b.replace("display:none;border:1px solid rgba(255,255,255,.12)", "X"))
  })

  it("ships no Opificio, and exactly the six Poppins faces the approved PDFs embed", () => {
    const fonts = fs.readdirSync(path.join(KIT_V2_DIR, "html", "_ds", fs.readdirSync(path.join(KIT_V2_DIR, "html", "_ds"))[0], "assets", "fonts")).sort()
    expect(fonts).toEqual(["Poppins-Bold.ttf", "Poppins-ExtraBold.ttf", "Poppins-ExtraBoldItalic.ttf", "Poppins-Light.ttf", "Poppins-Regular.ttf", "Poppins-SemiBold.ttf"])
  })
})

describe("what the renderer changes", () => {
  it.each(NOP_V2_TEMPLATES.flatMap((id) => [[id, "letter"], [id, "bleed"]] as const))("%s %s: <base> and accent metrics in <head>; <body> untouched", (id, size) => {
    const source = readV2Html(id, size), rendered = v2HtmlForRender(id, size)
    expect(bodyOf(rendered)).toBe(bodyOf(source))
    expect(rendered.replace(`<base href="${KIT_V2_ORIGIN}/">${ACCENT_METRICS}`, "")).toBe(source)
  })

  it("the accent metrics use a kit Poppins file, only for the space character, so digits still fall back to Poppins as in the approved PDFs", () => {
    const src = /url\('([^']+)'\)/.exec(ACCENT_METRICS)![1]
    expect(src).toMatch(/Poppins-ExtraBold\.ttf$/)
    expect(kitV2FileFor(`${KIT_V2_ORIGIN}/${src}`)).not.toBeNull()
    expect(ACCENT_METRICS).toContain("unicode-range:U+0020}")
    expect(ACCENT_METRICS).toContain("ascent-override:70%;descent-override:19.8%;line-gap-override:4.9%")
  })

  it("serves only files inside the kit's html folder", () => {
    expect(kitV2FileFor(`${KIT_V2_ORIGIN}/assets/bb-logo-light.png`)).toMatch(/kit-v2\/html\/assets\/bb-logo-light\.png$/)
    expect(kitV2FileFor(`${KIT_V2_ORIGIN}/../reference/letter/NOP-P1-Everyday-Care-EN-Price.pdf`)).toBeNull()
    expect(kitV2FileFor(`${KIT_V2_ORIGIN}/%2e%2e/%2e%2e/package.json`)).toBeNull()
    expect(kitV2FileFor(`${KIT_V2_ORIGIN}/_ds/x/assets/fonts/opificio_bold.ttf`)).toBeNull()
    expect(kitV2FileFor("https://fonts.googleapis.com/css2?family=Poppins")).toBeNull()
  })
})

describe("who may see which flyers", () => {
  const v1 = { agentKit: "v1" as const, spanishV2: false }
  const v2es = { agentKit: "v2" as const, spanishV2: true }

  it("agents stay on kit v1.1.1 while it's selected", () => {
    expect(agentMaySeeTemplate("NOP_P1_EN", v1, true)).toBe(true)
    expect(agentMaySeeTemplate("NOP_P1_EN", { agentKit: "v2", spanishV2: false }, true)).toBe(false)
  })

  it("no kit-v2 flyer reaches an agent while the agent area doesn't exist, whatever the settings", () => {
    expect(AGENT_AREA_READY).toBe(false)
    for (const id of NOP_V2_TEMPLATES) {
      expect(agentMaySeeTemplate(id, v1, false), id).toBe(false)
      expect(agentMaySeeTemplate(id, v2es, false), id).toBe(false)
    }
  })

  it("an unknown id is never visible", () => {
    expect(isNopV2Template("NOP2_P4_EN_PRICE")).toBe(false)
    expect(agentMaySeeTemplate("NOP2_P4_EN_PRICE", v2es, false)).toBe(false)
  })
})
