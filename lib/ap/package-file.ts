import { LAYOUTS, SLOTS, type Layout, type SlotSpec } from "./templates/slots"
import { sampleSlots } from "./templates/sample"
import { checkPackages, type ApPackage, type SlotValues } from "./templates/content"
import { readCsv, readXlsx, writeXlsx, type Cell, type Sheet } from "./xlsx"
import type { ApLang } from "./types"

// The package spreadsheet: generated from the slot definitions (slots.ts), so
// it can't drift from what the renderer fills. One sheet per package, named
// by its layout (P1, P2, P3; "P1 (2)" for a second package on the same
// layout). Columns: Slot key | What it is | Max characters | English | Spanish
// (Spanish only when the org has it on). The first three columns are locked.
//
// Import fills the DRAFT only, through the same checks as a manual save
// (checkPackages, then the real-render fit check in the route). Every problem
// is reported with its sheet, row and slot key; nothing is saved unless the
// whole file passes.

export const HEADERS = { key: "Slot key", label: "What it is (plain label)", max: "Max characters", en: "English", es: "Spanish", pkg: "Package" } as const

/** A plain-language label for every slot key, built from its parts. */
export function slotLabel(key: string): string {
  const fixed: Record<string, string> = {
    "header.programTag": "Header: small program name (top right, capitals)",
    "header.packageLabel": "Header: package label above the title",
    "header.titleLine1": "Header: title, first line",
    "header.titleLine2": "Header: title, second line (highlighted)",
    "header.subtitle": "Header: one-sentence description",
    "price.label": "Price box: heading",
    "included.label": "What's included: small heading",
    "included.line1": "What's included: headline, first part",
    "included.line2": "What's included: headline, highlighted part",
    "steps.label": "How it works: heading",
    "plus.label": "Plus card: tag",
    "plus.title": "Plus card: title",
    "plus.description": "Plus card: description",
    "engage.line1": "Engagement card: heading, first part",
    "engage.line2": "Engagement card: heading, highlighted part",
    "engage.paragraph": "Engagement card: paragraph",
    disclaimer: "Disclaimer (small print at the bottom)",
  }
  if (fixed[key]) return fixed[key]
  let m
  if ((m = /^price\.(\d)\.amount$/.exec(key))) return `Price ${m[1]}: amount ($ + 1–4 digits, e.g. $36)`
  if ((m = /^price\.(\d)\.label$/.exec(key))) return `Price ${m[1]}: who it's for (e.g. Single)`
  if ((m = /^card(\d)\.title$/.exec(key))) return `Benefit card ${m[1]}: title`
  if ((m = /^card(\d)\.description$/.exec(key))) return `Benefit card ${m[1]}: description`
  if ((m = /^card(\d)\.bullet(\d)$/.exec(key))) return `Benefit card ${m[1]}: bullet ${m[2]}`
  if ((m = /^steps\.(\d)$/.exec(key))) return `How it works: step ${m[1]}`
  if ((m = /^engage\.bullet(\d)$/.exec(key))) return `Engagement card: bullet ${m[1]}`
  return key
}

const maxText = (s: SlotSpec) => (s.budget === "amount" ? "$ + 1–4 digits" : s.budget)

/** Sheet names for packages, in order: the layout, with " (n)" for repeats. */
export function sheetNames(packages: { layout: Layout }[]): string[] {
  const seen: Record<string, number> = {}
  return packages.map((p) => {
    const n = (seen[p.layout] = (seen[p.layout] ?? 0) + 1)
    return n === 1 ? p.layout : `${p.layout} (${n})`
  })
}

/**
 * The template workbook. Each sheet is prefilled with the package's current
 * draft values where it has them, else the same fake sample content as "Fill
 * with sample content". With no packages yet, one sheet per layout (the org
 * must add those packages before importing).
 */
