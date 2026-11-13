import { PNG } from "pngjs"

// The logo slot: a fixed 200 x 40 CSS px box in the header's top-left, on the
// navy header (#000836). PNG only.
//
// Contrast rule (approved 2026-11-13): every visible pixel (alpha >= 50%) is
// composited over the navy and its WCAG contrast ratio against the navy is
// measured. If fewer than 90% of the visible pixels (weighted by alpha) reach
// 3:1 (WCAG 1.4.11, graphics), the logo is drawn on a white rounded chip
// inside the same box instead. The decision is computed once at upload and
// stored with the file, so a render is deterministic and a re-render of an
// approved version can't change it.

export const LOGO_BOX = { w: 200, h: 40 } as const
export const NAVY = { r: 0x00, g: 0x08, b: 0x36 } as const
export const MIN_CONTRAST = 3
export const PASS_SHARE = 0.9
export const LOGO_LIMITS = { maxBytes: 1024 * 1024, minHeight: 125, maxSide: 4000, minRatio: 1, maxRatio: 8 } as const
/** The chip: white, 6px radius, 4px/8px padding inside the 200 x 40 box. */
export const CHIP = { padY: 4, padX: 8, radius: 6 } as const

export interface LogoAnalysis {
  width: number
  height: number
  /** Share of visible pixels (alpha-weighted) at >= 3:1 against the navy. */
  passShare: number
  /** Contrast of the logo's average visible colour against the navy, for the admin's information. */
  meanContrast: number
  chip: boolean
}

const lin = (c: number) => {
  const s = c / 255
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
}
export const luminance = (r: number, g: number, b: number) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
export const contrast = (l1: number, l2: number) => (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)

export type LogoCheck = { ok: true; analysis: LogoAnalysis } | { ok: false; error: string }

export function analyzeLogo(bytes: Buffer): LogoCheck {
  if (bytes.length > LOGO_LIMITS.maxBytes) return { ok: false, error: "Logo must be at most 1 MB." }
  let png: PNG
  try {
    png = PNG.sync.read(bytes)
  } catch {
    return { ok: false, error: "Logo must be a valid PNG." }
  }
  const { width, height, data } = png
  if (height < LOGO_LIMITS.minHeight) return { ok: false, error: `Logo must be at least ${LOGO_LIMITS.minHeight}px tall (it prints 40px tall at 300 dpi); this one is ${height}px.` }
  if (width > LOGO_LIMITS.maxSide || height > LOGO_LIMITS.maxSide) return { ok: false, error: `Logo can be at most ${LOGO_LIMITS.maxSide}px on a side.` }
  const ratio = width / height
  if (ratio < LOGO_LIMITS.minRatio || ratio > LOGO_LIMITS.maxRatio) return { ok: false, error: `Logo shape must be between 1:1 and 8:1 (width:height); this one is ${ratio.toFixed(2)}:1.` }

  const navyL = luminance(NAVY.r, NAVY.g, NAVY.b)
  let weight = 0, pass = 0, sr = 0, sg = 0, sb = 0
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3] / 255
    if (a < 0.5) continue
    // Composited over the navy, as it would print.
    const r = data[i] * a + NAVY.r * (1 - a), g = data[i + 1] * a + NAVY.g * (1 - a), b = data[i + 2] * a + NAVY.b * (1 - a)
    weight += a
    sr += r * a; sg += g * a; sb += b * a
    if (contrast(luminance(r, g, b), navyL) >= MIN_CONTRAST) pass += a
  }
  if (weight === 0) return { ok: false, error: "Logo has no visible pixels." }
  const passShare = pass / weight
  const meanContrast = contrast(luminance(sr / weight, sg / weight, sb / weight), navyL)
  return { ok: true, analysis: { width, height, passShare: Math.round(passShare * 1000) / 1000, meanContrast: Math.round(meanContrast * 100) / 100, chip: passShare < PASS_SHARE } }
}

function esc(v: string): string {
  return v.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!)
}

/**
 * The logo box's markup. With a chip, the chip hugs the logo (its width is
 * computed from the PNG's ratio) and never exceeds the 200 x 40 box. With no
 * logo, the org name prints in the box as text.
 */
export function logoHtml(logo: { dataUri: string; analysis: LogoAnalysis } | null, orgName: string): string {
  const box = `width:${LOGO_BOX.w}px;height:${LOGO_BOX.h}px;flex:none;display:flex;align-items:center;justify-content:flex-start;`
  if (!logo) {
    return `<div data-ap-logo="text" style="${box}"><span data-ap-slot="logo.text" style="font-size:16px;font-weight:700;color:#fff;white-space:nowrap;">${esc(orgName)}</span></div>`
  }
  const { analysis: a } = logo
  if (!a.chip) {
    return `<div data-ap-logo="plain" style="${box}"><img src="${logo.dataUri}" alt="${esc(orgName)}" style="width:${LOGO_BOX.w}px;height:${LOGO_BOX.h}px;object-fit:contain;object-position:left center;display:block;"></div>`
  }
  const innerH = LOGO_BOX.h - 2 * CHIP.padY
  const imgW = Math.min(LOGO_BOX.w - 2 * CHIP.padX, Math.round((innerH * a.width) / a.height * 100) / 100)
  const chipW = Math.round((imgW + 2 * CHIP.padX) * 100) / 100
  return `<div data-ap-logo="chip" style="${box}"><div style="box-sizing:border-box;width:${chipW}px;height:${LOGO_BOX.h}px;padding:${CHIP.padY}px ${CHIP.padX}px;background:#fff;border-radius:${CHIP.radius}px;"><img src="${logo.dataUri}" alt="${esc(orgName)}" style="width:${imgW}px;height:${innerH}px;object-fit:contain;object-position:center;display:block;"></div></div>`
}
