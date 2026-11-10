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

  it("is dated 10 November 2026 (event pages added)", () => {
    expect(html).toContain("Last updated 10 November 2026")
  })

  it("covers event pages, RSVPs and the day-before reminder, in English and Spanish", () => {
    expect(html).toContain("a page for an event they're hosting (oneflyer.org/e/…), where you can RSVP")
    expect(html).toContain("we send you one reminder email the day before the event")
    expect(html).toContain("la página de un evento que organizan (oneflyer.org/e/…)")
    expect(html).toContain("le enviamos un solo correo de recordatorio el día antes del evento")
  })

  it("has the agent-pages sections in English and Spanish, with the anchors the consent links to", () => {
    const raw = renderToStaticMarkup(PrivacyPage())
    expect(raw).toContain('id="agent-pages"')
    expect(raw).toContain('id="agent-pages-es"')
    expect(html).toContain("Information collected on agent pages")
    expect(html).toContain("Información recopilada en las páginas de agentes")
    expect(html).toContain("deleted automatically 12 months after the date they left")
    expect(html).not.toContain("Basic Benefits")
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