export function buildTemplate(languages: ApLang[], packages: { layout: Layout; variants?: Partial<Record<ApLang, SlotValues>> }[]): Buffer {
  const list: { layout: Layout; variants?: Partial<Record<ApLang, SlotValues>> }[] = packages.length ? packages : LAYOUTS.map((layout) => ({ layout }))
  const names = sheetNames(list)
  const sheets: Sheet[] = list.map((p, i) => {
    const header: Cell[] = [HEADERS.key, HEADERS.label, HEADERS.max, ...languages.map((l) => HEADERS[l])].map((v) => ({ v, s: 1 as const }))
    const sample = Object.fromEntries(languages.map((l) => [l, sampleSlots(p.layout, l)])) as Record<ApLang, SlotValues>
    const rows = SLOTS[p.layout].map((slot) => [
      { v: slot.key, s: 2 as const },
      { v: slotLabel(slot.key), s: 2 as const },
      { v: maxText(slot), s: 2 as const },
      ...languages.map((l) => ({ v: p.variants?.[l]?.[slot.key] || sample[l][slot.key], s: 3 as const })),
    ])
    return { name: names[i], rows: [header, ...rows], widths: [22, 46, 16, ...languages.map(() => 60)] }
  })
  return writeXlsx(sheets)
}

export interface ImportProblem {
  sheet: string
  row: number | null
  key: string | null
  lang: ApLang | null
  error: string
}

type Located = { sheet: string; rows: Record<string, number> }

/**
 * Reads an .xlsx (or a .csv with a leading "Package" column naming the sheet)
 * into the org's draft packages. Returns every problem found, or the new
 * package list with each package's location in the file (for mapping later
 * fit problems back to sheet and row).
 */
