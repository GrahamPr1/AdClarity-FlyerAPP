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

  it("is dated 11 November 2026 (lead tracker added)", () => {
    expect(html).toContain("Last updated 11 November 2026")
  })

  it("says honestly that the business site uses GA and the Meta Pixel, and agent/program pages neither; no 'no advertising' claims left", () => {
    expect(html).toContain("we use two tools to understand visits and measure our ads")
    expect(html).toContain("to measure how our ads on Facebook and Instagram perform")
    expect(html).toContain("the pixel may send it to Meta in a scrambled (hashed) form")
    expect(html).toContain("We may also use these visits to show our ads to people who have visited the site.")
    expect(html).toContain("Google Analytics, Google Tag Manager and the Meta Pixel don't run on the agent portal")
    expect(html).toContain("the Meta Pixel on OneFlyer's own website, to measure our ads on Facebook and Instagram")
    expect(html).not.toMatch(/no advertising trackers|runs no advertising|no ad retargeting/i)
  })

  it("covers the daily follow-up reminder (EN and ES)", () => {
    expect(html).toContain("and a morning reminder on days when some of your leads need follow-up, listing them. You can turn either one off in your profile.")
    expect(html).toContain("y un recordatorio por la mañana los días en que algunos de sus contactos necesitan seguimiento")
    expect(html).toContain("whether you've turned off the monthly results email or the daily follow-up reminder")
    expect(html).toContain("si desactivó el correo mensual de resultados o el recordatorio diario de seguimiento")
  })

  it("covers the agent's statuses, follow-up dates and notes (EN and ES)", () => {
    expect(html).toContain("a status (for example, contacted, appointment set or enrolled), a date to follow up, and private notes")
    expect(html).toContain("un estado (por ejemplo, contactado, cita programada o inscrito), una fecha para dar seguimiento y notas privadas")
    expect(html).toContain("the statuses, follow-up dates and private notes you add to your leads")
    expect(html).toContain("los estados, las fechas de seguimiento y las notas privadas que agrega a sus contactos")
  })

  it("covers SMS consent, log redaction and the download record (EN and ES)", () => {
    expect(html).toContain("Some forms have a second, optional box to agree to get text messages")
    expect(html).toContain("Algunos formularios tienen una segunda casilla, opcional")
    expect(html).toContain("with your name, phone number and email address removed: your Agent ID")
    expect(html).toContain("sin su nombre, su número de teléfono ni su correo electrónico: su número de agente")
    expect(html).toContain("with your Agent ID only (no name or email address)")
    expect(html).toContain("solo con su número de agente (sin su nombre ni su correo electrónico)")
  })

  it("has the Agent accounts section in English and Spanish, and says agent/program pages run no GA or GTM", () => {
    const raw = renderToStaticMarkup(PrivacyPage())
    expect(raw).toContain('id="agent-accounts"')
    expect(raw).toContain('id="agent-accounts-es"')
    expect(html).toContain("Twelve months after you leave, we delete your account automatically")
    expect(html).toContain("Doce meses después de que salga, eliminamos su cuenta automáticamente")
    expect(html).toContain("Program and agent pages are different. Google Analytics, Google Tag Manager and the Meta Pixel don't run on the agent portal")
    expect(raw).toContain('href="mailto:support@oneflyer.org"')
    expect(html).not.toMatch(/Basic Benefits/)
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
