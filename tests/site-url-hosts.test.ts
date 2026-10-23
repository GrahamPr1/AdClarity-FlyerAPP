import { describe, it, expect, vi, afterEach } from "vitest"

vi.mock("@vercel/blob", () => ({
  get: vi.fn(async (pathname: string) =>
    pathname === "onboarding-photos/rehosted/logo/a.png"
      ? { stream: new Blob([new Uint8Array([137, 80, 78, 71])]).stream(), blob: { contentType: "image/png" } }
      : null,
  ),
}))

import { getAssetBaseUrl, photoUrl, ownSiteHosts, toCurrentSiteUrl, LEGACY_SITE_HOSTS } from "@/lib/site-url"
import { photoPathname, readPhotoBytes } from "@/lib/photo-store"
import { isAllowedPdfRequest, ownPhotoRoutePath } from "@/lib/pdf/request-policy"
import { isOwnPhotoUrl } from "@/lib/rehost-image"

afterEach(() => vi.unstubAllEnvs())

describe("photo URLs per environment", () => {
  it("production links photos at the site URL", () => {
    vi.stubEnv("VERCEL_ENV", "production")
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://oneflyer.org")
    vi.stubEnv("VERCEL_URL", "oneflyer-abc-grahampr1s-projects.vercel.app")
    expect(photoUrl("onboarding-photos/x.png")).toBe("https://oneflyer.org/api/photos/onboarding-photos/x.png")
  })

  it("Preview links photos at its own deployment, not production (whose Blob store can't see them)", () => {
    vi.stubEnv("VERCEL_ENV", "preview")
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://ad-clarity-landing-page.vercel.app")
    vi.stubEnv("VERCEL_BRANCH_URL", "oneflyer-git-site-url-move-grahampr1s-projects.vercel.app")
    vi.stubEnv("VERCEL_URL", "oneflyer-abc-grahampr1s-projects.vercel.app")
    expect(getAssetBaseUrl()).toBe("https://oneflyer-git-site-url-move-grahampr1s-projects.vercel.app")
    vi.stubEnv("VERCEL_BRANCH_URL", "")
    expect(getAssetBaseUrl()).toBe("https://oneflyer-abc-grahampr1s-projects.vercel.app")
  })

  it("local development keeps the site URL", () => {
    vi.stubEnv("VERCEL_ENV", "")
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "http://localhost:3000")
    expect(photoUrl("onboarding-photos/x.png")).toBe("http://localhost:3000/api/photos/onboarding-photos/x.png")
  })

  it("own hosts always include the canonical and legacy domains, plus this Preview", () => {
    vi.stubEnv("VERCEL_ENV", "preview")
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://oneflyer.org")
    vi.stubEnv("VERCEL_BRANCH_URL", "oneflyer-git-x-grahampr1s-projects.vercel.app")
    expect(ownSiteHosts()).toEqual(
      expect.arrayContaining(["oneflyer.org", "www.oneflyer.org", "ad-clarity-landing-page.vercel.app", "oneflyer-git-x-grahampr1s-projects.vercel.app"]),
    )
    // A rehost on this Preview recognises its own earlier copies.
    expect(isOwnPhotoUrl("https://oneflyer-git-x-grahampr1s-projects.vercel.app/api/photos/onboarding-photos/a.png")).toBe(true)
    expect(isOwnPhotoUrl("https://ad-clarity-landing-page.vercel.app/api/photos/onboarding-photos/a.png")).toBe(true)
    expect(isOwnPhotoUrl("https://evil.example/api/photos/onboarding-photos/a.png")).toBe(false)
  })
})

describe("toCurrentSiteUrl", () => {
  it("moves legacy-host links to the current site, keeping path and query", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://oneflyer.org")
    expect(toCurrentSiteUrl("https://ad-clarity-landing-page.vercel.app/api/onboarding/material/onboarding-materials/a.pdf?x=1")).toBe(
      "https://oneflyer.org/api/onboarding/material/onboarding-materials/a.pdf?x=1",
    )
    expect(toCurrentSiteUrl("https://example.com/a.pdf")).toBe("https://example.com/a.pdf")
    expect(toCurrentSiteUrl("not a url")).toBe("not a url")
  })

  it("leaves links alone while the site URL is still the legacy host", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", `https://${LEGACY_SITE_HOSTS[0]}`)
    const url = `https://${LEGACY_SITE_HOSTS[0]}/api/onboarding/material/onboarding-materials/a.pdf`
    expect(toCurrentSiteUrl(url)).toBe(url)
  })
})

describe("photo-store", () => {
  it("serves only the onboarding-photos prefix, with no traversal", () => {
    expect(photoPathname("onboarding-photos/rehosted/logo/a.png")).toBe("onboarding-photos/rehosted/logo/a.png")
    for (const bad of [
      "onboarding-materials/a.pdf",
      "form-fill/a.pdf",
      "onboarding-photos/../form-fill/a.pdf",
      "onboarding-photos/%2e%2e/form-fill/a.pdf",
      "onboarding-photos/..%5cform-fill",
      "%E0%A4%A",
    ]) {
      expect(photoPathname(bad), bad).toBeNull()
    }
  })

  it("reads a photo's bytes and type for the PDF renderer", async () => {
    const photo = await readPhotoBytes("onboarding-photos/rehosted/logo/a.png")
    expect(photo?.contentType).toBe("image/png")
    expect([...photo!.bytes]).toEqual([137, 80, 78, 71])
    expect(await readPhotoBytes("onboarding-photos/missing.png")).toBeNull()
    expect(await readPhotoBytes("form-fill/secret.pdf")).toBeNull()
  })
})

describe("PDF renderer: own photos come from Blob, not HTTP", () => {
  const policy = { siteHosts: ["oneflyer.org", "ad-clarity-landing-page.vercel.app", "oneflyer-git-x-grahampr1s-projects.vercel.app"] }

  it("recognises photo-route URLs on every own host, including this Preview", () => {
    for (const host of policy.siteHosts) {
      const url = `https://${host}/api/photos/onboarding-photos/a.png`
      expect(isAllowedPdfRequest(url, "GET", policy)).toBe(true)
      expect(ownPhotoRoutePath(url, policy)).toBe("onboarding-photos/a.png")
    }
  })

  it("passes everything else to the normal allow-list", () => {
    expect(ownPhotoRoutePath("https://images.unsplash.com/photo-1", policy)).toBeUndefined()
    expect(ownPhotoRoutePath("https://oneflyer.org/dashboard", policy)).toBeUndefined()
    expect(ownPhotoRoutePath("https://other-preview.vercel.app/api/photos/onboarding-photos/a.png", policy)).toBeUndefined()
  })
})
