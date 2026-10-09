import fs from "node:fs"
import path from "node:path"

// Read-only access to Basic Benefits' NOP kit. Nothing here edits a master:
// the HTML, fonts and images are read from disk as shipped, and every value
// the renderer injects comes from content.json — nothing is hardcoded.
//
// Read at call time rather than imported, so a price change in
// content.json takes effect without a rebuild. The files are traced into
// the serverless bundle by outputFileTracingIncludes in next.config.ts.

export const KIT_DIR = path.join(process.cwd(), "enterprise", "nop", "kit-v1.1.1")

import { NOP_TEMPLATES, type NopTemplateId } from "./templates"
export { NOP_TEMPLATES, type NopTemplateId }

export function isNopTemplate(v: string): v is NopTemplateId {
  return (NOP_TEMPLATES as readonly string[]).includes(v)
}

/** "P2" / "ALL" and "EN" / "ES" from "NOP_P2_ES". */
export function templateParts(id: NopTemplateId): { pkg: "P1" | "P2" | "P3" | "ALL"; lang: "EN" | "ES" } {
  const [, pkg, lang] = id.split("_") as [string, "P1" | "P2" | "P3" | "ALL", "EN" | "ES"]
  return { pkg, lang }
}

export interface KitContent {
  program: { name: string; kit_version: string; effective_date: string }
  enroll_domain: string
  default_logo: string
  version_stamp_format: string
  prices: Record<string, Record<string, string>>
  template_price_fields: Record<string, Record<string, string>>
}

export function readKitContent(): KitContent {
  return JSON.parse(fs.readFileSync(path.join(KIT_DIR, "content.json"), "utf8")) as KitContent
}

export function readMasterHtml(id: NopTemplateId): string {
  return fs.readFileSync(path.join(KIT_DIR, "html", `${id}.html`), "utf8")
}

/** The kit's own file as base64, e.g. "fonts/Poppins-Bold.ttf". */
export function readKitFileBase64(rel: string): string {
  return fs.readFileSync(path.join(KIT_DIR, rel)).toString("base64")
}

export function readThumbnail(id: NopTemplateId): Buffer {
  return fs.readFileSync(path.join(KIT_DIR, "digital", `${id}_Digital.png`))
}

/** "https://neighbor.basicbenefits.com/858980". The QR target and the printed URL's domain. */
export function enrollUrl(content: KitContent, agentId: string): string {
  return `https://${content.enroll_domain.replace(/\/+$/, "")}/${agentId}`
}

/** Every price field the template has, resolved through template_price_fields. */
export function priceValues(content: KitContent, id: NopTemplateId): Record<string, string> {
  const map = content.template_price_fields[id]
  if (!map) throw new Error(`content.json has no template_price_fields for ${id}`)
  const out: Record<string, string> = {}
  for (const [field, ref] of Object.entries(map)) {
    const [pkg, kind] = ref.split(".")
    const value = content.prices[pkg]?.[kind]
    if (!value) throw new Error(`content.json price ${ref} (for ${id}.${field}) is missing`)
    out[field] = value
  }
  return out
}

/**
 * "NOP-P2-ES v1.1.1 10/2026" from version_stamp_format. The month and year
 * are the kit's effective_date, not the render date: the stamp identifies
 * the approved artwork version, and stays the same however often it prints.
 */
export function versionStamp(content: KitContent, id: NopTemplateId): string {
  const { pkg, lang } = templateParts(id)
  const [yyyy, mm] = content.program.effective_date.split("-")
  return content.version_stamp_format
    .replace("{template}", pkg)
    .replace("{lang}", lang)
    .replace("{MM}", mm)
    .replace("{YYYY}", yyyy)
}
