import { acquireBrowser } from "@/lib/pdf/flyer-pdf"

// Does an enrollment page show a real partner? Basic Benefits' enrollment
// pages are drawn by script: the HTML is an empty shell that loads with 200
// whether or not the partner exists, then looks the partner up and shows
// "Partner Not Found. We couldn't find the enrollment portal you're looking
// for." (after a few retries, ~8s) for an unknown one. So this loads the page
// in Chromium, as a phone would, and reads the text it ends up showing.
// Admin checks only (the enrollment setting, the kit-v2 switch); kept out of
// nop-enroll-domain.ts so the QR forward never loads a browser.

export interface EnrollPageCheck {
  url: string
  ok: boolean
  /** "not_found": the page says the partner doesn't exist; "blank": nothing showed within the wait; "error": it didn't load. */
  problem: "not_found" | "blank" | "error" | null
  /** The start of what the page showed, for the admin to read. */
  text: string
}

export const PARTNER_NOT_FOUND = /\bnot\s+found\b|\bcannot\s+be\s+found\b|\bcould(?:n['’]t|\s+not)\s+find\b/i

const WAIT_MS = 20_000
/** Never pass a page sooner than this: the not-found message took ~8s to appear (11/2026). */
const MIN_WAIT_MS = 12_000

export async function checkEnrollPage(url: string): Promise<EnrollPageCheck> {
  const { browser, release } = await acquireBrowser()
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
  try {
    const page = await context.newPage()
    // Never let the page's own dialogs block the check.
    page.on("dialog", (d) => void d.dismiss().catch(() => undefined))
    const res = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15_000 })
    if (!res || res.status() >= 400) return { url, ok: false, problem: "error", text: res ? `HTTP ${res.status()}` : "no answer" }
    // Wait for the page to settle on something: the partner's page, or the not-found message.
    const start = Date.now()
    const deadline = start + WAIT_MS
    let text = ""
    let stableSince = 0
    while (Date.now() < deadline) {
      const now = ((await page.evaluate("document.body ? document.body.innerText : ''").catch(() => "")) as string).replace(/\s+/g, " ").trim()
      if (PARTNER_NOT_FOUND.test(now)) return { url, ok: false, problem: "not_found", text: now.slice(0, 300) }
      if (now && now === text) {
        // The same visible text for 3s, and at least MIN_WAIT_MS in: the page has settled.
        if (Date.now() - stableSince >= 3_000 && Date.now() - start >= MIN_WAIT_MS) break
      } else {
        text = now
        stableSince = Date.now()
      }
      await page.waitForTimeout(500)
    }
    if (!text) return { url, ok: false, problem: "blank", text: "" }
    return { url, ok: true, problem: null, text: text.slice(0, 300) }
  } catch (err) {
    return { url, ok: false, problem: "error", text: err instanceof Error ? err.message.slice(0, 200) : String(err) }
  } finally {
    await context.close().catch(() => undefined)
    await release()
  }
}
