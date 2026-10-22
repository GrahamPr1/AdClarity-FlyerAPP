import { describe, it, expect } from "vitest"
import { isAllowedPdfRequest } from "@/lib/pdf/request-policy"

const prod = { siteHosts: ["ad-clarity-landing-page.vercel.app", "oneflyer.org", "www.oneflyer.org"] }
const dev = { siteHosts: ["localhost:3000", "oneflyer.org"], allowDevHttpLoopback: true }
const ok = (url: string, policy = prod, method = "GET") => isAllowedPdfRequest(url, method, policy)

describe("PDF render allow-list — allowed", () => {
  it.each([
    "https://fonts.googleapis.com/css2?family=Inter:wght@400;700&display=swap",
    "https://fonts.gstatic.com/s/inter/v13/abc.woff2",
    "https://images.unsplash.com/photo-123?ixid=x&w=1080",
    "https://abc123.public.blob.vercel-storage.com/onboarding-photos/logo.png",
    "https://ad-clarity-landing-page.vercel.app/api/photos/onboarding-photos/uuid-logo.png",
    "https://oneflyer.org/api/photos/onboarding-photos/uuid.jpg",
    "data:image/png;base64,iVBORw0KGgo=",
  ])("%s", (url) => expect(ok(url)).toBe(true))

  it("local development may fetch the photo route over http on loopback", () => {
    expect(ok("http://localhost:3000/api/photos/onboarding-photos/x.png", dev)).toBe(true)
  })
})

describe("PDF render allow-list — blocked", () => {
  it.each([
    ["a client website logo (arbitrary host)", "https://millerheating.example/wp-content/logo.png"],
    ["a Higgsfield URL (AI photos are rehosted into Blob now)", "https://cdn.higgsfield.ai/results/img.webp"],
    ["our site, any path other than /api/photos/", "https://oneflyer.org/api/admin/users"],
    ["our site, the webhook", "https://oneflyer.org/api/stripe/webhook"],
    ["our site, path traversal out of /api/photos/", "https://oneflyer.org/api/photos/../admin/users"],
    ["cloud metadata endpoint", "http://169.254.169.254/latest/meta-data/"],
    ["localhost in production", "http://localhost:3000/api/photos/x.png"],
    ["look-alike host suffix", "https://fonts.googleapis.com.evil.example/css"],
    ["look-alike blob host", "https://blob.vercel-storage.com.evil.example/x.png"],
    ["unsplash over plain http", "http://images.unsplash.com/photo-1"],
    ["non-default port on an allowed host", "https://images.unsplash.com:8443/photo-1"],
    ["credentials in the URL", "https://user:pw@images.unsplash.com/photo-1"],
    ["javascript: URL", "javascript:alert(1)"],
    ["file: URL", "file:///etc/passwd"],
    ["unparseable", "not a url"],
  ])("%s", (_label, url) => expect(ok(url)).toBe(false))

  it("blocks any method but GET, even to allowed hosts", () => {
    expect(ok("https://fonts.googleapis.com/css2?family=Inter", prod, "POST")).toBe(false)
    expect(ok("https://oneflyer.org/api/photos/x.png", prod, "DELETE")).toBe(false)
  })

  it("loopback http is never allowed outside development", () => {
    expect(ok("http://localhost:3000/api/photos/x.png", { siteHosts: ["localhost:3000"] })).toBe(false)
  })
})
