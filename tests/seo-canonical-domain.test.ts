import { describe, it, expect, afterEach, vi } from "vitest"
import sitemap from "@/app/sitemap"
import robots from "@/app/robots"

// Production's NEXT_PUBLIC_SITE_URL still names the old vercel.app alias
// (printed QR codes point there). Search Console only accepts oneflyer.org
// URLs, so the sitemap and robots.txt must not follow that variable.
describe("search engines only see oneflyer.org", () => {
  afterEach(() => vi.unstubAllEnvs())

  it("sitemap lists only oneflyer.org URLs, even with the legacy site URL set", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://ad-clarity-landing-page.vercel.app")
    const urls = sitemap().map((e) => e.url)
    expect(urls.length).toBeGreaterThan(0)
    for (const url of urls) expect(url).toMatch(/^https:\/\/oneflyer\.org(\/|$)/)
  })

  it("sitemap leaves out sign-in, app and redirecting paths", () => {
    const paths = sitemap().map((e) => new URL(e.url).pathname)
    for (const p of ["/login", "/signup", "/register", "/create", "/demo", "/app", "/pricing", "/faq", "/dashboard", "/admin"]) {
      expect(paths).not.toContain(p)
    }
  })

  it("robots.txt points at the oneflyer.org sitemap", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://ad-clarity-landing-page.vercel.app")
    expect(robots().sitemap).toBe("https://oneflyer.org/sitemap.xml")
  })
})
