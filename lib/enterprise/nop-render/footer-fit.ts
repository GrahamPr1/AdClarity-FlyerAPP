// Will an agent's name, or the enrollment link for a given domain, fit the
// kit-v2 footer? An estimate for flagging early (roster import, profile
// changes, the enrollment domain setting) without a browser. The download's
// release check (render-v2.ts) measures the real page and stays the authority.
//
// The tables are each character's advance in the footer's styles, measured in
// the real renderer with the kit's Poppins: the name (SemiBold 14px,
// letter-spacing .3px) and the link (Bold 15px). Summing them matches the
// rendered width to within 0.1px. A character not in a table counts as that
// table's widest. Re-measure if agent-area.ts changes either style.

/** The space beside the QR (release-check rule: 8px clear on both sides), in CSS px. */
export const FOOTER_SPACE_PX = 357.28
/** Flag anything within 2px of the limit. */
const FLAG_PX = FOOTER_SPACE_PX - 2

const NAME_WIDTHS: Record<string, number> = { " ": 3.632, "!": 5.256, "\"": 5.396, "#": 12.718, "$": 9.456, "%": 11.906, "&": 11.192, "'": 3.03, "(": 7.09, ")": 7.09, "*": 7.552, "+": 9.736, ",": 3.856, "-": 8.462, ".": 3.94, "/": 7.104, "0": 9.344, "1": 5.368, "2": 8.336, "3": 8.686, "4": 9.554, "5": 9.316, "6": 9.26, "7": 7.972, "8": 9.302, "9": 9.064, ":": 3.982, ";": 4.836, "<": 8.476, "=": 10.632, ">": 8.238, "?": 7.832, "@": 15.014, "A": 10.324, "B": 9.302, "C": 11.052, "D": 10.338, "E": 7.748, "F": 7.72, "G": 11.052, "H": 10.338, "I": 4.192, "J": 8.28, "K": 9.582, "L": 6.726, "M": 12.886, "N": 10.59, "O": 11.29, "P": 8.812, "Q": 11.318, "R": 9.274, "S": 8.826, "T": 8.378, "U": 10.058, "V": 10.254, "W": 14.636, "X": 9.904, "Y": 9.204, "Z": 8.364, "[": 7.258, "\\": 10.884, "]": 7.244, "^": 9.82, "_": 11.36, "`": 4.094, "a": 9.792, "b": 9.792, "c": 8.728, "d": 9.792, "e": 8.938, "f": 5.13, "g": 9.792, "h": 9.554, "i": 4.192, "j": 4.192, "k": 8.476, "l": 4.192, "m": 14.972, "n": 9.554, "o": 9.232, "p": 9.792, "q": 9.792, "r": 5.956, "s": 7.93, "t": 5.732, "u": 9.554, "v": 8.686, "w": 12.116, "x": 7.86, "y": 8.77, "z": 7.062, "{": 7.412, "|": 4.626, "}": 7.412, "~": 8.588, "À": 10.324, "Á": 10.324, "Â": 10.324, "Ã": 10.324, "Ä": 10.324, "Å": 10.324, "Æ": 13.418, "Ç": 11.052, "È": 7.748, "É": 7.748, "Ê": 7.748, "Ë": 7.748, "Ì": 4.192, "Í": 4.192, "Î": 4.192, "Ï": 4.192, "Ð": 10.464, "Ñ": 10.59, "Ò": 11.29, "Ó": 11.29, "Ô": 11.29, "Õ": 11.29, "Ö": 11.29, "Ø": 11.29, "Ù": 10.058, "Ú": 10.058, "Û": 10.058, "Ü": 10.058, "Ý": 9.204, "Þ": 8.812, "ß": 10.478, "à": 9.792, "á": 9.792, "â": 9.792, "ã": 9.792, "ä": 9.792, "å": 9.792, "æ": 15.378, "ç": 8.728, "è": 8.938, "é": 8.938, "ê": 8.938, "ë": 8.938, "ì": 4.36, "í": 4.36, "î": 4.36, "ï": 4.36, "ð": 9.232, "ñ": 9.554, "ò": 9.232, "ó": 9.232, "ô": 9.232, "õ": 9.232, "ö": 9.232, "ø": 9.176, "ù": 9.554, "ú": 9.554, "û": 9.554, "ü": 9.554, "ý": 8.77, "þ": 9.792, "ÿ": 8.77, "–": 10.128, "—": 13.278, "‘": 4.15, "’": 4.15 }
const LINK_WIDTHS: Record<string, number> = { "-": 8.7, ".": 4.23, "/": 6.795, "0": 9.78, "1": 5.64, "2": 8.565, "3": 9.075, "4": 10.155, "5": 9.75, "6": 9.555, "7": 8.025, "8": 9.72, "9": 9.225, "a": 10.185, "b": 10.185, "c": 9.075, "d": 10.185, "e": 9.24, "f": 5.4, "g": 10.185, "h": 10.11, "i": 4.425, "j": 4.41, "k": 9.27, "l": 4.425, "m": 15.885, "n": 10.11, "o": 9.555, "p": 10.185, "q": 10.185, "r": 6.42, "s": 8.37, "t": 6.09, "u": 10.11, "v": 9.39, "w": 12.99, "x": 8.82, "y": 9.48, "z": 7.44 }

function width(text: string, table: Record<string, number>): number {
  const widest = Math.max(...Object.values(table))
  let w = 0
  for (const ch of text) w += table[ch] ?? widest
  return Math.round(w * 10) / 10
}

export function footerNameWidth(name: string): number {
  return width(name.trim().replace(/\s+/g, " "), NAME_WIDTHS)
}

/** False when the name may not fit beside the QR on a kit-v2 flyer. */
export function nameFitsKitV2Footer(name: string): boolean {
  return footerNameWidth(name) <= FLAG_PX
}

/** The printed link for the longest possible Agent ID (10 of the widest digit), as the footer prints it. */
export function footerLinkWorstWidth(domain: string): number {
  const digit = Object.entries(LINK_WIDTHS).filter(([c]) => /\d/.test(c)).sort((a, b) => b[1] - a[1])[0][0]
  return width(`${domain}/${digit.repeat(10)}`, LINK_WIDTHS)
}

export function linkFitsKitV2Footer(domain: string): boolean {
  return footerLinkWorstWidth(domain) <= FLAG_PX
}
