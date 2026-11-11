import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { NopLangProvider, NopLanguageToggle } from "@/components/nop-i18n"
import { NopLeadForm } from "@/components/nop-lead-form"
import { tNop } from "@/lib/enterprise/nop-i18n"
import { nopLangForPage } from "@/lib/enterprise/nop-i18n/server"
import { NOP_ORG_NAME } from "@/lib/enterprise/nop-roster"
import { fillConsent, leadConsent, smsConsent } from "@/lib/enterprise/portal/lead-capture"
import { CHECKIN_WINDOW_HOURS, checkInState, eventPageFor, formatEventWhen } from "@/lib/enterprise/portal/events"

// /e/{code}/checkin — the page people scan at the event (the agent's printable
// sign). Name and phone, the same consent box as the lead forms and the
// optional text-message box ("Coming soon" while the consent text is a
// placeholder). Open from CHECKIN_WINDOW_HOURS before the start to
// CHECKIN_WINDOW_HOURS after the end; otherwise it says when, or that it's
// over. Hidden by an admin: only "This event isn't available". Unknown code or
// inactive agent: notFound(). Not indexed.
export const dynamic = "force-dynamic"

export async function generateMetadata({ params }: { params: Promise<{ code: string }> }): Promise<Metadata> {
  const page = await eventPageFor((await params).code).catch(() => null)
  if (!page) notFound()
  return { title: { absolute: page.state === "hidden" ? NOP_ORG_NAME : `${page.event.title} · ${NOP_ORG_NAME}` }, robots: { index: false, follow: false } }
}

export default async function Page({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const now = new Date()
  const page = await eventPageFor(code, now)
  if (!page) notFound()
  const { lang } = await nopLangForPage(null)
  const t = (k: Parameters<typeof tNop>[1], v?: Record<string, string>) => tNop(lang, k, v)
  const state = checkInState(page, now)
  const [consent, sms] = state === "open" ? await Promise.all([leadConsent(page.orgId, lang), smsConsent(page.orgId, lang)]) : [null, null]
  const opensAt = formatEventWhen({ startsAt: new Date(Date.parse(page.event.startsAt) - CHECKIN_WINDOW_HOURS * 3600_000).toISOString(), timezone: page.event.timezone }, lang)
  const note = (testId: string, text: string) => <p role="status" data-testid={testId} className="mt-6 rounded-xl border border-border bg-card p-5 text-sm">{text}</p>

  return (
    <main lang={lang} className="min-h-screen bg-background text-foreground">
      <NopLangProvider lang={lang}>
        <div className="mx-auto max-w-md px-4 pt-6 pb-16 sm:px-6">
          <div className="mb-6 flex items-center justify-between gap-3">
            <p lang="en" className="text-xs uppercase tracking-widest text-muted-foreground">{NOP_ORG_NAME}</p>
            <NopLanguageToggle cookieOnly />
          </div>
          {state === "hidden" ? note("event-hidden", t("event.unavailable")) : (
            <>
              <p className="text-sm font-semibold uppercase tracking-widest text-[var(--brand-teal-bright)]">{t("checkin.eyebrow")}</p>
              <h1 className="mt-1 text-2xl" data-testid="checkin-title">{page.event.title}</h1>
              <p className="mt-1 text-sm text-muted-foreground">{formatEventWhen(page.event, lang)} · {page.event.locationName}</p>
              <p className="mt-1 text-sm text-muted-foreground">{t("event.host", { name: page.agentName })}</p>
              {state === "cancelled" && note("event-cancelled", t("event.cancelled"))}
              {state === "closed" && note("checkin-closed", t("event.rsvp_closed"))}
              {state === "not_yet" && note("checkin-not-yet", t("checkin.not_yet", { when: opensAt }))}
              {state === "over" && note("checkin-over", t("checkin.over"))}
              {consent && (consent.pending ? (
                <div data-testid="lead-coming-soon" className="mt-6 rounded-2xl border border-border bg-card p-6">
                  <p className="font-semibold">{t("lead.coming_soon")}</p>
                  <p className="mt-2 text-sm text-muted-foreground">{t("lead.coming_soon_body")}</p>
                </div>
              ) : (
                <NopLeadForm code={code} agentName={page.agentName} consentText={fillConsent(consent.text, page.agentName)} consentVersion={consent.version} source="checkin"
                  sms={sms && !sms.pending ? { text: fillConsent(sms.text, page.agentName), version: sms.version } : null} />
              ))}
            </>
          )}
        </div>
      </NopLangProvider>
    </main>
  )
}
