import { describe, it, expect, afterAll } from "vitest"
import fs from "node:fs"
import { PNG } from "pngjs"
import { readTemplate, fillTemplate, hashOutsideFooter } from "@/lib/ap/templates/kit"
import { checkPackages, templatesFor, type ApPackage } from "@/lib/ap/templates/content"
import { analyzeLogo, logoHtml, LOGO_BOX } from "@/lib/ap/templates/logo"
import { SLOTS, LAYOUTS, type Layout } from "@/lib/ap/templates/slots"
import { sampleSlots } from "@/lib/ap/templates/sample"
import { ApRenderError, decodeQrFromPng, forRender, pageHtml, renderFlyer, type AgentValues } from "@/lib/ap/templates/render"
import { acquireBrowser } from "@/lib/pdf/flyer-pdf"

// The agent platform's flyer slots. Most checks run in the real renderer
// (Playwright's Chromium), as approved: fit is measured, never assumed.

const SUPPLIED = JSON.parse(fs.readFileSync("tests/fixtures-ap-supplied-slots.json", "utf8")) as Record<Layout, Record<string, { EN: string; ES: string }>>
const NOP_FILE: Record<Layout, string> = { P1: "NOP-P1-Everyday-Care", P2: "NOP-P2-Complete-Virtual-Care", P3: "NOP-P3-Health-Weight-Management" }
const supplied = (layout: Layout, lang: "en" | "es") => Object.fromEntries(Object.entries(SUPPLIED[layout]).map(([k, v]) => [k, lang === "en" ? v.EN : v.ES]))
const AGENT: AgentValues = { name: "Pat Sample", phone: "(555) 555-0123", link: { href: "https://example.org/ap/q/Smp2345", lines: ["example.org/ap/q/Smp2345"] }, qr: "https://example.org/ap/q/Smp2345" }
const SLOW = 120_000

afterAll(async () => {
  // The local shared browser (acquireBrowser caches one on macOS) would keep vitest alive.
  const { browser } = await acquireBrowser()
  await browser.close().catch(() => undefined)
})

// ---- Control: the slots are the only change ---------------------------------

describe("templates are NOP's kit with slots, nothing else", () => {
  it.each(LAYOUTS.flatMap((l) => (["en", "es"] as const).flatMap((lang) => (["letter", "bleed"] as const).flatMap((size) => [true, false].map((price) => [l, lang, size, price] as const)))))(
    "%s %s %s price=%s reproduces NOP's page outside the footer, byte for byte",
    (layout, lang, size, price) => {
      const nopPath = `enterprise/nop/kit-v2/html/${NOP_FILE[layout]}-${lang.toUpperCase()}-${price ? "Price" : "NoPrice"}${size === "bleed" ? "-bleed" : ""}.html`
      const nop = fs.readFileSync(nopPath, "utf8")
      const title = /<title>([^<]*)<\/title>/.exec(nop)![1]
      const label = /data-screen-label="([^"]*)"/.exec(nop)![1]
      const img = /<img src="assets\/bb-logo-light\.png"[^>]*>/.exec(nop)![0]
      const ours = fillTemplate({ layout, lang, size, showPrice: price, title, screenLabel: label, logoHtml: img, slots: supplied(layout, lang) })
        .replace(/<span data-ap-slot="[^"]+">([^<]*)<\/span>/g, "$1")
        .replaceAll("_ds/kit/", "_ds/basic-benefits-design-system-65e9c885-f032-4927-be79-6ba6a48cd125/")
      // Documented exception: data-screen-label is generated (NOP leaves a raw "&" in it; ours is escaped).
      const outside = (h: string) => h.replace(/<footer[\s\S]*<\/footer>/, "").replace(/data-screen-label="[^"]*"/, 'data-screen-label=""')
      // The slot values are HTML-escaped; NOP's text has the same entities (&amp;) where it needs them.
      expect(outside(ours)).toBe(outside(nop))
    },
  )

  it("no template carries Basic Benefits text, and every placeholder is known", () => {
    for (const l of LAYOUTS) {
      const t = readTemplate(l)
      expect(t).not.toMatch(/basic\s*benefits|basicbenefits|bb-logo|BenefitHub|Healthyr|Neighborhood Outreach|NOP-P/i)
      const slots = [...t.matchAll(/\{\{slot:([A-Za-z0-9.]+)\}\}/g)].map((m) => m[1]).sort()
      expect(slots).toEqual([...SLOTS[l].map((s) => s.key), "footer.programLine", "footer.taglineLine", "footer.versionStamp"].sort())
    }
  })
})

