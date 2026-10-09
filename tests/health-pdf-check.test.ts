import { describe, it, expect } from "vitest"
import { inspectPdf } from "@/lib/health/pdf-check"

const pdf = (fonts: string, media = "0 0 630 810") => Buffer.from(`%PDF-1.4
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj
3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [${media}] >> endobj
${fonts}
%%EOF`, "latin1")

describe("health-check PDF facts", () => {
  it("read pages and size", () => {
    expect(inspectPdf(pdf(""))).toMatchObject({ isPdf: true, pages: 1, size: "630x810", fonts: 0, unembeddedFonts: [] })
  })
  it("flag a font with no embedded program (e.g. a standard-14 fallback)", () => {
    expect(inspectPdf(pdf("4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj")).unembeddedFonts).toEqual(["Helvetica"])
    const noFile = "4 0 obj << /Type /Font /Subtype /TrueType /BaseFont /Arial /FontDescriptor 5 0 R >> endobj\n5 0 obj << /Type /FontDescriptor /FontName /Arial >> endobj"
    expect(inspectPdf(pdf(noFile)).unembeddedFonts).toEqual(["Arial"])
  })
  it("accept embedded TrueType/CID fonts and Type 3 fonts", () => {
    const ok = [
      "4 0 obj << /Type /Font /Subtype /Type0 /BaseFont /AAAAAA+Poppins-Bold /DescendantFonts [6 0 R] >> endobj",
      "6 0 obj << /Type /Font /Subtype /CIDFontType2 /BaseFont /AAAAAA+Poppins-Bold /FontDescriptor 7 0 R >> endobj",
      "7 0 obj << /Type /FontDescriptor /FontName /AAAAAA+Poppins-Bold /FontFile2 8 0 R >> endobj",
      "9 0 obj << /Type /Font /Subtype /Type3 /FontDescriptor 10 0 R >> endobj",
      "10 0 obj << /Type /FontDescriptor /FontName /CAAAAA+Inter-Regular >> endobj",
    ].join("\n")
    expect(inspectPdf(pdf(ok))).toMatchObject({ fonts: 3, unembeddedFonts: [] })
  })
  it("recognise an error page as not a PDF", () => {
    expect(inspectPdf(Buffer.from('{"error":"render_failed"}')).isPdf).toBe(false)
  })
})
