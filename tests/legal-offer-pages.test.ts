import { describe, it, expect } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import PrivacyPage from "@/app/privacy/page"
import TermsPage from "@/app/terms/page"

/** The Privacy and Terms additions for offer-page leads render where they belong. */
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;|&apos;/g, "'").replace(/\s+/g, " ")

describe("Privacy Policy", () => {
  const html = text(renderToStaticMarkup(PrivacyPage()))

  it("has the offer-pages section, with the approved deletion wording", () => {
    for (const s of [
      "Information collected on offer pages",
      "along with the date and time of your submission and which offer it was for",
      "We do not sell your information, share it with other businesses, or use it for our own marketing.",
      "It is not stored with your submission.",
      "until the business deletes them or asks us to delete its OneFlyer account, at which point they are deleted",
      "Scan counts are not linked to your name or contact details.",
    ]) expect(html).toContain(s)
  })

  it("no longer says visitors aren't asked for anything", () => {
    expect(html).not.toContain("Visitors are not asked for anything")
    expect(html).not.toContain("closes its OneFlyer account")
  })

  it("is dated 3 November 2026", () => {
    expect(html).toContain("Last updated 3 November 2026")
  })
})

describe("Terms of Service", () => {
  const html = text(renderToStaticMarkup(TermsPage()))

  it("has Customer leads under What you're responsible for", () => {
    const section = html.indexOf("What you're responsible for")
    const lead = html.indexOf("Customer leads.")
    const next = html.indexOf("What we won't generate")
    expect(section).toBeGreaterThan(-1)
    expect(lead).toBeGreaterThan(section)
    expect(lead).toBeLessThan(next)
    expect(html).toContain("honoring requests to stop contacting them or to delete their information")
  })
})
