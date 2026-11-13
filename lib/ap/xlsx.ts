import { crc32, deflateRawSync, inflateRawSync } from "node:zlib"

// A minimal .xlsx writer and reader for the platform's package files, on
// Node's own zlib: no spreadsheet dependency (package.json stays untouched).
// Writes inline-string cells with three styles (header, locked, editable) and
// sheet protection, so the slot-key column can't be edited in Excel. Reads
// what it writes and what Excel or Google Sheets save back (shared strings,
// rich text runs, inline strings, numbers).

export interface Cell {
  v: string | number
  /** 1 header (bold, grey, locked), 2 locked (grey), 3 editable (unlocked). */
  s: 1 | 2 | 3
}
export interface Sheet {
  name: string
  rows: Cell[][]
  /** Column widths in characters. */
  widths: number[]
}

const xml = (v: string) => v.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "")
const col = (i: number) => {
  let s = ""
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s
  return s
}

function sheetXml(sh: Sheet): string {
  const rows = sh.rows
    .map((r, ri) => `<row r="${ri + 1}">${r.map((c, ci) => {
      const ref = `${col(ci)}${ri + 1}`
      return typeof c.v === "number" ? `<c r="${ref}" s="${c.s}"><v>${c.v}</v></c>` : `<c r="${ref}" s="${c.s}" t="inlineStr"><is><t xml:space="preserve">${xml(c.v)}</t></is></c>`
    }).join("")}</row>`)
    .join("")
  const cols = sh.widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join("")
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${cols}</cols><sheetData>${rows}</sheetData><sheetProtection sheet="1" objects="1" scenarios="1" formatColumns="0" formatRows="0"/></worksheet>`
}

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE5E7EB"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyProtection="1"><protection locked="1"/></xf><xf numFmtId="0" fontId="0" fillId="2" borderId="0" xfId="0" applyFill="1" applyAlignment="1" applyProtection="1"><alignment wrapText="1" vertical="top"/><protection locked="1"/></xf><xf numFmtId="49" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyAlignment="1" applyProtection="1"><alignment wrapText="1" vertical="top"/><protection locked="0"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`

export function writeXlsx(sheets: Sheet[]): Buffer {
  const files: [string, string][] = [
    ["[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}</Types>`],
    ["_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
    ["xl/workbook.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((s, i) => `<sheet name="${xml(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets></workbook>`],
    ["xl/_rels/workbook.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`],
    ["xl/styles.xml", STYLES],
    ...sheets.map((s, i) => [`xl/worksheets/sheet${i + 1}.xml`, sheetXml(s)] as [string, string]),
  ]
  return writeZip(files.map(([n, c]) => [n, Buffer.from(c, "utf8")]))
}

// ---- zip ----

export function writeZip(entries: [string, Buffer][]): Buffer {
  const locals: Buffer[] = []
  const centrals: Buffer[] = []
  let offset = 0
  for (const [name, data] of entries) {
    const nameBuf = Buffer.from(name, "utf8")
    const comp = deflateRawSync(data)
    const crc = crc32(data)
    const lh = Buffer.alloc(30)
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0x0800, 6); lh.writeUInt16LE(8, 8)
    lh.writeUInt16LE(0, 10); lh.writeUInt16LE(0x21, 12) // fixed date: 1980-01-01, so a file is byte-stable
    lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(comp.length, 18); lh.writeUInt32LE(data.length, 22); lh.writeUInt16LE(nameBuf.length, 26); lh.writeUInt16LE(0, 28)
    locals.push(lh, nameBuf, comp)
    const ch = Buffer.alloc(46)
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0x0800, 8); ch.writeUInt16LE(8, 10)
    ch.writeUInt16LE(0, 12); ch.writeUInt16LE(0x21, 14); ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(comp.length, 20); ch.writeUInt32LE(data.length, 24)
    ch.writeUInt16LE(nameBuf.length, 28); ch.writeUInt32LE(offset, 42)
    centrals.push(ch, nameBuf)
    offset += 30 + nameBuf.length + comp.length
  }
  const cd = Buffer.concat(centrals)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16)
  return Buffer.concat([...locals, cd, end])
}

const MAX_UNZIPPED = 20 * 1024 * 1024

export function unzip(buf: Buffer): Map<string, Buffer> {
  let eocd = -1
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65_557); i--) if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break }
  if (eocd < 0) throw new Error("not a zip file")
  const count = buf.readUInt16LE(eocd + 10)
  let p = buf.readUInt32LE(eocd + 16)
  const out = new Map<string, Buffer>()
  let total = 0
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error("bad zip directory")
    const method = buf.readUInt16LE(p + 10)
    const compSize = buf.readUInt32LE(p + 20)
    const size = buf.readUInt32LE(p + 24)
    const nameLen = buf.readUInt16LE(p + 28)
    const extraLen = buf.readUInt16LE(p + 30)
    const commentLen = buf.readUInt16LE(p + 32)
    const local = buf.readUInt32LE(p + 42)
    const name = buf.subarray(p + 46, p + 46 + nameLen).toString("utf8")
    p += 46 + nameLen + extraLen + commentLen
    total += size
    if (total > MAX_UNZIPPED) throw new Error("file too large when unpacked")
    if (buf.readUInt32LE(local) !== 0x04034b50) throw new Error("bad zip entry")
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28)
    const data = buf.subarray(start, start + compSize)
    if (method === 0) out.set(name, Buffer.from(data))
    else if (method === 8) out.set(name, inflateRawSync(data, { maxOutputLength: MAX_UNZIPPED }))
    else throw new Error(`unsupported zip compression ${method}`)
  }
  return out
}

