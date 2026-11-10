import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { NopLangProvider, NopLanguageToggle } from "@/components/nop-i18n"
import { NopLeadForm } from "@/components/nop-lead-form"
import { tNop } from "@/lib/enterprise/nop-i18n"
import { nopLangForPage } from "@/lib/enterprise/nop-i18n/server"
import { NOP_ORG_NAME } from "@/lib/enterprise/nop-roster"
import { fillConsent, leadConsent, qrLanding, smsConsent } from "@/lib/enterprise/portal/lead-capture"

// /a/{code}/contact — option (a): where a QR scan lands instead of forwarding,
// only while qrLanding says "lead_page" (org switch on, active Pro/Leader agent
// with lead capture). Anyone else who opens it is sent where the QR would have
// sent them. "Enroll now" comes first: one tap to the same enrollment URL. The
// lead form sits below it; while the consent text for the visitor's language is
// still the placeholder, "Coming soon" stands in for the form.
// Not a scan: /a/{code} already counted it.
export const dynamic = "force-dynamic"

export async function generateMetadata({ params }: { params: Promise<{ code: string }> }): Promise<Metadata> {
  const { code } = await params
  const { lang } = await nopLangForPage(null)
  const landing = await qrLanding(code).catch(() => null)
  const title = landing?.state === "lead_page" ? tNop(lang, "lead.page_title", { name: landing.agentName }) : NOP_ORG_NAME
  return { title: { absolute: title }, robots: { index: false, follow: false } }
}

export default async function Page({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const { lang } = await nopLangForPage(null)
  const landing = await qrLanding(code)
  if (landing.state !== "lead_page") redirect(landing.target)
  const [consent, sms] = await Promise.all([leadConsent(landing.orgId, lang), smsConsent(landing.orgId, lang)])

  return (
    <main lang={lang} className="min-h-screen bg-background text-foreground">
      <NopLangProvider lang={lang}>
        <div className="mx-auto max-w-md px-4 pt-6 pb-16 sm:px-6">
          <div className="mb-6 flex items-center justify-between gap-3">
            {/* Program name stays English, as in Basic Benefits' Spanish masters. */}
            <p lang="en" className="text-xs uppercase tracking-widest text-muted-foreground">{NOP_ORG_NAME}</p>
            <NopLanguageToggle cookieOnly />
          </div>
          <a href={landing.enrollUrl} data-testid="enroll-now"
            className="flex min-h-14 w-full items-center justify-center rounded-xl bg-[var(--brand-teal-bright)] px-5 text-lg font-semibold text-[var(--primary-foreground)]">
            {tNop(lang, "lead.enroll_now")}
          </a>
          <h1 className="mt-10 text-2xl">{tNop(lang, "lead.page_title", { name: landing.agentName })}</h1>
          {consent.pending ? (
            <section data-testid="lead-coming-soon" className="mt-6 rounded-2xl border border-border bg-card p-6">
              <p className="font-semibold">{tNop(lang, "lead.coming_soon")}</p>
              <p className="mt-2 text-sm text-muted-foreground">{tNop(lang, "lead.coming_soon_body")}</p>
            </section>
          ) : (
            <NopLeadForm code={code} agentName={landing.agentName} consentText={fillConsent(consent.text, landing.agentName)} consentVersion={consent.version} sms={sms.pending ? null : { text: fillConsent(sms.text, landing.agentName), version: sms.version }} />
          )}
        </div>
      </NopLangProvider>
    </main>
  )
}
