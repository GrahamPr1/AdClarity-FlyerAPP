import { describe, it, expect } from "vitest"
import { encodeFlyerHtml, decodeFlyerHtml } from "@/lib/flyer-data-url"
import { fillTemplate, TEMPLATES } from "@/lib/agent-pipeline/template-mode"
import { injectPhotoAttribution } from "@/lib/agent-pipeline/flyer-html"
import { findUncreditedUnsplash, photoSlug, searchFromIxid, unsplashPhotoUrls } from "../scripts/lib/unsplash-credit-scan"

// A real stored URL (Preview, 2026-10-23), found by the "storefront" fallback search.
const URL_ =
  "https://images.unsplash.com/photo-1528698827591-e19ccd7bc23d?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3wxMDYxOTk4fDB8MXxzZWFyY2h8MXx8c3RvcmVmcm9udHxlbnwxfDB8fHwxNzkyNzYzOTAxfDA&ixlib=rb-4.1.0&q=80&w=1080"

const templateHtml = fillTemplate({
  template: TEMPLATES[0],
  headline: "Fall Tune-Up",
  supporting: "21-point check.",
  businessName: "Miller Heating & Air",
  phone: "(502) 555-0142",
  address: null,
  hasLogo: false,
  hasQr: false,
  photoUrl: URL_,
  colors: { primary: "#12314f", secondary: "#e8edf2", accent: "#e39a2b" },
  fonts: { heading: "Georgia, serif", body: "Georgia, serif" },
}).html

describe("unsplash credit scan", () => {
  it("recovers the search an Unsplash photo came from", () => {
    expect(searchFromIxid(URL_)).toEqual({ query: "storefront", position: 1 })
    expect(searchFromIxid("https://images.unsplash.com/photo-1?w=1080")).toBeNull()
    expect(photoSlug(URL_)).toBe("photo-1528698827591-e19ccd7bc23d")
  })

  it("finds escaped and raw photo URLs, decoded", () => {
    expect(unsplashPhotoUrls(templateHtml)).toEqual([URL_])
    expect(unsplashPhotoUrls(`<div style="background:url('${URL_}')"></div>`)).toEqual([URL_])
  })

  it("flags a stored template flyer with a photo and no credit, dated by its campaign", () => {
    const flyer = { id: "f1", generationMode: "template" as const, downloadUrl: encodeFlyerHtml(templateHtml) }
    const campaigns = [{ id: "c1", createdAt: "2026-10-01T00:00:00Z", flyerIds: ["f1"], formatId: "door-hanger" }]
    expect(findUncreditedUnsplash(flyer, campaigns, decodeFlyerHtml)).toEqual([
      { document: "downloadUrl", hasUnsplash: true, uncredited: true, photoUrls: [URL_], createdAt: "2026-10-01T00:00:00Z", formatId: "door-hanger", mode: "template" },
    ])
  })

  it("does not flag a credited flyer or one without a photo", () => {
    const credited = injectPhotoAttribution(templateHtml, [{ url: URL_, photographerName: "A", photographerUrl: "https://unsplash.com/@a" }], "print")
    const none = encodeFlyerHtml("<html><body><h1>CSS only</h1></body></html>")
    expect(findUncreditedUnsplash({ id: "f", downloadUrl: encodeFlyerHtml(credited) }, [], decodeFlyerHtml)[0].uncredited).toBe(false)
    expect(findUncreditedUnsplash({ id: "f", downloadUrl: none }, [], decodeFlyerHtml)[0]).toMatchObject({ hasUnsplash: false, uncredited: false, createdAt: null })
  })
})
