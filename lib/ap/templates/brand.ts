// Text that must never appear on a non-NOP org's flyer: Basic Benefits' and
// NOP's names, domains and product names from the copied kit. Pure, so the
// content check (every save and every import) and the renderer's final page
// check share one list.

export const BANNED: RegExp[] = [/basic\s*benefits/i, /basicbenefits/i, /bb-logo/i, /\bNOP-P\d/, /\bNOP\b/, /benefithub/i, /healthyr/i, /neighborhood\s+outreach/i]

/** The first banned phrase in `text`, or null. */
export function foreignBrandIn(text: string): string | null {
  for (const re of BANNED) {
    const m = re.exec(text)
    if (m) return m[0]
  }
  return null
}