// ---- reading sheets ----

const unxml = (s: string) => s.replace(/&(lt|gt|quot|apos|amp|#\d+|#x[0-9a-f]+);/gi, (_m, e: string) => (e === "lt" ? "<" : e === "gt" ? ">" : e === "quot" ? '"' : e === "apos" ? "'" : e === "amp" ? "&" : String.fromCodePoint(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10))))
const texts = (s: string) => [...s.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>|<t(?:\s[^>]*)?\/>/g)].map((m) => unxml(m[1] ?? "")).join("")
const colIndex = (ref: string) => [...ref.replace(/\d+$/, "")].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1

/** Every sheet as rows of cell strings (1-based row numbers kept), in workbook order. */
export function readXlsx(buf: Buffer): { name: string; rows: { row: number; cells: string[] }[] }[] {
  const files = unzip(buf)
  const get = (n: string) => files.get(n)?.toString("utf8") ?? null
  const wb = get("xl/workbook.xml")
  const rels = get("xl/_rels/workbook.xml.rels")
  if (!wb || !rels) throw new Error("not an Excel workbook")
  const shared = [...(get("xl/sharedStrings.xml") ?? "").matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => texts(m[1]))
  const target = new Map([...rels.matchAll(/<Relationship\b[^>]*>/g)].map((m) => [/Id="([^"]+)"/.exec(m[0])?.[1], /Target="([^"]+)"/.exec(m[0])?.[1]]))
  return [...wb.matchAll(/<sheet\b[^>]*>/g)].map((m) => {
    const name = unxml(/name="([^"]*)"/.exec(m[0])?.[1] ?? "")
    const rid = /r:id="([^"]+)"/.exec(m[0])?.[1]
    const t = (target.get(rid) ?? "").replace(/^\/?xl\//, "").replace(/^\//, "")
    const sheet = get(`xl/${t}`) ?? ""
    const rows = [...sheet.matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>/g)].map((r) => {
      const row = Number(/\br="(\d+)"/.exec(r[1])?.[1] ?? 0)
      const cells: string[] = []
      for (const c of r[2].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const ref = /\br="([A-Z]+\d+)"/.exec(c[1])?.[1]
        const type = /\bt="([^"]+)"/.exec(c[1])?.[1]
        const body = c[2] ?? ""
        const v = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1]
        const value = type === "s" ? shared[Number(v)] ?? "" : type === "inlineStr" ? texts(body) : unxml(v ?? "")
        cells[ref ? colIndex(ref) : cells.length] = value
      }
      return { row, cells: Array.from(cells, (x) => x ?? "") }
    })
    return { name, rows }
  })
}

/** RFC 4180 CSV: quoted fields, doubled quotes, commas and newlines inside quotes, CRLF, a leading BOM. */
export function readCsv(text: string): { row: number; cells: string[] }[] {
  const rows: { row: number; cells: string[] }[] = []
  let row: string[] = [], field = "", quoted = false, n = 1
  const src = text.replace(/^﻿/, "")
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') { field += '"'; i++ } else quoted = false
      } else field += ch
    } else if (ch === '"') quoted = true
    else if (ch === ",") { row.push(field); field = "" }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++
      row.push(field); rows.push({ row: n++, cells: row }); row = []; field = ""
    } else field += ch
  }
  if (field || row.length) { row.push(field); rows.push({ row: n, cells: row }) }
  return rows
}
