import type { Browser } from "playwright-core"
import { configureFonts, EXPECTED_SUBSTITUTES } from "./fonts"
import { STYLE_FONT_STACKS } from "@/lib/brand-controls"
import { getSiteUrl } from "@/lib/site-url"
import { getAppEnvironment } from "@/lib/env"
import { isAllowedPdfRequest, type PdfRequestPolicy } from "./request-policy"

/** Our own hosts for the photo route: wherever the site URL points, plus the canonical domain. */
function pdfRequestPolicy(): PdfRequestPolicy {
  const siteHosts = new Set(["oneflyer.org", "www.oneflyer.org"])
  try {
    siteHosts.add(new URL(getSiteUrl()).host)
  } catch {
    // getSiteUrl always returns a URL; the canonical hosts still apply.
  }
  return { siteHosts: [...siteHosts], allowDevHttpLoopback: getAppEnvironment() === "development" }
}

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

/**
 * The page size for a document that declares no @page.
 *
 * Every AI-written print format emits its own @page, and code-built template
 * documents are given one on read (ensurePageSize), so in practice the only
 * documents that reach this are AI-written square screen ones — a social
 * post, whose brief forbids @page because it is never printed. Falling back
 * to letter for those shrank a 1080px square onto
 * an 8.5x11in sheet with white bands top and bottom. For a square document
 * the page is the artwork's own size instead; its pixel size IS its intended
 * size, unlike a letter template laid out at ~100dpi (see above).
 *
 * Anything else without @page keeps the letter fallback, so an old flyer that
 * predates @page prints exactly as it did before.
 */
async function fallbackPageSize(
  page: import("playwright-core").Page,
): Promise<{ width: string; height: string; margin?: { top: string; right: string; bottom: string; left: string } }> {
  // Measured under a tiny viewport: at the default 1280px a 1080px-wide
  // document reports the viewport's width, not its own, and never looks
  // square. Shrunk, the scroll extent is the content's real size. Restored
  // after; page.pdf() lays out to the page size, not the viewport, anyway.
  // Print media too: the injected scroll safety net sets html/body to
  // height:auto under @media screen, which collapses a fixed-height canvas
  // to its text and hides the very size being measured.
  const viewport = page.viewportSize()
  await page.setViewportSize({ width: 100, height: 100 })
  await page.emulateMedia({ media: "print" })
  const doc = await page.evaluate(() => {
    let hasPageRule = false
    for (const sheet of Array.from(document.styleSheets)) {
      try {
        if (Array.from(sheet.cssRules).some((r) => r instanceof CSSPageRule)) hasPageRule = true
      } catch {
        // A cross-origin stylesheet (Google Fonts) can't be read; it carries
        // no @page either way.
      }
    }
    const el = document.documentElement
    return { hasPageRule, width: el.scrollWidth, height: el.scrollHeight }
  })
  await page.emulateMedia({ media: null })
  if (viewport) await page.setViewportSize(viewport)
  const square = doc.width > 0 && Math.abs(doc.width - doc.height) / doc.width < 0.02
  if (doc.hasPageRule || !square) return PAGE
  // Zero margins: the artwork is the page, edge to edge, and any default
  // margin pushes the bottom of a full-height square onto a second page.
  const none = "0"
  return { width: `${doc.width}px`, height: `${doc.height}px`, margin: { top: none, right: none, bottom: none, left: none } }
}

let cached: Browser | null = null

/**
 * A browser for ONE render, and how to give it back.
 *
 * On Vercel (Linux) every render launches its own Chromium and closes it.
 * @sparticuz/chromium runs with --single-process, and in that mode a shared
 * browser does not survive a closed context: measured on a Vercel preview
 * (2026-10-07), the first render on an instance succeeded and the next one
 * on the same warm instance hung until the function timed out, alternately
 * — so "one browser per warm instance" failed every second download. A
 * fresh launch costs ~2–3s, well inside maxDuration.
 *
 * On a developer's Mac, Playwright's own (multi-process) Chromium is shared
 * across renders as before; pages are still created and closed per render
 * so one request can never see another's document.
 */
export async function acquireBrowser(): Promise<{ browser: Browser; release: () => Promise<void> }> {
  const { chromium } = await import("playwright-core")

  // @sparticuz/chromium is a Linux x64 build; on a developer's Mac we use
  // the Chromium that Playwright already installed for the browser tests.
  if (process.platform === "linux") {
    // BEFORE launch: the child reads FONTCONFIG_PATH at startup, and the
    // container ships only one font without this. See lib/pdf/fonts.ts.
    const fonts = configureFonts()
    if (!fonts.applied) console.warn(`[pdf] font substitution not applied: ${fonts.reason}`)
    const sparticuz = (await import("@sparticuz/chromium")).default
    const browser = await chromium.launch({
      args: sparticuz.args,
      executablePath: await sparticuz.executablePath(),
      headless: true,
    })
    return { browser, release: () => browser.close().catch(() => undefined) }
  }

  if (!cached?.isConnected()) cached = await chromium.launch({ headless: true })
  return { browser: cached, release: async () => {} }
}

