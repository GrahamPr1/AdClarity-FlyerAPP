/**
 * Rebuilds a stored template Instagram square through the CURRENT template,
 * from the text and photo it carries — used to put a production square's
 * before and after side by side in the stress grid.
 *
 *   npx tsx scripts/lib/rebuild-ig-square.ts <stored.html> <out.html>
 */
import fs from "node:fs"
import { fillTemplate, templateById } from "../../lib/agent-pipeline/template-mode"
import { injectPhotoAttribution } from "../../lib/agent-pipeline/flyer-html"

const [src, out] = process.argv.slice(2)
const html = fs.readFileSync(src, "utf8")
const unescape = (v: string) => v.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&")
const field = (name: string) => unescape(html.match(new RegExp(`<span data-field="${name}"[^>]*>([\\s\\S]*?)</span>`))?.[1] ?? "")
const photo = unescape(html.match(/<img class="photo" src="([^"]+)"/)?.[1] ?? "")
const credit = html.match(/Photo by <a href="([^"?]+)[^"]*"[^>]*>([^<]+)<\/a>/)
const business = unescape(html.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? "")
const colors = { primary: html.match(/--brand-primary:([^;}]+)/)?.[1] ?? "#12314f", secondary: html.match(/--brand-secondary:([^;}]+)/)?.[1] ?? "#eef1f4", accent: html.match(/--brand-accent:([^;}]+)/)?.[1] ?? "#e39a2b" }
const fonts = { heading: html.match(/--font-heading:([^;}]+)/)?.[1] ?? "Georgia, serif", body: html.match(/--font-body:([^;}]+)/)?.[1] ?? "Georgia, serif" }
let rebuilt = fillTemplate({
  template: templateById("social-square")!,
  headline: field("headline"),
  supporting: field("supporting"),
  businessName: business,
  phone: field("phone"),
  address: field("address") || null,
  hasLogo: false,
  hasQr: false,
  photoUrl: photo || null,
  colors,
  fonts,
}).html
if (photo && credit) rebuilt = injectPhotoAttribution(rebuilt, [{ url: photo, photographerName: unescape(credit[2]), photographerUrl: credit[1] }], "screen")
fs.writeFileSync(out, rebuilt)
console.log(`rebuilt: headline "${field("headline")}", photo ${photo ? "kept" : "none"}, colours ${JSON.stringify(colors)}`)
