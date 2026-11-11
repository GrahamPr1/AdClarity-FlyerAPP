// "Save my contact" on an agent's personal page: a vCard 3.0 with the agent's
// name, phone, email and page link (and the photo, only while the org's photo
// switch is on). Pure: the route supplies the values. Text is escaped and
// long lines folded, as the format requires, so phones read it reliably.

export interface VCardInput {
  name: string
  phone: string
  email: string
  pageUrl: string
  org: string
  photo?: { base64: string; type: "JPEG" | "PNG" } | null
}

const esc = (v: string) => v.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;")

/** Folds a content line at 75 characters, continuation lines starting with a space (RFC 6350 / 2426). */
function fold(line: string): string {
  if (line.length <= 75) return line
  const parts = [line.slice(0, 75)]
  for (let i = 75; i < line.length; i += 74) parts.push(" " + line.slice(i, i + 74))
  return parts.join("\r\n")
}

export function buildVCard(v: VCardInput): string {
  const words = v.name.trim().split(/\s+/)
  const family = words.length > 1 ? words[words.length - 1] : ""
  const given = words.length > 1 ? words.slice(0, -1).join(" ") : words[0] ?? ""
  const tel = v.phone.replace(/[^0-9+]/g, "")
  const lines = [
    "BEGIN:VCARD",
    "VERSION:3.0",
    `N:${esc(family)};${esc(given)};;;`,
    `FN:${esc(v.name.trim())}`,
    ...(v.org ? [`ORG:${esc(v.org)}`] : []),
    ...(tel ? [`TEL;TYPE=CELL,VOICE:${esc(tel)}`] : []),
    ...(v.email ? [`EMAIL;TYPE=INTERNET:${esc(v.email)}`] : []),
    `URL:${esc(v.pageUrl)}`,
    ...(v.photo ? [`PHOTO;ENCODING=b;TYPE=${v.photo.type}:${v.photo.base64}`] : []),
    "END:VCARD",
  ]
  return lines.map(fold).join("\r\n") + "\r\n"
}

/** A safe file name from the agent's name: "Pat Lee" -> "Pat-Lee.vcf". */
export function vcardFileName(name: string): string {
  const base = name.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, "")
  return `${base || "contact"}.vcf`
}