export interface RenderedPdf {
  pdf: Buffer
  /** Milliseconds spent in the browser, for the route to log. */
  ms: number
}

export async function renderFlyerPdf(html: string): Promise<RenderedPdf> {
  const t0 = Date.now()
  const { browser, release } = await acquireBrowser()
  // A fresh context per render: no cookies, no storage, nothing carried
  // between one client's flyer and the next.
  //
  // JavaScript OFF: the document is AI-generated, and nothing in a flyer
  // needs script to print. Off, an injected <script> or SVG onload/onerror
  // never runs. Playwright's own page.evaluate (used below for image decode,
  // fonts and page size) still works — it isn't page script.
  const context = await browser.newContext({ javaScriptEnabled: false })
  // Every request the document makes is checked against an allow-list
  // (lib/pdf/request-policy.ts) and anything else is aborted, so a URL in
  // the HTML can't make our server fetch arbitrary hosts. Blocked hosts are
  // logged by name only, never the full URL.
  const policy = pdfRequestPolicy()
  const blocked = new Set<string>()
  await context.route("**/*", (route) => {
    const request = route.request()
    if (isAllowedPdfRequest(request.url(), request.method(), policy)) return route.continue()
    try {
      blocked.add(new URL(request.url()).host || request.url().slice(0, 16))
    } catch {
      blocked.add("(unparseable url)")
    }
    return route.abort("blockedbyclient")
  })
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
    const fallback = await fallbackPageSize(page)
    const pdf = await page.pdf({
      // The document's own @page wins; this is the fallback for one that
      // has none (see fallbackPageSize).
      preferCSSPageSize: true,
      width: fallback.width,
      height: fallback.height,
      margin: fallback.margin,
      printBackground: true,
      // No pageRanges. A flyer, door hanger or social post is one physical
      // piece and renders as one page on its own; a proposal legitimately
      // runs to two (formats.ts `paginates`), and truncating it here would
      // silently drop the half with the pricing on it.
      //
      // No displayHeaderFooter either — that is what would stamp a URL, a
      // date or "Page 1 of 2" onto a finished marketing asset.
    })
    if (blocked.size) console.warn(`[pdf] blocked request host(s): ${[...blocked].join(", ")}`)
    return { pdf, ms: Date.now() - t0 }
  } finally {
    await context.close().catch(() => undefined)
    await release()
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

/**
 * How a document actually lays out when printed — the half of "print-safe"
 * a string check can't see. Used to vet a quick edit or refinement before it
 * is saved (lib/agent-pipeline/pipeline.ts): the edited flyer is measured
 * against the current one, so only problems the EDIT introduced count.
 *
 *  - pages: the PDF's page count. A line that outgrows a single-page layout
 *    spills onto a second page; a flyer is one physical sheet.
 *  - clipped: text cut off inside a fixed-size box. The templates size every
 *    section and set overflow:hidden, so an over-long line doesn't spill —
 *    it silently disappears off the edge.
 *
 * Same browser, fonts and request policy as the real PDF, so it measures
 * what the client would print.
 */
export interface LayoutMeasure {
  pages: number
  clipped: string[]
}

export async function measureLayout(html: string): Promise<LayoutMeasure> {
  const { pdf } = await renderFlyerPdf(html)
  const pages = (pdf.toString("latin1").match(/\/Type\s*\/Page(?!s)/g) ?? []).length

  const { browser, release } = await acquireBrowser()
  const context = await browser.newContext({ javaScriptEnabled: false })
  const policy = pdfRequestPolicy()
  await context.route("**/*", (route) =>
    isAllowedPdfRequest(route.request().url(), route.request().method(), policy) ? route.continue() : route.abort("blockedbyclient"),
  )
  try {
    const page = await context.newPage()
    await page.setContent(html, { waitUntil: "load" })
    await page.evaluate(() => document.fonts.ready.then(() => undefined)).catch(() => undefined)
    const clipped = await page.evaluate(() => {
      const out: string[] = []
      for (const el of Array.from(document.querySelectorAll<HTMLElement>("body *"))) {
        const cs = getComputedStyle(el)
        if (!/hidden|clip/.test(`${cs.overflow} ${cs.overflowX} ${cs.overflowY}`)) continue
        const text = (el.textContent ?? "").replace(/\s+/g, " ").trim()
        if (!text) continue
        if (el.scrollHeight > el.clientHeight + 2 || el.scrollWidth > el.clientWidth + 2) out.push(text.slice(0, 60))
      }
      return out
    })
    return { pages, clipped }
  } finally {
    await context.close().catch(() => undefined)
    await release()
  }
}
