import { describe, it, expect } from "vitest"
import { buildSearchQuery } from "@/lib/unsplash"
import {
  injectPhotoAttribution,
  creditsUsedIn,
  preservePhotoCredit,
  type PhotoCredit,
} from "@/lib/agent-pipeline/flyer-html"

const CREDIT: PhotoCredit = {
  url: "https://images.unsplash.com/photo-abc?w=1080",
  photographerName: "Raze Solar",
  photographerUrl: "https://unsplash.com/@razesolar",
}

describe("buildSearchQuery", () => {
  it("keeps the concrete nouns and drops generative noise", () => {
    // The Higgsfield prompt is full of negative constraints ("no people, no
    // text") that are meaningless to a keyword search and actively harmful —
    // Unsplash would happily match the word "people".
    const q = buildSearchQuery({
      industry: "HVAC",
      purpose: "Fall furnace tune-up special, $89",
      services: ["Furnace repair", "AC installation"],
    })
    // Lowercased by design — Unsplash search is case-insensitive, and
    // normalising is what makes the near-duplicate collapse work.
    expect(q).toContain("hvac")
    expect(q).toContain("furnace")
    expect(q).not.toMatch(/no people|no text|documentary|lighting/i)
    expect(q).not.toContain("$")
  })

  it("drops filler words that would dilute the search", () => {
    const q = buildSearchQuery({ industry: "Roofing", purpose: "the best affordable service for your business", services: [] })
    expect(q.toLowerCase()).not.toContain("affordable")
    expect(q.toLowerCase()).not.toContain("business")
  })

  it("stays bounded even with a rambling offer", () => {
    const q = buildSearchQuery({ industry: "Dental", purpose: "x".repeat(400), services: ["cleaning"] })
    expect(q.length).toBeLessThanOrEqual(100)
  })
})

describe("creditsUsedIn", () => {
  it("credits only photos that actually reached the HTML", () => {
    // The Flyer Agent is explicitly allowed to use none of the photos it is
    // offered (rule 5 in prompts/flyer.ts). Crediting an unused photo would
    // be a false statement on a client's flyer, and would misreport usage to
    // Unsplash.
    const html = `<html><body><img src="${CREDIT.url}"></body></html>`
    const unused: PhotoCredit = { ...CREDIT, url: "https://images.unsplash.com/photo-zzz" }
    expect(creditsUsedIn(html, [CREDIT, unused])).toEqual([CREDIT])
  })

  it("returns nothing when the agent used no photo at all", () => {
    expect(creditsUsedIn("<html><body><h1>CSS only</h1></body></html>", [CREDIT])).toEqual([])
  })
})

describe("injectPhotoAttribution", () => {
  it("is a no-op with no credits, so CSS-only and Higgsfield flyers stay untouched", () => {
    const html = "<html><body><h1>hi</h1></body></html>"
    expect(injectPhotoAttribution(html, [], "print")).toBe(html)
  })

  it("prints plain text for print formats — a hyperlink on a door hanger credits nobody", () => {
    const out = injectPhotoAttribution("<html><body></body></html>", [CREDIT], "print")
    expect(out).toContain("Photo by Raze Solar on Unsplash")
    expect(out).not.toContain("<a ")
  })

  it("links the photographer and Unsplash on screen formats", () => {
    const out = injectPhotoAttribution("<html><body></body></html>", [CREDIT], "screen")
    // & is escaped to &amp; inside an attribute value — that is required
    // HTML, not a bug, so the expectation matches the escaped form.
    expect(out).toContain('href="https://unsplash.com/@razesolar?utm_source=oneflyer&amp;utm_medium=referral"')
    expect(out).toContain("unsplash.com/?utm_source=oneflyer&amp;utm_medium=referral")
    expect(out).toContain(">Raze Solar</a>")
  })

  it("goes inside </body> so it lands in the rendered document", () => {
    const out = injectPhotoAttribution("<html><body><h1>x</h1></body></html>", [CREDIT], "print")
    expect(out.indexOf("oneflyer-photo-credit")).toBeLessThan(out.indexOf("</body>"))
  })

  it("still attaches when the agent returned a fragment with no </body>", () => {
    expect(injectPhotoAttribution("<div>partial</div>", [CREDIT], "print")).toContain("Photo by Raze Solar")
  })

  it("escapes photographer names — this is third-party text going into HTML", () => {
    const nasty: PhotoCredit = { ...CREDIT, photographerName: '<script>alert(1)</script>' }
    const out = injectPhotoAttribution("<html><body></body></html>", [nasty], "print")
    expect(out).not.toContain("<script>alert(1)</script>")
    expect(out).toContain("&lt;script&gt;")
  })

  it("credits every photo when a flyer used more than one", () => {
    const second: PhotoCredit = { url: "https://images.unsplash.com/photo-2", photographerName: "Ada L", photographerUrl: "https://unsplash.com/@ada" }
    const out = injectPhotoAttribution("<html><body></body></html>", [CREDIT, second], "print")
    expect(out).toContain("Raze Solar")
    expect(out).toContain("Ada L")
  })
})

describe("preservePhotoCredit", () => {
  const credited = injectPhotoAttribution("<html><body><img></body></html>", [CREDIT], "print")

  it("restores a credit a refinement dropped", () => {
    const refined = "<html><body><img><h1>new headline</h1></body></html>"
    expect(preservePhotoCredit(credited, refined)).toContain("Photo by Raze Solar on Unsplash")
  })

  it("does not duplicate one the refinement kept", () => {
    const out = preservePhotoCredit(credited, credited)
    // Count the div, not the class name — the name also appears twice in
    // the injected <style> block.
    expect(out.match(/<div class="oneflyer-photo-credit"/g)?.length).toBe(1)
  })

  it("adds nothing when the original never had a credit", () => {
    const plain = "<html><body><h1>CSS only</h1></body></html>"
    expect(preservePhotoCredit(plain, plain)).toBe(plain)
  })
})
