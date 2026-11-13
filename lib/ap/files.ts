// Upload rules for org files. Pure: checks bytes, not the declared type.
//
// Logo: PNG or JPEG, at most 1 MB (the logo slot's box and minimum pixel size
// are part of the pending slot design). Reference files: PDF, PNG or JPEG,
// at most 4 MB (a Vercel Function request body tops out at 4.5 MB). SVG is
// refused: it can carry script.

export const LOGO_MAX_BYTES = 1024 * 1024
export const REFERENCE_MAX_BYTES = 4 * 1024 * 1024

export type SniffedType = "image/png" | "image/jpeg" | "application/pdf"

export function sniff(bytes: Uint8Array): SniffedType | null {
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) return "image/png"
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg"
  if (bytes.length >= 5 && String.fromCharCode(...bytes.slice(0, 5)) === "%PDF-") return "application/pdf"
  return null
}

export const EXT: Record<SniffedType, string> = { "image/png": "png", "image/jpeg": "jpg", "application/pdf": "pdf" }

export function checkUpload(kind: "logo" | "reference", bytes: Uint8Array): { ok: true; type: SniffedType } | { ok: false; error: string } {
  const type = sniff(bytes)
  const max = kind === "logo" ? LOGO_MAX_BYTES : REFERENCE_MAX_BYTES
  if (bytes.length === 0) return { ok: false, error: "The file is empty." }
  if (bytes.length > max) return { ok: false, error: `At most ${max / 1024 / 1024} MB.` }
  if (!type) return { ok: false, error: kind === "logo" ? "Logo must be PNG or JPEG." : "Reference files must be PDF, PNG or JPEG." }
  if (kind === "logo" && type === "application/pdf") return { ok: false, error: "Logo must be PNG or JPEG." }
  return { ok: true, type }
}

/** A display name: no path, no control characters, at most 120 characters. */
export function safeFileName(name: string): string {
  return (name.split(/[\\/]/).pop() ?? "file").replace(/[\u0000-\u001f\u007f"]/g, "").trim().slice(0, 120) || "file"
}
