// Will an agent's name, or the enrollment link for a given domain, fit the
// kit-v2 footer? An estimate for flagging early (roster import, profile
// changes, the enrollment domain setting) without a browser. The download's
// release check (render-v2.ts) measures the real page and stays the authority.
//
// The tables are each character's advance in the footer's styles, measured in
// the real renderer with the kit's Poppins: the name (SemiBold 14px,
// letter-spacing .3px) and the link (Bold 15px; capitals, "?", "_", "=",
// "&", "%" and ":" measured 11/2026 for Agent IDs and full URLs). Summing them matches the
// rendered width to within 0.1px. A character not in a table counts as that
// table's widest. Re-measure if agent-area.ts changes either style.

/**
 * The space beside the QR (release-check rule: 8px clear on both sides), in
 * CSS px, with the footer's 32px side padding and the 8px gap to the QR
 * (11/2026). Measured on all four footers (English and Spanish are the same).
 */
export const FOOTER_SPACE_PX = 389.28
/** Flag anything within 2px of the limit. */
const FLAG_PX = FOOTER_SPACE_PX - 2

const NAME_WIDTHS: Record<string, number> = { " ": 3.632, "!": 5.256, "\"": 5.396, "#": 12.718, "$": 9.456, "%": 11.906, "&": 11.192, "'": 3.03, "(": 7.09, ")": 7.09, "*": 7.552, "+": 9.736, ",": 3.856, "-": 8.462, ".": 3.94, "/": 7.104, "0": 9.344, "1": 5.368, "2": 8.336, "3": 8.686, "4": 9.554, "5": 9.316, "6": 9.26, "7": 7.972, "8": 9.302, "9": 9.064, ":": 3.982, ";": 4.836, "<": 8.476, "=": 10.632, ">": 8.238, "?": 7.832, "@": 15.014, "A": 10.324, "B": 9.302, "C": 11.052, "D": 10.338, "E": 7.748, "F": 7.72, "G": 11.052, "H": 10.338, "I": 4.192, "J": 8.28, "K": 9.582, "L": 6.726, "M": 12.886, "N": 10.59, "O": 11.29, "P": 8.812, "Q": 11.318, "R": 9.274, "S": 8.826, "T": 8.378, "U": 10.058, "V": 10.254, "W": 14.636, "X": 9.904, "Y": 9.204, "Z": 8.364, "[": 7.258, "\\": 10.884, "]": 7.244, "^": 9.82, "_": 11.36, "`": 4.094, "a": 9.792, "b": 9.792, "c": 8.728, "d": 9.792, "e": 8.938, "f": 5.13, "g": 9.792, "h": 9.554, "i": 4.192, "j": 4.192, "k": 8.476, "l": 4.192, "m": 14.972, "n": 9.554, "o": 9.232, "p": 9.792, "q": 9.792, "r": 5.956, "s": 7.93, "t": 5.732, "u": 9.554, "v": 8.686, "w": 12.116, "x": 7.86, "y": 8.77, "z": 7.062, "{": 7.412, "|": 4.626, "}": 7.412, "~": 8.588, "À": 10.324, "Á": 10.324, "Â": 10.324, "Ã": 10.324, "Ä": 10.324, "Å": 10.324, "Æ": 13.418, "Ç": 11.052, "È": 7.748, "É": 7.748, "Ê": 7.748, "Ë": 7.748, "Ì": 4.192, "Í": 4.192, "Î": 4.192, "Ï": 4.192, "Ð": 10.464, "Ñ": 10.59, "Ò": 11.29, "Ó": 11.29, "Ô": 11.29, "Õ": 11.29, "Ö": 11.29, "Ø": 11.29, "Ù": 10.058, "Ú": 10.058, "Û": 10.058, "Ü": 10.058, "Ý": 9.204, "Þ": 8.812, "ß": 10.478, "à": 9.792, "á": 9.792, "â": 9.792, "ã": 9.792, "ä": 9.792, "å": 9.792, "æ": 15.378, "ç": 8.728, "è": 8.938, "é": 8.938, "ê": 8.938, "ë": 8.938, "ì": 4.36, "í": 4.36, "î": 4.36, "ï": 4.36, "ð": 9.232, "ñ": 9.554, "ò": 9.232, "ó": 9.232, "ô": 9.232, "õ": 9.232, "ö": 9.232, "ø": 9.176, "ù": 9.554, "ú": 9.554, "û": 9.554, "ü": 9.554, "ý": 8.77, "þ": 9.792, "ÿ": 8.77, "–": 10.128, "—": 13.278, "‘": 4.15, "’": 4.15 }
const LINK_WIDTHS: Record<string, number> = { "-": 8.7, ".": 4.23, "/": 6.795, "0": 9.78, "1": 5.64, "2": 8.565, "3": 9.075, "4": 10.155, "5": 9.75, "6": 9.555, "7": 8.025, "8": 9.72, "9": 9.225, "a": 10.185, "b": 10.185, "c": 9.075, "d": 10.185, "e": 9.24, "f": 5.4, "g": 10.185, "h": 10.11, "i": 4.425, "j": 4.41, "k": 9.27, "l": 4.425, "m": 15.885, "n": 10.11, "o": 9.555, "p": 10.185, "q": 10.185, "r": 6.42, "s": 8.37, "t": 6.09, "u": 10.11, "v": 9.39, "w": 12.99, "x": 8.82, "y": 9.48, "z": 7.44, "A": 11.055, "B": 9.885, "C": 11.43, "D": 10.905, "E": 8.116, "F": 8.205, "G": 11.43, "H": 10.966, "I": 4.425, "J": 8.67, "K": 10.455, "L": 7.155, "M": 13.77, "N": 11.28, "O": 11.791, "P": 9.36, "Q": 11.82, "R": 9.78, "S": 9.225, "T": 8.866, "U": 10.575, "V": 10.95, "W": 15.78, "X": 10.725, "Y": 10.066, "Z": 8.941, "?": 8.07, "_": 11.7, "=": 10.441, "&": 11.97, "%": 13.05, ":": 4.26 }

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

/**
 * A realistic worst-case Agent ID for checking a printed address before any
 * agent has it: 16 characters, mixed case, digits and dashes, wide letters
 * (IDs are issued like "CP-VLN-H5J"). Longer IDs are flagged for admin
 * (flagAgentIdIfTooLong), and any agent whose own address doesn't fit gets
 * their oneflyer.org/a/<code> link printed instead.
 */
export const WORST_AGENT_ID = "MW-QmwO-8M4W-Qmd"
export const WORST_AGENT_ID_LENGTH = 16

export function linkWidth(text: string): number {
  return width(text, LINK_WIDTHS)
}

/** True when every printed line fits beside the QR at 15px (with the 2px flag margin). */
export function linesFitKitV2Footer(lines: string[]): boolean {
  return lines.every((l) => linkWidth(l) <= FLAG_PX)
}

/**
 * The printed enrollment address at its widest, as the footer prints it:
 * `prefix` (e.g. "join.basicbenefits.com/" or "oneflyer.org/a/") plus the
 * widest slot: the worst-case Agent ID, or an 8-character QR code of its
 * widest character.
 */
export function footerAddressWorstWidth(prefix: string, slot: "id" | "code"): number {
  return width(`${prefix}${slot === "id" ? WORST_AGENT_ID : "W".repeat(8)}`, LINK_WIDTHS)
}

export function addressFitsKitV2Footer(prefix: string, slot: "id" | "code"): boolean {
  return footerAddressWorstWidth(prefix, slot) <= FLAG_PX
}
