import { describe, it, expect } from "vitest"
import { buildTemplate, parsePackageFile, slotLabel, describeProblem, HEADERS } from "@/lib/ap/package-file"
import { readXlsx, unzip, writeXlsx, writeZip } from "@/lib/ap/xlsx"
import { SLOTS, LAYOUTS } from "@/lib/ap/templates/slots"
import { sampleSlots } from "@/lib/ap/templates/sample"
import type { ApPackage } from "@/lib/ap/templates/content"

// The package spreadsheet: generated from slots.ts, read back through the
// same checks as a manual save. (The real-render fit step of an import is
// covered in tests/ap-routes.test.ts.)

const both = ["en", "es"] as const
const draft = (langs: ("en" | "es")[] = [...both]): ApPackage[] => [
  { id: "pkg_aaaaaaaa", layout: "P1", pricing: ["price", "noprice"], variants: Object.fromEntries(langs.map((l) => [l, sampleSlots("P1", l)])) },
  { id: "pkg_bbbbbbbb", layout: "P3", pricing: ["price"], variants: Object.fromEntries(langs.map((l) => [l, sampleSlots("P3", l)])) },
]
const file = (bytes: Buffer, name = "x.xlsx") => ({ name, bytes })

/** Changes one cell (by sheet, slot key and column header) in a template. */
function edit(buf: Buffer, sheet: string, key: string, header: string, value: string): Buffer {
  const sheets = readXlsx(buf).map((s) => {
    const head = s.rows[0].cells
    return {
      name: s.name,
      widths: head.map(() => 20),
      rows: s.rows.map((r, i) => r.cells.map((v, c) => ({ v: s.name === sheet && i > 0 && r.cells[0] === key && head[c] === header ? value : v, s: (i === 0 ? 1 : c < 3 ? 2 : 3) as 1 | 2 | 3 }))),
    }
  })
  return writeXlsx(sheets)
}

describe("template", () => {
  it("is generated from the slot definitions: one sheet per package, every slot, in order", () => {
    const sheets = readXlsx(buildTemplate([...both], draft()))
    expect(sheets.map((s) => s.name)).toEqual(["P1", "P3"])
    expect(sheets[0].rows[0].cells).toEqual([HEADERS.key, HEADERS.label, HEADERS.max, HEADERS.en, HEADERS.es])
    expect(sheets[0].rows.slice(1).map((r) => r.cells[0])).toEqual(SLOTS.P1.map((s) => s.key))
    expect(sheets[1].rows.slice(1).map((r) => r.cells[0])).toEqual(SLOTS.P3.map((s) => s.key))
    const price = sheets[0].rows.find((r) => r.cells[0] === "price.1.amount")!
    expect(price.cells[2]).toBe("$ + 1–4 digits")
    expect(price.cells[1]).toMatch(/\$ \+ 1–4 digits/)
    expect(sheets[0].rows.find((r) => r.cells[0] === "card1.title")!.cells[2]).toBe(String(SLOTS.P1.find((s) => s.key === "card1.title")!.budget))
    for (const l of LAYOUTS) for (const s of SLOTS[l]) expect(slotLabel(s.key), s.key).not.toBe(s.key)
  })

  it("locks the slot-key columns (sheet protection, locked style) and leaves the language columns editable", () => {
    const files = unzip(buildTemplate(["en"], draft(["en"])))
    const sheet = files.get("xl/worksheets/sheet1.xml")!.toString()
    const styles = files.get("xl/styles.xml")!.toString()
    expect(sheet).toContain('<sheetProtection sheet="1"')
    expect(sheet).toMatch(/<c r="A2" s="2"/) // slot key: locked, grey
    expect(sheet).toMatch(/<c r="D2" s="3"/) // English: unlocked
    expect(styles).toMatch(/applyProtection="1"><alignment[^>]*\/><protection locked="1"\/><\/xf><xf[^>]*><alignment[^>]*\/><protection locked="0"\/>/)
  })

  it("an English-only org gets no Spanish column", () => {
    const sheets = readXlsx(buildTemplate(["en"], draft(["en"])))
    expect(sheets[0].rows[0].cells).toEqual([HEADERS.key, HEADERS.label, HEADERS.max, HEADERS.en])
  })

  it("prefills sample content when a package has none", () => {
    const sheets = readXlsx(buildTemplate(["en"], [{ layout: "P2", variants: {} }]))
    expect(sheets[0].rows.find((r) => r.cells[0] === "header.programTag")!.cells[3]).toBe(sampleSlots("P2", "en")["header.programTag"])
  })
})

