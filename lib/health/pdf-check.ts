// Light structural checks on a PDF the health check downloaded: a real PDF,
// page count, the first page's size, and that every font is embedded. Not a
// PDF parser — just enough of Chromium/Skia's (uncompressed) object syntax
// to catch the failures that matter: an error page instead of a PDF, a blank
// or missing page, a font that silently fell back unembedded.

export interface PdfFacts {
  isPdf: boolean
  pages: number
  /** First page MediaBox width x height in points, e.g. "630x810". */
  size: string | null
  fonts: number
  /** Font objects with no embedded font program (Type 3 fonts carry their glyphs inline, so they count as embedded). */
  unembeddedFonts: string[]
}

export function inspectPdf(buf: Buffer): PdfFacts {
  const text = buf.toString("latin1")
  const isPdf = text.startsWith("%PDF-")
  const pages = (text.match(/\/Type\s*\/Page(?![s\w])/g) ?? []).length
  const box = /\/MediaBox\s*\[\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\]/.exec(text)
  const size = box ? `${Math.round(Number(box[3]) - Number(box[1]))}x${Math.round(Number(box[4]) - Number(box[2]))}` : null
  // Objects without their stream bodies (font programs are binary).
  const objects = new Map<string, string>()
  for (const m of text.matchAll(/(\d+)\s+0\s+obj\b([\s\S]*?)(?:\bstream\r?\n[\s\S]*?\bendstream|)\s*endobj/g)) objects.set(m[1], m[2])
  const unembeddedFonts: string[] = []
  let fonts = 0
  for (const body of objects.values()) {
    if (!/\/Type\s*\/Font(?![\w])/.test(body)) continue
    fonts++
    const subtype = /\/Subtype\s*\/(\w+)/.exec(body)?.[1]
    // Type0 is a wrapper (its CID descendant is checked as its own font object); Type3 glyphs are drawn inline.
    if (subtype === "Type0" || subtype === "Type3") continue
    const name = /\/BaseFont\s*\/([^\s/<>[\]]+)/.exec(body)?.[1] ?? "(unnamed)"
    const ref = /\/FontDescriptor\s+(\d+)\s+0\s+R/.exec(body)?.[1]
    const descriptor = ref ? objects.get(ref) : undefined
    if (!descriptor || !/\/FontFile[23]?\s/.test(descriptor)) unembeddedFonts.push(name)
  }
  return { isPdf, pages, size, fonts, unembeddedFonts }
}
