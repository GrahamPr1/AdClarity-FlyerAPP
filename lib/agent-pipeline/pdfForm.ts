import { PDFDocument, PDFTextField, PDFCheckBox, PDFRadioGroup, PDFDropdown, PDFOptionList } from "pdf-lib"
import type { FormField } from "./schemas/formFill"

/** Reads the REAL fillable field names/types/options out of a PDF's actual AcroForm structure — never guessed. */
export async function extractFormFields(pdfBytes: Uint8Array): Promise<FormField[]> {
  const pdfDoc = await PDFDocument.load(pdfBytes)
  const fields = pdfDoc.getForm().getFields()

  return fields.map((field): FormField => {
    const name = field.getName()
    if (field instanceof PDFTextField) return { name, type: "text", options: null }
    if (field instanceof PDFCheckBox) return { name, type: "checkbox", options: ["Yes", "No"] }
    if (field instanceof PDFRadioGroup) return { name, type: "radio", options: field.getOptions() }
    if (field instanceof PDFDropdown) return { name, type: "dropdown", options: field.getOptions() }
    if (field instanceof PDFOptionList) return { name, type: "dropdown", options: field.getOptions() }
    return { name, type: "other", options: null }
  })
}

/**
 * Writes agent-determined values into the real PDF form fields and returns
 * the completed PDF bytes. Deliberately does NOT flatten the form — it
 * stays a genuinely editable PDF, so if any value needs a quick correction
 * before printing/signing/submitting, the client can still fix it in any
 * PDF reader rather than being stuck with permanently burned-in text.
 *
 * Silently skips (never throws on) a field name the agent returned that
 * doesn't actually exist on the form, or a choice value that isn't one of
 * that field's real options — a single bad value shouldn't fail the whole
 * document when everything else filled correctly.
 */
export async function fillFormFields(pdfBytes: Uint8Array, values: { name: string; value: string }[]): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(pdfBytes)
  const form = pdfDoc.getForm()

  for (const { name, value } of values) {
    let field
    try {
      field = form.getField(name)
    } catch {
      continue
    }

    if (field instanceof PDFTextField) {
      field.setText(value)
    } else if (field instanceof PDFCheckBox) {
      if (/^(yes|true|checked|x)$/i.test(value)) field.check()
      else field.uncheck()
    } else if (field instanceof PDFRadioGroup || field instanceof PDFDropdown || field instanceof PDFOptionList) {
      try {
        field.select(value)
      } catch {
        // value wasn't one of this field's real options — leave it unset
      }
    }
  }

  return pdfDoc.save()
}