export function parsePackageFile(
  file: { name: string; bytes: Buffer },
  languages: ApLang[],
  draft: ApPackage[],
): { ok: true; packages: ApPackage[]; where: Map<string, Located> } | { ok: false; problems: ImportProblem[] } {
  const problems: ImportProblem[] = []
  let sheets: { name: string; rows: { row: number; cells: string[] }[] }[]
  try {
    if (/\.csv$/i.test(file.name)) {
      const rows = readCsv(file.bytes.toString("utf8"))
      const head = rows[0]?.cells.map((c) => c.trim().toLowerCase()) ?? []
      const pi = head.indexOf(HEADERS.pkg.toLowerCase())
      if (pi < 0) return { ok: false, problems: [{ sheet: "CSV", row: 1, key: null, lang: null, error: `A CSV needs a "${HEADERS.pkg}" column naming the package (P1, P2, P3) on every row.` }] }
      const by = new Map<string, { row: number; cells: string[] }[]>()
      for (const r of rows.slice(1)) {
        if (r.cells.every((c) => !c.trim())) continue
        const name = (r.cells[pi] ?? "").trim()
        by.set(name, [...(by.get(name) ?? []), { row: r.row, cells: r.cells.filter((_, i) => i !== pi) }])
      }
      const header = { row: 1, cells: rows[0].cells.filter((_, i) => i !== pi) }
      sheets = [...by].map(([name, rs]) => ({ name, rows: [header, ...rs] }))
    } else {
      sheets = readXlsx(file.bytes)
    }
  } catch (err) {
    return { ok: false, problems: [{ sheet: file.name, row: null, key: null, lang: null, error: `Couldn't read the file: ${err instanceof Error ? err.message : err}. Use the downloaded template (.xlsx) or a .csv of the same columns.` }] }
  }

  const names = sheetNames(draft)
  const next = draft.map((p) => ({ ...p, variants: { ...p.variants } }))
  const where = new Map<string, Located>()
  const seenSheets = new Set<string>()

  for (const sh of sheets) {
    const name = sh.name.trim()
    const idx = names.indexOf(name)
    if (idx < 0) {
      problems.push({ sheet: name, row: null, key: null, lang: null, error: `"${name}" isn't a package this org has added (it has: ${names.join(", ") || "none"}). Add the package on the Packages page first.` })
      continue
    }
    if (seenSheets.has(name)) {
      problems.push({ sheet: name, row: null, key: null, lang: null, error: "This package appears twice in the file." })
      continue
    }
    seenSheets.add(name)
    const pkg = next[idx]
    const head = sh.rows[0]?.cells.map((c) => c.trim().toLowerCase()) ?? []
    const ki = head.indexOf(HEADERS.key.toLowerCase())
    const li: Partial<Record<ApLang, number>> = {}
    for (const l of ["en", "es"] as const) {
      const i = head.indexOf(HEADERS[l].toLowerCase())
      if (i >= 0) li[l] = i
    }
    if (ki < 0) {
      problems.push({ sheet: name, row: sh.rows[0]?.row ?? 1, key: null, lang: null, error: `No "${HEADERS.key}" column in the first row.` })
      continue
    }
    for (const l of languages) if (li[l] === undefined) problems.push({ sheet: name, row: sh.rows[0]?.row ?? 1, key: null, lang: l, error: `No "${HEADERS[l]}" column, but this org has ${HEADERS[l]} switched on.` })
    for (const l of ["en", "es"] as const) if (li[l] !== undefined && !languages.includes(l)) problems.push({ sheet: name, row: sh.rows[0]?.row ?? 1, key: null, lang: l, error: `This org doesn't have ${HEADERS[l]} switched on: remove the "${HEADERS[l]}" column.` })

    const known = new Set(SLOTS[pkg.layout].map((s) => s.key))
    const rowOf: Record<string, number> = {}
    const values: Partial<Record<ApLang, SlotValues>> = Object.fromEntries(languages.map((l) => [l, {}]))
    for (const r of sh.rows.slice(1)) {
      const key = (r.cells[ki] ?? "").trim()
      if (!key && r.cells.every((c) => !c.trim())) continue
      if (!known.has(key)) {
        problems.push({ sheet: name, row: r.row, key: key || null, lang: null, error: key ? `"${key}" isn't a slot of a ${pkg.layout} package.` : "A row with no slot key." })
        continue
      }
      if (rowOf[key]) {
        problems.push({ sheet: name, row: r.row, key, lang: null, error: `Slot "${key}" appears twice (also row ${rowOf[key]}).` })
        continue
      }
      rowOf[key] = r.row
      for (const l of languages) if (li[l] !== undefined) values[l]![key] = (r.cells[li[l]!] ?? "").trim()
    }
    for (const k of known) if (!rowOf[k]) problems.push({ sheet: name, row: null, key: k, lang: null, error: `Slot "${k}" is missing: every slot of a ${pkg.layout} package is required.` })
    pkg.variants = values
    where.set(pkg.id, { sheet: name, rows: rowOf })
  }
  if (sheets.length === 0) problems.push({ sheet: file.name, row: null, key: null, lang: null, error: "The file has no packages in it." })
  if (problems.length) return { ok: false, problems }

  // Exactly the manual-save checks: budgets, required, prices, Basic Benefits text.
  const checked = checkPackages(next, languages)
  if (!checked.ok) {
    return {
      ok: false,
      problems: checked.errors.map((e) => {
        const m = /^packages\[(\d+)\]\.(?:variants\.(en|es)\.)?(.+)$/.exec(e.path)
        const pkg = m ? next[Number(m[1])] : null
        const loc = pkg ? where.get(pkg.id) : null
        const key = m?.[3] ?? null
        return { sheet: loc?.sheet ?? names[Number(m?.[1] ?? 0)] ?? "?", row: key && loc ? loc.rows[key] ?? null : null, key, lang: (m?.[2] as ApLang) ?? null, error: e.error }
      }),
    }
  }
  return { ok: true, packages: checked.value, where }
}

export function describeProblem(p: ImportProblem): string {
  return `${p.sheet}${p.row ? ` row ${p.row}` : ""}${p.key ? ` (${p.key}${p.lang ? `, ${p.lang === "en" ? "English" : "Spanish"}` : ""})` : p.lang ? ` (${p.lang === "en" ? "English" : "Spanish"})` : ""}: ${p.error}`
}
