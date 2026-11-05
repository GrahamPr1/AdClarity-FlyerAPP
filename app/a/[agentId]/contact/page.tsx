import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { NopLangProvider, NopLanguageToggle } from "@/components/nop-i18n"
import { NopLeadForm } from "@/components/nop-lead-form"
import { tNop } from "@/lib/enterprise/nop-i18n"
import { nopLangForPage } from "@/lib/enterprise/nop-i18n/server"
import { NOP_ORG_NAME } from "@/lib/enterprise/nop-roster"
import { agentLeadCapture } from "@/lib/enterprise/portal/lead-capture"

// /a/{agentId}/contact — a NOP agent's public lead form. Public, no account.
// Only for an active Pro/Leader agent whose org has lead capture on; anyone
// else is a 404. While the consent text for the visitor's language is still
// the placeholder, it shows "Coming soon" and a button to the agent's
// enrollment page instead of the form: placeholder wording is never shown.
export const dynamic = "force-dynamic"

export async function generateMetadata({ params }: { params: Promise<{ agentId: string }> }): Promise<Metadata> {
  const { agentId } = await params
  const { lang } = await nopLangForPage(null)
  const capture = await agentLeadCapture(agentId, lang).catch(() => ({ state: "unavailable" as const }))
  const title = capture.state === "unavailable" ? NOP_ORG_NAME : tNop(lang, "lead.page_title", { name: capture.agentName })
  return { title: { absolute: title }, robots: { index: false, follow: false } }
}

export default async function Page({ params }: { params: Promise<{ agentId: string }> }) {
  const { agentId } = await params
  const { lang } = await nopLangForPage(null)
  const capture = await agentLeadCapture(agentId, lang)
  if (capture.state === "unavailable") notFound()

  return (
    <main lang={lang} className="min-h-screen bg-background text-foreground">
      <NopLangProvider lang={lang}>
        <div className="mx-auto max-w-md px-4 pt-6 pb-16 sm:px-6">
          <div className="mb-8 flex items-center justify-between gap-3">
            {/* Program name stays English, as in Basic Benefits' Spanish masters. */}
            <p lang="en" className="text-xs uppercase tracking-widest text-muted-foreground">{NOP_ORG_NAME}</p>
            <NopLanguageToggle cookieOnly />
          </div>
          <h1 className="text-2xl">{tNop(lang, "lead.page_title", { name: capture.agentName })}</h1>
          {capture.state === "coming_soon" ? (
            <section data-testid="lead-coming-soon" className="mt-6 rounded-2xl border border-border bg-card p-6">
              <p className="font-semibold">{tNop(lang, "lead.coming_soon")}</p>
              <p className="mt-2 text-sm text-muted-foreground">{tNop(lang, "lead.coming_soon_body")}</p>
              <a href={capture.enrollUrl} className="mt-5 inline-flex min-h-11 items-center rounded-lg bg-[var(--brand-teal-bright)] px-5 font-semibold text-[var(--primary-foreground)]">
                {tNop(lang, "lead.enroll")}
              </a>
            </section>
          ) : (
            <NopLeadForm agentId={capture.agentId} agentName={capture.agentName} consentText={capture.consent.text} consentVersion={capture.consent.version} />
          )}
        </div>
      </NopLangProvider>
    </main>
  )
}