// ---- Content rules -----------------------------------------------------------

const pkg = (layout: Layout, langs: ("en" | "es")[], tweak: (v: Record<string, string>, lang: string) => void = () => {}) => ({
  layout,
  pricing: ["price", "noprice"],
  variants: Object.fromEntries(langs.map((l) => { const v = sampleSlots(layout, l); tweak(v, l); return [l, v] })),
})

describe("package content", () => {
  it("an English-only org needs no Spanish, may not send it, and offers no Spanish flyers", () => {
    const ok = checkPackages([pkg("P1", ["en"])], ["en"])
    expect(ok.ok).toBe(true)
    const extra = checkPackages([pkg("P1", ["en", "es"])], ["en"])
    expect(extra.ok).toBe(false)
    if (!extra.ok) expect(extra.errors.some((e) => e.path === "packages[0].variants.es")).toBe(true)
    if (ok.ok) expect(templatesFor(ok.value, ["en"]).map((t) => t.lang)).toEqual(["en", "en"])
  })

  it("a bilingual org needs every Spanish slot", () => {
    const out = checkPackages([pkg("P2", ["en"])], ["en", "es"])
    expect(out.ok).toBe(false)
    if (!out.ok) expect(out.errors.filter((e) => e.path.startsWith("packages[0].variants.es.")).length).toBe(SLOTS.P2.length)
  })

  it("rejects over-budget, empty, bad prices and prices that differ by language", () => {
    const over = checkPackages([pkg("P3", ["en"], (v) => { v["card1.title"] = "x".repeat(36) })], ["en"])
    expect(!over.ok && over.errors[0]).toMatchObject({ path: "packages[0].variants.en.card1.title", error: "At most 35 characters (got 36)." })
    const empty = checkPackages([pkg("P3", ["en"], (v) => { v.disclaimer = "  " })], ["en"])
    expect(!empty.ok && empty.errors[0].error).toBe("Required.")
    const price = checkPackages([pkg("P3", ["en"], (v) => { v["price.1.amount"] = "$100.00" })], ["en"])
    expect(!price.ok && price.errors[0].path).toBe("packages[0].variants.en.price.1.amount")
    const differ = checkPackages([pkg("P3", ["en", "es"], (v, l) => { if (l === "es") v["price.1.amount"] = "$99" })], ["en", "es"])
    expect(!differ.ok && differ.errors.some((e) => e.path === "packages[0].price.1.amount")).toBe(true)
  })
})

// ---- Logo contrast -----------------------------------------------------------

function png(w: number, h: number, paint: (x: number, y: number) => [number, number, number, number]): Buffer {
  const p = new PNG({ width: w, height: h })
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4
    const [r, g, b, a] = paint(x, y)
    p.data[i] = r; p.data[i + 1] = g; p.data[i + 2] = b; p.data[i + 3] = a
  }
  return PNG.sync.write(p)
}
// A 600x150 "wordmark": an inner bar of colour on transparency.
const mark = (fill: (x: number) => [number, number, number]) => png(600, 150, (x, y) => (x > 30 && x < 570 && y > 35 && y < 115 ? [...fill(x), 255] : [0, 0, 0, 0]))
const LOGOS = {
  navy: mark(() => [0x10, 0x1c, 0x5e]),
  black: mark(() => [0, 0, 0]),
  white: mark(() => [255, 255, 255]),
  mixed: mark((x) => (x < 300 ? [255, 255, 255] : [0x10, 0x1c, 0x5e])),
}

