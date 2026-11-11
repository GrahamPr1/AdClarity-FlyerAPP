import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { NopAgentPageView } from "@/components/nop-agent-page-view"
import { nopLangForPage } from "@/lib/enterprise/nop-i18n/server"
import { NOP_ORG_NAME } from "@/lib/enterprise/nop-roster"
import { leadConsent, smsConsent } from "@/lib/enterprise/portal/lead-capture"
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
  const [packages, consent, sms] = await Promise.all([approvedPackages(page.orgId, lang), page.leads ? leadConsent(page.orgId, lang) : null, page.leads ? smsConsent(page.orgId, lang) : null])
  return <NopAgentPageView page={page} code={code} lang={lang} packages={packages} consent={consent} sms={sms} />
}
