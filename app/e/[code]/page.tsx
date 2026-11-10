import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { NopLangProvider, NopLanguageToggle } from "@/components/nop-i18n"
import { NopLeadForm } from "@/components/nop-lead-form"
import { tNop } from "@/lib/enterprise/nop-i18n"
import { nopLangForPage } from "@/lib/enterprise/nop-i18n/server"
import { NOP_ORG_NAME } from "@/lib/enterprise/nop-roster"
import { fillConsent, leadConsent, smsConsent } from "@/lib/enterprise/portal/lead-capture"
import { eventPageFor, formatEventWhen } from "@/lib/enterprise/portal/events"

// /e/{code} — an agent's event page (lib/enterprise/portal/events.ts): what,
// when (in the event's time zone), where, who's hosting, and the RSVP form
// with the same consent checkbox as the lead forms ("Coming soon" until the
// consent text is approved). Cancelled or over: said so, no form. Hidden by
// an admin: only "This event isn't available", nothing of the event. Unknown
// code, or the agent isn't active: notFound(). Not indexed.
export const dynamic = "force-dynamic"

export async function generateMetadata({ params }: { params: Promise<{ code: string }> }): Promise<Metadata> {
  const page = await eventPageFor((await params).code).catch(() => null)
  if (!page) notFound()
  return { title: { absolute: page.state === "hidden" ? NOP_ORG_NAME : `${page.event.title} · ${NOP_ORG_NAME}` }, robots: { index: false, follow: false } }
}

export default async function Page({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const page = await eventPageFor(code)
  if (!page) notFound()
  const { lang } = await nopLangForPage(null)
  const t = (k: Parameters<typeof tNop>[1], v?: Record<string, string>) => tNop(lang, k, v)
  if (page.state === "hidden") {
    return (
      <main lang={lang} className="min-h-screen bg-background text-foreground">
        <NopLangProvider lang={lang}>
          <div className="mx-auto max-w-md px-4 pt-6 pb-16 sm:px-6">
            <div className="mb-6 flex items-center justify-between gap-3">
              <p lang="en" className="text-xs uppercase tracking-widest text-muted-foreground">{NOP_ORG_NAME}</p>
              <NopLanguageToggle cookieOnly />
            </div>
            <p role="status" data-testid="event-hidden" className="rounded-xl border border-border bg-card p-5">{t("event.unavailable")}</p>
          </div>
        </NopLangProvider>
      </main>
    )
  }
  const { event } = page
  const [consent, sms] = page.open ? await Promise.all([leadConsent(page.orgId, lang), smsConsent(page.orgId, lang)]) : [null, null]
  const digits = page.phone.replace(/[^0-9+]/g, "")
  const place = [event.locationName, event.address].filter(Boolean).join(", ")
  const map = event.address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place)}` : null

  return (
    <main lang={lang} className="min-h-screen bg-background text-foreground">
      <NopLangProvider lang={lang}>
        <div className="mx-auto max-w-md px-4 pt-6 pb-16 sm:px-6">
          <div className="mb-6 flex items-center justify-between gap-3">
            <p lang="en" className="text-xs uppercase tracking-widest text-muted-foreground">{NOP_ORG_NAME}</p>
            <NopLanguageToggle cookieOnly />
          </div>
          <h1 className="text-2xl" data-testid="event-title">{event.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("event.host", { name: page.agentName })}</p>
          {page.state === "cancelled" && <p role="status" data-testid="event-cancelled" className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100">{t("event.cancelled")}</p>}
          {page.state === "ended" && <p role="status" data-testid="event-ended" className="mt-4 rounded-xl border border-border bg-card p-4 text-sm">{t("event.ended")}</p>}
          <dl className="mt-6 flex flex-col gap-3 rounded-2xl border border-border bg-card p-5 text-sm">
            <div><dt className="text-xs uppercase tracking-widest text-muted-foreground">{t("event.when")}</dt><dd className="mt-1 font-medium" data-testid="event-when">{formatEventWhen(event, lang)}</dd></div>
            <div><dt className="text-xs uppercase tracking-widest text-muted-foreground">{t("event.where")}</dt>
              <dd className="mt-1 font-medium">{map ? <a href={map} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">{place}</a> : place}</dd></div>
          </dl>
          {event.details && <p className="mt-4 whitespace-pre-wrap text-sm">{event.details}</p>}
          <p className="mt-4 text-sm text-muted-foreground">
            {digits && <a href={`tel:${digits}`} className="underline underline-offset-2">{page.phone}</a>}{digits && page.email && " · "}
            {page.email && <a href={`mailto:${page.email}`} className="underline underline-offset-2">{page.email}</a>}
          </p>

          {page.state === "closed" && <p data-testid="event-closed" className="mt-8 text-sm text-muted-foreground">{t("event.rsvp_closed")}</p>}
          {consent && (
            <section aria-labelledby="rsvp" className="mt-10">
              <h2 id="rsvp" className="text-lg font-semibold">{t("event.rsvp_title")}</h2>
              {consent.pending ? (
                <div data-testid="lead-coming-soon" className="mt-4 rounded-2xl border border-border bg-card p-6">
                  <p className="font-semibold">{t("lead.coming_soon")}</p>
                  <p className="mt-2 text-sm text-muted-foreground">{t("lead.coming_soon_body")}</p>
                </div>
              ) : (
                <NopLeadForm code={code} agentName={page.agentName} consentText={fillConsent(consent.text, page.agentName)} consentVersion={consent.version} source="event" sms={sms && !sms.pending ? { text: fillConsent(sms.text, page.agentName), version: sms.version } : null} />
              )}
            </section>
          )}
        </div>
      </NopLangProvider>
    </main>
  )
}