describe("logo contrast against the navy header", () => {
  it("navy, black and mixed logos get the white chip; a white logo doesn't", () => {
    const a = Object.fromEntries(Object.entries(LOGOS).map(([k, b]) => [k, analyzeLogo(b)]))
    for (const v of Object.values(a)) expect(v.ok).toBe(true)
    const chip = (k: string) => (a[k] as { ok: true; analysis: { chip: boolean; passShare: number } }).analysis
    expect(chip("navy")).toMatchObject({ chip: true, passShare: 0 })
    expect(chip("black")).toMatchObject({ chip: true, passShare: 0 })
    expect(chip("white")).toMatchObject({ chip: false, passShare: 1 })
    expect(chip("mixed").chip).toBe(true)
    expect(chip("mixed").passShare).toBeCloseTo(0.5, 1)
  })

  it("refuses non-PNGs, short, and extreme shapes", () => {
    expect(analyzeLogo(Buffer.from("%PDF-1.4"))).toMatchObject({ ok: false })
    expect(analyzeLogo(png(400, 100, () => [255, 255, 255, 255]))).toMatchObject({ ok: false, error: expect.stringContaining("125px tall") })
    expect(analyzeLogo(png(1400, 150, () => [255, 255, 255, 255]))).toMatchObject({ ok: false, error: expect.stringContaining("between 1:1 and 8:1") })
  })

  it.each(Object.keys(LOGOS))("the %s logo, on the real render: inside the 200x40 box, chip pixels where expected", async (name) => {
    const bytes = LOGOS[name as keyof typeof LOGOS]
    const a = analyzeLogo(bytes)
    if (!a.ok) throw new Error(a.error)
    const html = pageHtml({ layout: "P1", lang: "en", size: "letter", showPrice: true, title: "t", screenLabel: "t", logoHtml: logoHtml({ dataUri: `data:image/png;base64,${bytes.toString("base64")}`, analysis: a.analysis }, "Sample Benefits Co."), slots: { ...supplied("P1", "en"), "footer.programLine": "Sample", "footer.taglineLine": "Sample", "footer.versionStamp": "SBC-P1-EN · 11/2026" } }, "supplied")
    const { browser } = await acquireBrowser()
    const ctx = await browser.newContext({ deviceScaleFactor: 2 })
    try {
      const page = await ctx.newPage()
      await page.setContent(html.replace("{{agent_area}}", ""), { waitUntil: "load" })
      const box = page.locator("[data-ap-logo]")
      expect(await box.getAttribute("data-ap-logo")).toBe(a.analysis.chip ? "chip" : "plain")
      const bb = (await box.boundingBox())!
      expect(bb.width).toBeCloseTo(LOGO_BOX.w, 0)
      expect(bb.height).toBeCloseTo(LOGO_BOX.h, 0)
      const shot = PNG.sync.read(await box.screenshot())
      // A pixel 2 CSS px inside the box's left edge, at mid-height: the chip's padding when there is one.
      const at = (cssX: number, cssY: number) => { const i = (Math.round(cssY * 2) * shot.width + Math.round(cssX * 2)) * 4; return [shot.data[i], shot.data[i + 1], shot.data[i + 2]] }
      const edge = at(3, 20)
      if (a.analysis.chip) expect(edge).toEqual([255, 255, 255])
      else expect(edge[2]).toBeLessThan(80) // navy header shows through
    } finally {
      await ctx.close()
    }
  }, SLOW)
})

// ---- Measured fit ------------------------------------------------------------

const footer = { "footer.programLine": "Sample Benefits Co.", "footer.taglineLine": "Sign in or enroll online", "footer.versionStamp": "SBC-P1-EN · 11/2026" }
const render = (layout: Layout, slots: Record<string, string>, lang: "en" | "es" = "en", extra: { proof?: boolean; expectHash?: string | null; spacing?: string | null } = {}) =>
  renderFlyer({ layout, lang, size: "letter", showPrice: true, title: "t", screenLabel: "t", logoHtml: logoHtml(null, "Sample Benefits Co."), slots: { ...slots, ...footer }, agent: AGENT, spacing: extra.spacing ?? null, expectHash: extra.expectHash ?? null, proof: extra.proof ?? false }, "png")

