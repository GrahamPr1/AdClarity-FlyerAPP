import { describe, it, expect, afterEach, vi } from "vitest"
import { ownSiteHosts } from "@/lib/site-url"
import { isAllowedPdfRequest } from "@/lib/pdf/request-policy"
import { isOwnPhotoUrl } from "@/lib/rehost-image"

/**
 * Photos, logos and materials stored before the move to oneflyer.org live at
 * the legacy host. Whatever NEXT_PUBLIC_SITE_URL names, that host stays "ours":
 * the PDF renderer may load its photo route, and rehosting never refetches it.
 */

afterEach(() => vi.unstubAllEnvs())

const legacyPhoto = "https://ad-clarity-landing-page.vercel.app/api/photos/onboarding-photos/a.jpg"

for (const site of ["https://ad-clarity-landing-page.vercel.app", "https://oneflyer.org"]) {
  describe(`with NEXT_PUBLIC_SITE_URL=${site}`, () => {
    it("own hosts include oneflyer.org, www and the legacy host", () => {
      vi.stubEnv("NEXT_PUBLIC_SITE_URL", site)
      expect(ownSiteHosts()).toEqual(expect.arrayContaining(["oneflyer.org", "www.oneflyer.org", "ad-clarity-landing-page.vercel.app"]))
    })
    it("the PDF allow-list loads a photo stored at the legacy host and at oneflyer.org", () => {
      vi.stubEnv("NEXT_PUBLIC_SITE_URL", site)
      const policy = { siteHosts: ownSiteHosts() }
      expect(isAllowedPdfRequest(legacyPhoto, "GET", policy)).toBe(true)
      expect(isAllowedPdfRequest("https://oneflyer.org/api/photos/onboarding-photos/a.jpg", "GET", policy)).toBe(true)
      expect(isAllowedPdfRequest("https://evil.example/api/photos/onboarding-photos/a.jpg", "GET", policy)).toBe(false)
    })
    it("rehosting treats a legacy-host photo as already ours", () => {
      vi.stubEnv("NEXT_PUBLIC_SITE_URL", site)
      expect(isOwnPhotoUrl(legacyPhoto)).toBe(true)
    })
  })
}

it("a non-production site URL (preview, local) is added, not substituted", () => {
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "http://localhost:3000")
  expect(ownSiteHosts()).toEqual(expect.arrayContaining(["localhost:3000", "oneflyer.org", "ad-clarity-landing-page.vercel.app"]))
})
