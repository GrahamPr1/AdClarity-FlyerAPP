import type { Browser } from "playwright-core"
import { configureFonts } from "@/lib/pdf/fonts"
import { getBrowser } from "@/lib/pdf/flyer-pdf"

/**
 * A browser for ONE render, and how to give it back.
 *
 * On Vercel (Linux) every render gets its own Chromium, closed afterwards.
 * @sparticuz/chromium runs with --single-process, and in that mode the
 * shared browser does not survive a closed context: measured on the
 * nop-render preview (2026-10-07), the first render on an instance
 * succeeded and the next one on the same warm instance hung until the 60s
 * function timeout — print OK, home 504, home OK, social 504, preview OK…
 * A fresh launch costs ~2–3s, far below a timeout.
 *
 * Locally (macOS, Playwright's own multi-process Chromium) the shared
 * browser from lib/pdf/flyer-pdf.ts is reused as before.
 */
export async function acquireBrowser(): Promise<{ browser: Browser; release: () => Promise<void> }> {
  if (process.platform !== "linux") {
    return { browser: await getBrowser(), release: async () => {} }
  }
  const fonts = configureFonts()
  if (!fonts.applied) console.warn(`[nop-render] font substitution not applied: ${fonts.reason}`)
  const { chromium } = await import("playwright-core")
  const sparticuz = (await import("@sparticuz/chromium")).default
  const browser = await chromium.launch({ args: sparticuz.args, executablePath: await sparticuz.executablePath(), headless: true })
  return { browser, release: () => browser.close().catch(() => undefined) }
}
