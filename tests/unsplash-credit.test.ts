import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { fillTemplate, TEMPLATES } from "@/lib/agent-pipeline/template-mode"
import { creditsUsedIn } from "@/lib/agent-pipeline/flyer-html"
import { applyPhotoObligations } from "@/lib/agent-pipeline/pipeline"
import type { UnsplashPhoto } from "@/lib/unsplash"

// A real Unsplash URL shape: the query string is what template-mode escapes.
const PHOTO: UnsplashPhoto = {
  id: "abc123",
  url: "https://images.unsplash.com/photo-1528698827591?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1080",
  photographerName: "Raze Solar",
  photographerUrl: "https://unsplash.com/@razesolar",
  downloadLocation: "https://api.unsplash.com/photos/abc123/download?ixid=xyz",
  description: "a storefront",
}

/** HTML exactly as the code-built templates write it (src attribute-escaped). */
function templateHtml(photoUrl: string | null) {
  return fillTemplate({
    template: TEMPLATES[0],
    headline: "Fall Furnace Tune-Up",
    supporting: "21-point safety check.",
    businessName: "Miller Heating & Air",
    phone: "(502) 555-0142",
    address: null,
    hasLogo: false,
    hasQr: false,
    photoUrl,
    colors: { primary: "#12314f", secondary: "#e8edf2", accent: "#e39a2b" },
    fonts: { heading: "Georgia, serif", body: "Georgia, serif" },
  }).html
}

describe("Unsplash credit on template-built flyers", () => {
  let fetchMock: ReturnType<typeof vi.fn>
  beforeEach(() => {
    vi.stubEnv("UNSPLASH_ACCESS_KEY", "test-key")
    fetchMock = vi.fn(async () => new Response("{}", { status: 200 }))
    vi.stubGlobal("fetch", fetchMock)
    vi.spyOn(console, "log").mockImplementation(() => {})
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it("the template really does write the URL escaped (the case that was missed)", () => {
    const html = templateHtml(PHOTO.url)
    expect(html).toContain("crop=entropy&amp;cs=tinysrgb")
    expect(html).not.toContain(PHOTO.url)
  })

  it("matches the escaped URL", () => {
    expect(creditsUsedIn(templateHtml(PHOTO.url), [PHOTO])).toEqual([PHOTO])
    // Raw (AI-written HTML) still matches too.
    expect(creditsUsedIn(`<img src="${PHOTO.url}">`, [PHOTO])).toEqual([PHOTO])
  })

  it("stamps the credit and fires the download ping for a used photo", async () => {
    const out = await applyPhotoObligations(templateHtml(PHOTO.url), [PHOTO], "flyer", "test")
    expect(out).toContain("Photo by Raze Solar on Unsplash")
    expect(out).toContain('class="oneflyer-photo-credit"')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toBe(PHOTO.downloadLocation)
  })

  it("still neither credits nor pings a photo the flyer doesn't use", async () => {
    const other = { ...PHOTO, id: "zzz", url: "https://images.unsplash.com/photo-zzz?w=1080&q=80" }
    const out = await applyPhotoObligations(templateHtml(PHOTO.url), [other], "flyer", "test")
    expect(out).not.toContain("oneflyer-photo-credit")
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
