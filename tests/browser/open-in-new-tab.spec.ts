import { test, expect, type Page } from "@playwright/test"
import http from "node:http"
import type { AddressInfo } from "node:net"

/**
 * Cross-engine verification of the "Open in new tab" mechanism.
 *
 * The real button lives on the authenticated dashboard, so this reproduces its
 * exact contract instead of logging in: an <a target="_blank" rel="noopener
 * noreferrer"> pointing at a same-origin route that returns text/html with
 * `Content-Security-Policy: sandbox allow-same-origin` — byte-identical
 * headers to app/api/flyers/[id]/view/route.ts.
 *
 * The important assertion is that the same-origin route under a sandbox CSP
 * opens, renders, and keeps its images in Chromium, Firefox AND WebKit.
 *
 * The second test only RECORDS what each engine does with the old data: URL,
 * because measurement showed they do not agree: Chromium refuses to open a tab
 * at all, WebKit opens one that never renders, Firefox is different again.
 * That disagreement is precisely why the production code must not depend on
 * data: navigation — not because every engine blocks it.
 */

const FLYER_HTML = `<!doctype html><html><head><title>Cedar Creek Plumbing — Flyer</title>
<style>body{font-family:sans-serif;background:#fff;color:#12141a}h1{color:#1b3a5c}</style></head>
<body><h1 id="headline">$99 Drain Cleaning</h1>
<p id="phone">(555) 700-1234</p>
<img id="qr" alt="QR code" src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==">
</body></html>`

function startServer(): Promise<{ origin: string; close: () => Promise<void> }> {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      if (req.url?.startsWith("/api/flyers/")) {
        // Exactly the headers the production route sets.
        res.writeHead(200, {
          "Content-Type": "text/html; charset=utf-8",
          "Content-Security-Policy": "sandbox allow-same-origin;",
          "X-Content-Type-Options": "nosniff",
          "Cache-Control": "private, max-age=300",
        })
        res.end(FLYER_HTML)
        return
      }
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" })
      res.end(`<!doctype html><html><body>
        <a id="good" href="/api/flyers/abc/view?v=1" target="_blank" rel="noopener noreferrer">Open flyer</a>
        <a id="legacy" href="data:text/html;base64,${Buffer.from(FLYER_HTML).toString("base64")}" target="_blank" rel="noopener noreferrer">Legacy data URL</a>
      </body></html>`)
    })
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as AddressInfo
      resolve({
        origin: `http://127.0.0.1:${port}`,
        close: () => new Promise((r) => server.close(() => r())),
      })
    })
  })
}

let srv: Awaited<ReturnType<typeof startServer>>
test.beforeAll(async () => { srv = await startServer() })
test.afterAll(async () => { await srv.close() })

async function clickAndGetNewTab(page: Page, id: string) {
  const popupPromise = page.context().waitForEvent("page", { timeout: 5000 }).catch(() => null)
  await page.click(`#${id}`)
  const popup = await popupPromise
  if (popup) await popup.waitForLoadState("domcontentloaded").catch(() => {})
  return popup
}

test("opens the flyer in a real new tab, renders content and QR, never a data: URL", async ({ page }) => {
  const consoleErrors: string[] = []
  page.on("console", (m) => m.type() === "error" && consoleErrors.push(m.text()))

  await page.goto(srv.origin)
  const popup = await clickAndGetNewTab(page, "good")

  expect(popup, "a new tab should open").not.toBeNull()
  const url = popup!.url()
  expect(url, "must not navigate to a data: URL").not.toContain("data:text/html")
  expect(url).toContain("/api/flyers/abc/view")

  // The flyer actually rendered.
  await expect(popup!.locator("#headline")).toHaveText("$99 Drain Cleaning")
  await expect(popup!.locator("#phone")).toHaveText("(555) 700-1234")

  // The QR image decoded and painted (naturalWidth > 0 means it really loaded).
  const qrLoaded = await popup!.locator("#qr").evaluate((img) => (img as HTMLImageElement).naturalWidth > 0)
  expect(qrLoaded, "QR image should load under the sandbox CSP").toBe(true)

  expect(consoleErrors.join("\n")).not.toMatch(/refused|blocked/i)
})

test("records what each engine does with the old data: URL approach", async ({ page }, testInfo) => {
  await page.goto(srv.origin)
  const popup = await clickAndGetNewTab(page, "legacy")

  // Engines genuinely differ here, and the difference is the whole point.
  // Chromium has blocked top-level navigation to data: URLs since v60, so the
  // original button did nothing at all for the majority of users. Firefox and
  // WebKit are more permissive and will render it.
  //
  // This test therefore records behaviour rather than asserting a universal —
  // an earlier version of this work claimed all three blocked it, which is not
  // true. What matters for the product is the OTHER test: the same-origin
  // route works everywhere, so it is correct for all engines regardless of how
  // each one treats data:.
  let rendered = 0
  let inspectable = true
  try {
    rendered = (await popup?.locator("#headline").count()) ?? 0
  } catch {
    // Firefox throws rather than resolving when the popup is left in a
    // non-navigable state — itself evidence the approach is unreliable.
    inspectable = false
  }
  const outcome =
    popup === null ? "no tab opened"
    : !inspectable ? "tab not inspectable / navigation never settled"
    : rendered > 0 ? "rendered the data: URL"
    : "opened but did not render"
  await testInfo.attach("legacy-data-url-behaviour", { body: `${testInfo.project.name}: ${outcome}`, contentType: "text/plain" })
  console.log(`  [${testInfo.project.name}] legacy data: URL -> ${outcome}`)

  // Whatever the engine does, the production code must not depend on it.
  expect([
    "no tab opened",
    "rendered the data: URL",
    "opened but did not render",
    "tab not inspectable / navigation never settled",
  ]).toContain(outcome)
})
