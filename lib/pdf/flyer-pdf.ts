import type { Browser } from "playwright-core"
import { configureFonts, EXPECTED_SUBSTITUTES } from "./fonts"
import { STYLE_FONT_STACKS } from "@/lib/brand-controls"

/**
 * Renders a finished flyer to a print-ready PDF.
 *
 * WHY A REAL BROWSER. A flyer is model-generated HTML+CSS with absolutely
 * positioned blocks, gradients, a logo and a QR code. Re-drawing that with a
 * PDF library (pdf-lib, which we already have for the fillable-form path)
 * would mean reimplementing layout, and would drift from what the client saw
 * on screen the moment a template changed. Printing the same document with
 * the same engine that rendered the preview is the only way "the PDF matches
 * the flyer" stays true without maintenance.
 *
 * WHY THE DOCUMENT PICKS THE PAGE SIZE. page.pdf() works in CSS pixels at
 * 96/inch while the templates are laid out at roughly 100dpi, so passing a
 * template's PIXEL size produces an 8.860 x 11.457in page — close enough to
 * look right and wrong on every printer. The fix is not to hardcode letter
 * either: the five output formats are not all letter-sized, and every one
 * of them already emits its own correct `@page` rule (measured across the
 * print fixtures: flyer and one-pager `8.5in 11in` margin 0, door hanger
 * `3.5in 8.5in` margin 0, coloring page margin 0.4in, proposal margin
 * 0.6in). Hardcoding 8.5 x 11in would print a door hanger onto a letter
 * sheet, and hardcoding margin 0 would strip the two documents that ask for
 * one — so preferCSSPageSize hands the decision to the document, and the
 * explicit size below is only the fallback for a document with no @page at
 * all.
 *
 * A `scale:` correction was measured and turned out to be pixel-identical
 * to scale 1 (0 differing pixels of 772,000), because Chromium already
 * auto-fits a fixed-width body — so there is no scale hack here on purpose.
 *
 * WHY setContent AND NOT A REQUEST TO /api/flyers/[id]/view. The caller
 * already holds the decoded HTML, having just read it out of Redis to
 * authorise the request. Navigating instead would mean this function making
 * an authenticated HTTP request back into our own deployment, forwarding
 * the caller's session cookie to do it. That is a second invocation, a
 * second cold start, and a credential being passed somewhere it does not
 * need to go, to fetch bytes we are already holding. Both paths were
 * rendered and compared and the resulting PDFs were identical (see
 * tests/browser/flyer-pdf.spec.ts), so this takes the one with less moving
 * machinery. Flyers reference images by absolute https: or data: URL, never
 * relatively, which is what makes the two equivalent.
 */

/** US Letter. Chromium accepts CSS units here and does its own fitting. */
export const PAGE = { width: "8.5in", height: "11in" } as const

let cached: Browser | null = null

/**
 * One browser per warm instance.
 *
 * Fluid Compute reuses an instance across requests, and a Chromium cold
 * start is several seconds — paying it per download would make the button
 * feel broken. Pages are still created and closed per render so one request
 * can never see another's document.
 */
async function getBrowser(): Promise<Browser> {
  if (cached?.isConnected()) return cached

  const { chromium } = await import("playwright-core")

  // @sparticuz/chromium is a Linux x64 build; on a developer's Mac we use
  // the Chromium that Playwright already installed for the browser tests.
  const onLambda = process.platform === "linux"
  if (onLambda) {
    // BEFORE launch: the child reads FONTCONFIG_PATH at startup, and the
    // container ships only one font without this. See lib/pdf/fonts.ts.
    const fonts = configureFonts()
    if (!fonts.applied) console.warn(`[pdf] font substitution not applied: ${fonts.reason}`)
    const sparticuz = (await import("@sparticuz/chromium")).default
    cached = await chromium.launch({
      args: sparticuz.args,
      executablePath: await sparticuz.executablePath(),
      headless: true,
    })
  } else {
    cached = await chromium.launch({ headless: true })
  }
  return cached
}

export interface RenderedPdf {
  pdf: Buffer
  /** Milliseconds spent in the browser, for the route to log. */
  ms: number
}