describe("measured fit on the real render", () => {
  it.each(LAYOUTS.flatMap((l) => (["en", "es"] as const).map((lang) => [l, lang] as const)))("%s %s: the supplied text passes every gate and the QR reads back", async (layout, lang) => {
    const r = await render(layout, supplied(layout, lang), lang)
    expect(r.qr).toBe(AGENT.qr)
    expect(decodeQrFromPng(r.body)).toBe(AGENT.qr)
  }, SLOW)

  it.each(LAYOUTS)("%s: sample content (80%% of budgets) passes", async (layout) => {
    await render(layout, sampleSlots(layout, "en"))
  }, SLOW)

  it.each(LAYOUTS)("%s: every slot at its budget in wide letters is refused, naming slots, never clipped", async (layout) => {
    const wide = Object.fromEntries(SLOTS[layout].map((s) => [s.key, s.budget === "amount" ? "$9999" : "W".repeat(s.budget)]))
    const err = await render(layout, wide).then(() => null, (e) => e)
    expect(err).toBeInstanceOf(ApRenderError)
    expect(err.problems.length).toBeGreaterThan(0)
    expect(err.problems.some((p: { slot?: string }) => p.slot && SLOTS[layout].some((s) => s.key === p.slot))).toBe(true)
  }, SLOW)

  it.each(LAYOUTS)("%s: one slot one line too long is refused by name", async (layout) => {
    const slots = supplied(layout, "en")
    slots["card1.title"] = "Wide Wide Wide Wide Wide Wide W".slice(0, SLOTS[layout].find((s) => s.key === "card1.title")!.budget as number)
    slots["header.titleLine1"] = "WWWWWWWWWWWWWWWWWW"
    const err = await render(layout, slots).then(() => null, (e) => e)
    expect(err).toBeInstanceOf(ApRenderError)
    expect(err.problems.map((p: { slot?: string }) => p.slot)).toContain("header.titleLine1")
  }, SLOW)

  it.each(LAYOUTS)("%s: very short content (1-3 characters per slot) still passes every page gate", async (layout) => {
    const short = Object.fromEntries(SLOTS[layout].map((s, i) => [s.key, s.budget === "amount" ? "$1" : ["A", "Ab", "Abc"][i % 3]]))
    const r = await render(layout, short)
    expect(r.qr).toBe(AGENT.qr)
  }, SLOW)

  it("Spanish at the supplied maxima passes on every layout (covered above) and P1 picks the tight spacing for it", async () => {
    const r = await render("P1", supplied("P1", "es"), "es")
    expect(r.spacing).toBe("tight")
    const en = await render("P1", supplied("P1", "en"))
    expect(en.spacing).toBe("supplied")
  }, SLOW)
})

// ---- Approval, PROOF and brand guard ------------------------------------------

describe("approved versions and proofs", () => {
  const topCentrePixel = (pngBuf: Buffer) => { const p = PNG.sync.read(pngBuf); const i = (3 * p.width + Math.floor(p.width / 2)) * 4; return [p.data[i], p.data[i + 1], p.data[i + 2]] }

  it("a proof carries the red PROOF band; an approved render doesn't, and is pinned by hash", async () => {
    const slots = sampleSlots("P2", "en")
    const proof = await render("P2", slots, "en", { proof: true })
    const [r, g, b] = topCentrePixel(proof.body)
    expect(r).toBeGreaterThan(180); expect(g).toBeLessThan(90); expect(b).toBeLessThan(90)

    const approved = await render("P2", slots, "en", { expectHash: proof.hash, spacing: proof.spacing })
    const [r2, , b2] = topCentrePixel(approved.body)
    expect(r2).toBeLessThan(60); expect(b2).toBeGreaterThan(30) // the navy header
    expect(approved.hash).toBe(proof.hash) // the watermark is outside what's hashed
  }, SLOW)

  it("a page that differs from the approved hash is refused", async () => {
    const slots = sampleSlots("P3", "en")
    const ok = await render("P3", slots)
    const tampered = { ...slots, "card2.title": "Changed after approval" }
    const err = await render("P3", tampered, "en", { expectHash: ok.hash, spacing: ok.spacing }).then(() => null, (e) => e)
    expect(err).toMatchObject({ code: "hash_mismatch" })
  }, SLOW)

  it("hashes ignore the footer (agent details) but not the body", () => {
    const base = { layout: "P1" as const, lang: "en", size: "letter" as const, showPrice: true, title: "t", screenLabel: "t", logoHtml: logoHtml(null, "X Co."), slots: { ...sampleSlots("P1", "en"), ...footer } }
    const h1 = hashOutsideFooter(fillTemplate(base))
    expect(hashOutsideFooter(fillTemplate({ ...base, slots: { ...base.slots, "footer.taglineLine": "Other" } }))).toBe(h1)
    expect(hashOutsideFooter(fillTemplate({ ...base, slots: { ...base.slots, disclaimer: "Other." } }))).not.toBe(h1)
    expect(hashOutsideFooter(fillTemplate({ ...base, showPrice: false }))).not.toBe(h1)
  })

  it("foreign brand text that the org didn't type is refused", async () => {
    const slots = sampleSlots("P1", "en")
    const bad = render("P1", slots, "en").then(() => null)
    await bad
    const err = await renderFlyer({ layout: "P1", lang: "en", size: "letter", showPrice: true, title: "t", screenLabel: "t", logoHtml: '<img src="assets/bb-logo-light.png">', slots: { ...slots, ...footer }, agent: AGENT, spacing: null, expectHash: null, proof: false }, null).then(() => null, (e) => e)
    expect(err).toMatchObject({ code: "foreign_brand" })
  }, SLOW)

  it("approval covers exactly the enabled languages' templates", () => {
    const pk = [{ id: "pkg_abcdefgh", layout: "P1", pricing: ["price"], variants: { en: sampleSlots("P1", "en") } }] as ApPackage[]
    expect(templatesFor(pk, ["en"]).map((t) => t.id)).toEqual(["pkg_abcdefgh_EN_PRICE"])
    expect(templatesFor(pk, ["en", "es"]).map((t) => t.id)).toEqual(["pkg_abcdefgh_EN_PRICE"])
  })
})

