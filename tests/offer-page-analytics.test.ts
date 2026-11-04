import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"

/**
 * Offer pages (/r/<code>) load no analytics or advertising tags: not GA4, not
 * GTM (which carries the Meta tag), not Vercel Analytics. Each tag checks the
 * path itself while server-rendering, so nothing about it reaches the HTML.
 */

const nav = vi.hoisted(() => ({ pathname: "/" }))
vi.mock("next/navigation", () => ({ usePathname: () => nav.pathname }))

const TAG_MARKERS = ["googletagmanager.com", "gtag(", "gtm.js", "GTM-", "G-TESTID123", "va.vercel-scripts", "/_vercel/insights"]

async function renderTags() {
  const { GoogleAnalytics } = await import("@/components/google-analytics")
  const { GoogleTagManager, GoogleTagManagerNoScript } = await import("@/components/google-tag-manager")
  const { VercelAnalytics } = await import("@/components/vercel-analytics")
  return [GoogleTagManagerNoScript, GoogleAnalytics, GoogleTagManager, VercelAnalytics]
    .map((c) => renderToStaticMarkup(createElement(c)))
    .join("\n")
}

beforeEach(() => vi.stubEnv("NEXT_PUBLIC_GA_MEASUREMENT_ID", "G-TESTID123"))
afterEach(() => vi.unstubAllEnvs())

describe("analytics tags", () => {
  it.each(["/r/ABC2345", "/r/OLD2345", "/r"])("render nothing on the offer page %s", async (p) => {
    nav.pathname = p
    const html = await renderTags()
    expect(html).toBe("\n\n\n")
    for (const m of TAG_MARKERS) expect(html).not.toContain(m)
  })

  it.each(["/", "/about", "/login", "/dashboard"])("still render on %s", async (p) => {
    nav.pathname = p
    const html = await renderTags()
    expect(html).toContain("gtag('consent','default'")
    expect(html).toContain("googletagmanager.com/ns.html?id=GTM-")
  })

  it("don't mistake a path that merely starts with r for an offer page", async () => {
    const { isOfferPagePath } = await import("@/lib/offer-page")
    expect(isOfferPagePath("/refund-policy")).toBe(false)
    expect(isOfferPagePath("/register")).toBe(false)
    expect(isOfferPagePath("/r/X")).toBe(true)
  })
})
