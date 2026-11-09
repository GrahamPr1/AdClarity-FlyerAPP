import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { NopLangProvider, NopLanguageToggle } from "@/components/nop-i18n"
import { NopLeadForm } from "@/components/nop-lead-form"
import { tNop } from "@/lib/enterprise/nop-i18n"
import { nopLangForPage } from "@/lib/enterprise/nop-i18n/server"
import { NOP_ORG_NAME } from "@/lib/enterprise/nop-roster"
import { fillConsent, leadConsent } from "@/lib/enterprise/portal/lead-capture"
import { agentPageFor, approvedPackages } from "@/lib/enterprise/portal/agent-page"

// /p/{code} — an active Pro/Leader agent's personal page, behind the org's
// agentPage switch. Same code as their flyer QR (/a/{code}), never the Agent
// ID. Inactive, Basic, unknown, switched off, or a made-up code: the same
// notFound(), from metadata and page alike.
//
// Everything shown is the agent's own details, or org-approved text verbatim
// (packages, consent). The photo appears only while the org's photo switch is
// on. The lead form follows the same rule as the QR lead page: "Coming soon"
// until the consent text for this language is approved.
export const dynamic = "force-dynamic"

export async function generateMetadata({ params }: { params: Promise<{ code: string }> }): Promise<Metadata> {
  const { code } = await params
  const page = await agentPageFor(code).catch(() => null)
  if (!page) notFound()
  return { title: { absolute: `${page.name} · ${NOP_ORG_NAME}` }, robots: { index: false, follow: false } }
}

export default async function Page({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const page = await agentPageFor(code)
  if (!page) notFound()
  const { lang } = await nopLangForPage(null)
  const [packages, consent] = await Promise.all([approvedPackages(page.orgId, lang), page.leads ? leadConsent(page.orgId, lang) : null])
  const t = (k: Parameters<typeof tNop>[1], v?: Record<string, string>) => tNop(lang, k, v)
  const digits = page.phone.replace(/[^0-9+]/g, "")
  const action = "flex min-h-11 flex-1 items-center justify-center rounded-lg border border-border px-3 text-sm font-medium hover:bg-[var(--surface-soft)]"

  return (
    <main lang={lang} className="min-h-screen bg-background text-foreground">
      <NopLangProvider lang={lang}>
        <div className="mx-auto max-w-md px-4 pt-6 pb-16 sm:px-6">
          <div className="mb-6 flex items-center justify-between gap-3">
            {/* Program name stays English, as in Basic Benefits' Spanish masters. */}
            <p lang="en" className="text-xs uppercase tracking-widest text-muted-foreground">{NOP_ORG_NAME}</p>
            <NopLanguageToggle cookieOnly />
          </div>

          <section data-testid="agent-card" className="flex items-center gap-4">
            {page.photo && (
              // eslint-disable-next-line @next/next/no-img-element -- served by our own switch-checked route, never cached
              <img src={`/p/${encodeURIComponent(code)}/photo`} alt={t("apage.photo_alt", { name: page.name })} data-testid="agent-photo"
                className="h-20 w-20 shrink-0 rounded-full border border-border object-cover" />
            )}
            <div className="min-w-0">
              <h1 className="text-2xl">{page.name}</h1>
              {page.licenseStates.length > 0 && (
                <p data-testid="agent-states" className="mt-1 text-sm text-muted-foreground">{t("apage.licensed_in", { states: page.licenseStates.join(", ") })}</p>
              )}
            </div>
          </section>

          <a href={page.enrollUrl} data-testid="enroll-now"
            className="mt-6 flex min-h-14 w-full items-center justify-center rounded-xl bg-[var(--brand-teal-bright)] px-5 text-lg font-semibold text-[var(--primary-foreground)]">
            {t("lead.enroll_now")}
          </a>

          <div data-testid="agent-contact" className="mt-4 flex gap-2">
            {digits && <a href={`tel:${digits}`} className={action}>{t("apage.call")}</a>}
            {digits && <a href={`sms:${digits}`} className={action}>{t("apage.text")}</a>}
            {page.email && <a href={`mailto:${page.email}`} className={action}>{t("apage.email")}</a>}
          </div>
          <p className="mt-2 text-center text-sm text-muted-foreground">{[page.phone, page.email].filter(Boolean).join(" · ")}</p>
          {page.bookingUrl && (
            <a href={page.bookingUrl} target="_blank" rel="noopener noreferrer nofollow" data-testid="agent-booking"
              className="mt-3 flex min-h-11 w-full items-center justify-center rounded-lg border border-border px-3 text-sm font-medium hover:bg-[var(--surface-soft)]">
              {t("apage.book")}
            </a>
          )}

          {packages.length > 0 && (
            <section aria-labelledby="packages" data-testid="agent-packages" className="mt-10">
              <h2 id="packages" className="text-lg font-semibold">{t("apage.packages_title")}</h2>
              <ul className="mt-3 flex flex-col gap-3">
                {packages.map((p) => (
                  <li key={p.pkg} data-testid={`package-${p.pkg}`} className="rounded-2xl border border-border bg-card p-5">
                    <p className="font-semibold">{p.heading}</p>
                    {p.body && <p className="mt-1.5 whitespace-pre-wrap text-sm text-muted-foreground">{p.body}</p>}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {consent && (
            <section aria-labelledby="contact" className="mt-10">
              <h2 id="contact" className="text-lg font-semibold">{t("lead.page_title", { name: page.name })}</h2>
              {consent.pending ? (
                <div data-testid="lead-coming-soon" className="mt-4 rounded-2xl border border-border bg-card p-6">
                  <p className="font-semibold">{t("lead.coming_soon")}</p>
                  <p className="mt-2 text-sm text-muted-foreground">{t("lead.coming_soon_body")}</p>
                </div>
              ) : (
                <NopLeadForm code={code} agentName={page.name} consentText={fillConsent(consent.text, page.name)} consentVersion={consent.version} source="page" />
              )}
            </section>
          )}
        </div>
      </NopLangProvider>
    </main>
  )
}