describe("fit errors name only the slot that overflows", () => {
  const problemsOf = async (layout: Layout, patch: Record<string, string>) => {
    const err = await render(layout, { ...sampleSlots(layout, "en"), ...patch }).then(() => null, (e) => e)
    expect(err).toBeInstanceOf(ApRenderError)
    return (err as ApRenderError).problems
  }

  it("a too-wide first title line doesn't also blame the second line sharing its heading", async () => {
    const p = await problemsOf("P1", { "header.titleLine1": "WWWWWWWWWWWWWWWWWW" })
    expect(p.map((x) => x.slot)).toEqual(["header.titleLine1"])
  }, SLOW)

  it("the same for the engagement card's two-part heading", async () => {
    const p = await problemsOf("P3", { "engage.line1": "WWWWWWWWWWWWWWWWWWWWWWWWW" })
    expect(p.map((x) => x.slot)).toEqual(["engage.line1"])
  }, SLOW)

  it("a description with too many lines is the only problem: no knock-on page overflow or later slots", async () => {
    const budget = SLOTS.P3.find((s) => s.key === "card1.description")!.budget as number
    const p = await problemsOf("P3", { "card1.description": "Wide Mmmm ".repeat(20).slice(0, budget).trim() })
    expect(p.length).toBeGreaterThan(0)
    expect(p.every((x) => x.slot === "card1.description")).toBe(true)
  }, SLOW)
})

describe("PROOF band", () => {
  it.each(["letter", "bleed"] as const)("leaves at least 6px between the band and the logo chip (%s, real render)", async (size) => {
    const a = analyzeLogo(LOGOS.navy)
    if (!a.ok) throw new Error(a.error)
    const html = pageHtml({ layout: "P2", lang: "en", size, showPrice: true, title: "t", screenLabel: "t", logoHtml: logoHtml({ dataUri: `data:image/png;base64,${LOGOS.navy.toString("base64")}`, analysis: a.analysis }, "Sample Benefits Co."), slots: { ...sampleSlots("P2", "en"), ...footer } }, "approved")
    const { browser } = await acquireBrowser()
    const ctx = await browser.newContext()
    try {
      const page = await ctx.newPage()
      await page.setContent(forRender(html.replace("{{agent_area}}", ""), true), { waitUntil: "load" })
      const band = (await page.locator("[data-ap-proof] .b").boundingBox())!
      const chip = (await page.locator("[data-ap-logo] > div").boundingBox())!
      expect(await page.locator("[data-ap-logo]").getAttribute("data-ap-logo")).toBe("chip")
      expect(chip.y - (band.y + band.height)).toBeGreaterThanOrEqual(6)
    } finally {
      await ctx.close()
    }
  }, SLOW)
})