describe("import", () => {
  it("round trip: download -> import unchanged -> identical draft (and the same file again)", () => {
    const d = draft()
    const t = buildTemplate([...both], d)
    const out = parsePackageFile(file(t), [...both], d)
    expect(out.ok).toBe(true)
    if (out.ok) {
      expect(out.packages).toEqual(d)
      expect(buildTemplate([...both], out.packages).equals(t)).toBe(true)
    }
  })

  it("one over-budget cell rejects the whole file, naming sheet, row, key and language", () => {
    const d = draft()
    const budget = SLOTS.P3.find((s) => s.key === "card2.title")!.budget as number
    const bad = edit(buildTemplate([...both], d), "P3", "card2.title", HEADERS.es, "x".repeat(budget + 1))
    const out = parsePackageFile(file(bad), [...both], d)
    expect(out.ok).toBe(false)
    if (!out.ok) {
      const row = SLOTS.P3.findIndex((s) => s.key === "card2.title") + 2
      expect(out.problems).toEqual([{ sheet: "P3", row, key: "card2.title", lang: "es", error: `At most ${budget} characters (got ${budget + 1}).` }])
      expect(describeProblem(out.problems[0])).toBe(`P3 row ${row} (card2.title, Spanish): At most ${budget} characters (got ${budget + 1}).`)
    }
  })

  it("lists EVERY failing slot, not just the first", () => {
    const d = draft()
    let t = buildTemplate([...both], d)
    t = edit(t, "P1", "card1.title", HEADERS.en, "x".repeat(99))
    t = edit(t, "P1", "disclaimer", HEADERS.es, "")
    t = edit(t, "P3", "price.1.amount", HEADERS.en, "36")
    const out = parsePackageFile(file(t), [...both], d)
    expect(out.ok).toBe(false)
    if (!out.ok) {
      // Three bad cells -> four problems: the English price is malformed AND no longer matches the Spanish one.
      expect(out.problems.map((p) => `${p.sheet}:${p.key}:${p.lang ?? "-"}:${p.row ?? "-"}`).sort()).toEqual([
        `P1:card1.title:en:${SLOTS.P1.findIndex((s) => s.key === "card1.title") + 2}`,
        `P1:disclaimer:es:${SLOTS.P1.findIndex((s) => s.key === "disclaimer") + 2}`,
        `P3:price.1.amount:-:${SLOTS.P3.findIndex((s) => s.key === "price.1.amount") + 2}`,
        `P3:price.1.amount:en:${SLOTS.P3.findIndex((s) => s.key === "price.1.amount") + 2}`,
      ].sort())
    }
  })

  it("an unknown slot key is an error with its row", () => {
    const d = draft()
    const t = buildTemplate([...both], d)
    const sheets = readXlsx(t).map((s) => ({ name: s.name, widths: [20, 20, 20, 20, 20], rows: s.rows.map((r) => r.cells.map((v) => ({ v, s: 3 as const }))) }))
    sheets[0].rows.push(["card9.title", "x", "10", "Hi", "Hola"].map((v) => ({ v, s: 3 as const })))
    const out = parsePackageFile(file(writeXlsx(sheets)), [...both], d)
    expect(!out.ok && out.problems).toEqual([{ sheet: "P1", row: SLOTS.P1.length + 2, key: "card9.title", lang: null, error: '"card9.title" isn\'t a slot of a P1 package.' }])
  })

  it("a missing slot and a package the org hasn't added are errors", () => {
    const d = draft()
    const sheets = readXlsx(buildTemplate([...both], d)).map((s) => ({ name: s.name, widths: [20, 20, 20, 20, 20], rows: s.rows.filter((r) => r.cells[0] !== "steps.2").map((r) => r.cells.map((v) => ({ v, s: 3 as const }))) }))
    sheets.push({ name: "P2", widths: [20], rows: [[{ v: HEADERS.key, s: 3 as const }]] })
    const out = parsePackageFile(file(writeXlsx(sheets)), [...both], d)
    expect(out.ok).toBe(false)
    if (!out.ok) {
      expect(out.problems).toContainEqual({ sheet: "P1", row: null, key: "steps.2", lang: null, error: 'Slot "steps.2" is missing: every slot of a P1 package is required.' })
      expect(out.problems.some((p) => p.sheet === "P2" && /isn't a package this org has added/.test(p.error))).toBe(true)
    }
  })

  it("Spanish-off org: no Spanish needed; a Spanish column is refused", () => {
    const d = draft(["en"])
    const ok = parsePackageFile(file(buildTemplate(["en"], d)), ["en"], d)
    expect(ok.ok).toBe(true)
    const withEs = parsePackageFile(file(buildTemplate([...both], draft())), ["en"], d)
    expect(!withEs.ok && withEs.problems.every((p) => p.lang === "es" && /doesn't have Spanish switched on/.test(p.error))).toBe(true)
  })

  it("Basic Benefits text in a slot is refused, naming the row", () => {
    const d = draft()
    const t = edit(buildTemplate([...both], d), "P1", "card3.description", HEADERS.en, "Discounts through BenefitHub for members.")
    const out = parsePackageFile(file(t), [...both], d)
    expect(out.ok).toBe(false)
    if (!out.ok) {
      expect(out.problems).toHaveLength(1)
      expect(out.problems[0]).toMatchObject({ sheet: "P1", key: "card3.description", lang: "en", row: SLOTS.P1.findIndex((s) => s.key === "card3.description") + 2 })
      expect(out.problems[0].error).toMatch(/Contains "BenefitHub": Basic Benefits \/ NOP text/)
    }
  })

  it("reads a workbook the way Excel saves it (shared strings, rich text runs)", () => {
    const d = draft(["en"])
    const t = readXlsx(buildTemplate(["en"], d))[0]
    const strings: string[] = []
    const si = (v: string) => (strings.push(v), strings.length - 1)
    const rows = t.rows.map((r, i) => `<row r="${i + 1}">${r.cells.map((v, c) => `<c r="${"ABCD"[c]}${i + 1}" t="s"><v>${si(v)}</v></c>`).join("")}</row>`).join("")
    const enc = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;")
    const files: [string, Buffer][] = [
      ["xl/workbook.xml", Buffer.from(`<workbook xmlns:r="r"><sheets><sheet name="P1" sheetId="1" r:id="rId7"/></sheets></workbook>`)],
      ["xl/_rels/workbook.xml.rels", Buffer.from(`<Relationships><Relationship Id="rId7" Type="x" Target="/xl/worksheets/sheetA.xml"/></Relationships>`)],
      ["xl/sharedStrings.xml", Buffer.from(`<sst>${strings.map((s, i) => (i === 5 ? `<si><r><t>${enc(s.slice(0, 3))}</t></r><r><t xml:space="preserve">${enc(s.slice(3))}</t></r></si>` : `<si><t>${enc(s)}</t></si>`)).join("")}</sst>`)],
      ["xl/worksheets/sheetA.xml", Buffer.from(`<worksheet><sheetData>${rows}</sheetData></worksheet>`)],
    ]
    const out = parsePackageFile(file(writeZip(files)), ["en"], [d[0]])
    expect(out.ok && out.packages[0].variants.en).toEqual(d[0].variants.en)
  })

  it("accepts a CSV of the same columns with a Package column", () => {
    const d = draft(["en"])
    const q = (v: string) => `"${v.replace(/"/g, '""')}"`
    const lines = [["Package", HEADERS.key, HEADERS.label, HEADERS.max, HEADERS.en].map(q).join(",")]
    for (const p of d) for (const s of SLOTS[p.layout]) lines.push([p.layout, s.key, slotLabel(s.key), String(s.budget), p.variants.en![s.key]].map(q).join(","))
    const out = parsePackageFile(file(Buffer.from(lines.join("\r\n")), "p.csv"), ["en"], d)
    expect(out.ok && out.packages).toEqual(d)
    const noPkg = parsePackageFile(file(Buffer.from(`${HEADERS.key},${HEADERS.en}\r\nx,y`), "p.csv"), ["en"], d)
    expect(!noPkg.ok && noPkg.problems[0].error).toMatch(/needs a "Package" column/)
  })

  it("a file that isn't a workbook is refused clearly", () => {
    const out = parsePackageFile(file(Buffer.from("hello")), ["en"], draft(["en"]))
    expect(!out.ok && out.problems[0].error).toMatch(/Couldn't read the file/)
  })
})