export async function renderFlyerPdf(html: string): Promise<RenderedPdf> {
  const t0 = Date.now()
  const browser = await getBrowser()
  // A fresh context per render: no cookies, no storage, nothing carried
  // between one client's flyer and the next.
  const context = await browser.newContext()
  try {
    const page = await context.newPage()
    await page.setContent(html, { waitUntil: "load" })
    // The logo and any photo are remote or data: URLs. `load` covers <img>,
    // but decoding can lag it, and an undecoded image prints blank.
    await page.evaluate(async () => {
      await Promise.all(
        Array.from(document.images)
          .filter((img) => !img.complete)
          .map((img) => img.decode().catch(() => undefined)),
      )
    })
    // Flyers written by the AI path (rather than filled from a template)
    // sometimes carry a <link> to Google Fonts, and `load` resolves when the
    // STYLESHEET arrives, not when the font files behind it do. Printing in
    // that gap produces a PDF set in the fallback while the same document
    // on screen shows the real face — the difference is invisible until a
    // client holds the two side by side.
    await page
      .evaluate(() => document.fonts.ready.then(() => undefined))
      .catch(() => undefined)
    await logFontsOnce(page)
    const pdf = await page.pdf({
      // The document's own @page wins; these are the fallback for one that
      // somehow has none.
      preferCSSPageSize: true,
      width: PAGE.width,
      height: PAGE.height,
      printBackground: true,
      // No pageRanges. A flyer, door hanger or social post is one physical
      // piece and renders as one page on its own; a proposal legitimately
      // runs to two (formats.ts `paginates`), and truncating it here would
      // silently drop the half with the pricing on it.
      //
      // No displayHeaderFooter either — that is what would stamp a URL, a
      // date or "Page 1 of 2" onto a finished marketing asset.
    })
    return { pdf, ms: Date.now() - t0 }
  } finally {
    await context.close()
  }
}

/**
 * Checks, once per cold start, that the flyers' four font stacks actually
 * produce four different renderings in THIS container.
 *
 * Not paranoia. A missing font produces no error, no warning and output
 * that looks perfectly reasonable, which is how the original bug survived
 * months of review. And the environments genuinely differ: the Vercel
 * Linux runtime ships one font, so before lib/pdf/fonts.ts every stack
 * measured an identical 719.77px and every PDF embedded OpenSans-Regular,
 * while the same code on a developer's Mac rendered all four correctly.
 *
 * Distinctness is the assertion rather than "differs from a nonexistent
 * family", because with substitution in place a nonexistent family also
 * resolves to something. If the four collapse to one width, the container
 * is rendering every flyer in the same face whatever the client chose,
 * and that is worth a warning in the log rather than a silent wrong PDF.
 */
let fontsLogged = false
async function logFontsOnce(page: import("playwright-core").Page): Promise<void> {
  if (fontsLogged) return
  fontsLogged = true
  try {
    const stacks = STYLE_FONT_STACKS
    const probe = await page.evaluate(
      ({ stacks, substitutes }) => {
        const el = document.createElement("span")
        el.style.cssText = "position:absolute;left:-9999px;white-space:nowrap;font-size:40px"
        el.textContent = "Spring roof inspection \u2014 (270) 555-0142"
        document.body.appendChild(el)
        const width = (stack: string) => {
          el.style.fontFamily = stack
          return Math.round(el.getBoundingClientRect().width * 100) / 100
        }
        const out = {
          stacks: Object.fromEntries(
            Object.entries(stacks).map(([k, v]) => [k, width((v as { heading: string }).heading)]),
          ),
          substitutes: Object.fromEntries(substitutes.map((f) => [f, width(`'${f}'`)])),
        }
        el.remove()
        return out
      },
      { stacks, substitutes: Object.values(EXPECTED_SUBSTITUTES) as string[] },
    )
    const widths = Object.values(probe.stacks)
    const distinct = new Set(widths).size
    const detail =
      Object.entries(probe.stacks).map(([k, w]) => `${k}=${w}`).join(" ") +
      " | substitutes " +
      Object.entries(probe.substitutes).map(([k, w]) => `${k}=${w}`).join(" ")
    if (distinct === 1) {
      console.warn(
        `[pdf] FONT FALLBACK on ${process.platform}: all ${widths.length} brand stacks render identically ` +
          `— every PDF from this container is set in one face regardless of the client's choice. ${detail}`,
      )
    } else {
      console.log(`[pdf] fonts ok on ${process.platform}: ${distinct} distinct faces across the stacks. ${detail}`)
    }
  } catch (err) {
    console.warn("[pdf] font check failed", err)
  }
}
