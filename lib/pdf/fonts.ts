import fs from "node:fs"
import os from "node:os"
import path from "node:path"

/**
 * Gives the serverless renderer the typefaces the flyers actually name.
 *
 * MEASURED on the Vercel Linux runtime before any of this existed: the
 * container ships exactly ONE font. Every family probed — Helvetica Neue,
 * Helvetica, Arial, Georgia, Times New Roman, Trebuchet MS, Segoe UI,
 * Verdana, Palatino, Courier New — and even the `sans-serif`, `serif` and
 * `monospace` keywords all laid out at an identical 719.77px, and the
 * resulting PDF embedded `OpenSans-Regular` and nothing else. So without
 * this, every exported PDF is set in Open Sans no matter what the client
 * chose, and a serif flyer prints sans-serif. A developer's Mac has all
 * those families, so local verification passes and says nothing about it.
 *
 * The named families are proprietary and cannot be shipped. What can be,
 * and is, are the metric-compatible open substitutes: Arimo for Arial and
 * the Helvetica line, Gelasio for Georgia, Cousine for Courier New, all
 * drawn to the same advance widths as the fonts they stand in for, so a
 * layout measured against the original still fits. Archivo Black covers
 * the Arial Black / Impact slot, which has no metric clone.
 *
 * Substitution is done with fontconfig aliases rather than by rewriting
 * the flyer's CSS: the document keeps naming Helvetica Neue, which is
 * correct — on a machine that HAS Helvetica Neue, that is what should be
 * used. This only decides what stands in when it is absent.
 *
 * Verified on the Lambda after wiring it up (see the font-check line the
 * renderer logs on cold start). Before: every stack 719.77px. After: the
 * modern stack 695.98px (Arimo), the classic and minimal stacks 698.88px
 * (Gelasio) — distinct families, each the intended substitute.
 */

/** Where the .ttf files sit, relative to this module. */
const FONT_DIR = path.join(process.cwd(), "lib/pdf/fonts")

/**
 * family named by a flyer -> the bundled font that stands in for it.
 *
 * Times New Roman maps to Gelasio rather than to its own clone (Tinos)
 * deliberately: our own stacks only ever reach Times as a fallback BEHIND
 * Georgia, so it would cost 1.1MB to serve a case that our generated
 * documents do not produce. Both are transitional serifs; an AI-authored
 * document that names Times first gets Georgia's metrics instead of
 * Times', which is a small infidelity next to getting Open Sans.
 */
const ALIASES: Record<string, string> = {
  // Sans — Arimo is metric-compatible with Arial, which is metric-
  // compatible with Helvetica and Helvetica Neue.
  "Helvetica Neue": "Arimo",
  Helvetica: "Arimo",
  Arial: "Arimo",
  "Trebuchet MS": "Arimo",
  "Segoe UI": "Arimo",
  Verdana: "Arimo",
  Tahoma: "Arimo",
  // Heavy display.
  "Arial Black": "Archivo Black",
  Impact: "Archivo Black",
  // Serif — Gelasio is metric-compatible with Georgia.
  Georgia: "Gelasio",
  "Times New Roman": "Gelasio",
  Times: "Gelasio",
  "Palatino Linotype": "Gelasio",
  Palatino: "Gelasio",
  Garamond: "Gelasio",
  // Mono — Cousine is metric-compatible with Courier New.
  "Courier New": "Cousine",
  Courier: "Cousine",
}

/** What the bare generic keywords should land on. */
const GENERICS: Record<string, string> = {
  "sans-serif": "Arimo",
  serif: "Gelasio",
  monospace: "Cousine",
  cursive: "Gelasio",
  fantasy: "Archivo Black",
}

const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")

function fontsConf(fontDir: string, cacheDir: string): string {
  const alias = (from: string, to: string) =>
    `<match target="pattern"><test qual="any" name="family"><string>${escape(from)}</string></test>` +
    `<edit name="family" mode="assign" binding="same"><string>${escape(to)}</string></edit></match>`
  // prepend rather than assign for the generics, so a document that says
  // `serif` still gets Gelasio while one that says `Gelasio, serif`
  // resolves normally.
  const generic = (from: string, to: string) =>
    `<match target="pattern"><test name="family"><string>${escape(from)}</string></test>` +
    `<edit name="family" mode="prepend" binding="same"><string>${escape(to)}</string></edit></match>`

  return (
    `<?xml version="1.0"?><!DOCTYPE fontconfig SYSTEM "fonts.dtd"><fontconfig>` +
    `<dir>${escape(fontDir)}</dir><cachedir>${escape(cacheDir)}</cachedir>` +
    Object.entries(GENERICS).map(([f, t]) => generic(f, t)).join("") +
    Object.entries(ALIASES).map(([f, t]) => alias(f, t)).join("") +
    `</fontconfig>`
  )
}

let configured = false

/**
 * Points fontconfig at the bundled faces. Must run BEFORE the browser is
 * launched — the child process reads FONTCONFIG_PATH at startup.
 *
 * Only the ~1KB config is written at runtime; the font files stay in the
 * read-only bundle and are read from there, so a cold start does not copy
 * 1.3MB into /tmp.
 *
 * Returns whether it took effect, so the caller can say so rather than
 * assume it.
 */
export function configureFonts(): { applied: boolean; reason?: string } {
  if (configured) return { applied: true }
  // Only Linux needs this. A developer's machine has the real families,
  // and overriding them there would hide exactly the difference we want
  // to be able to see.
  if (process.platform !== "linux") return { applied: false, reason: "not linux" }
  if (!fs.existsSync(FONT_DIR)) {
    // Worth a loud failure: silently rendering every PDF in Open Sans is
    // the bug this module exists to prevent.
    console.error(`[pdf] bundled fonts missing at ${FONT_DIR} — PDFs will fall back to the container's default face`)
    return { applied: false, reason: "font directory not found" }
  }
  try {
    const cacheDir = path.join(os.tmpdir(), "fontconfig")
    const confDir = path.join(os.tmpdir(), "fontconfig-conf")
    fs.mkdirSync(cacheDir, { recursive: true })
    fs.mkdirSync(confDir, { recursive: true })
    fs.writeFileSync(path.join(confDir, "fonts.conf"), fontsConf(FONT_DIR, cacheDir))
    process.env.FONTCONFIG_PATH = confDir
    process.env.XDG_CACHE_HOME = os.tmpdir()
    configured = true
    return { applied: true }
  } catch (err) {
    console.error("[pdf] could not configure fonts", err)
    return { applied: false, reason: String(err) }
  }
}

/** The substitutes, for the renderer's cold-start check to assert against. */
export const EXPECTED_SUBSTITUTES = { sans: "Arimo", serif: "Gelasio", mono: "Cousine" } as const
