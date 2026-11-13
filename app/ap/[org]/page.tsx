import { cookies } from "next/headers"
import { notFound, redirect } from "next/navigation"
import { getAgent, getOrgBySlug, getOrIssueQrCode, getOrIssueRecruitCode } from "@/lib/ap/store"
import { readApSession } from "@/lib/ap/session"
import { tenantDecision } from "@/lib/ap/tenant"
import { apDict } from "@/lib/ap/i18n"
import { enrollmentUrlFor } from "@/lib/ap/validate"
import { qrLink, recruitLink } from "@/lib/ap/links"
import { ApSignOut } from "@/components/ap-sign-out"

// /ap/{org} — the agent portal. Same tenant rule as the API (tenantDecision):
// only an active agent of THIS org with a valid ap_session sees it; anyone
// else is sent to this org's sign-in. Flyers arrive with the slot work.
export const dynamic = "force-dynamic"

export default async function PortalPage({ params }: { params: Promise<{ org: string }> }) {
  const org = await getOrgBySlug((await params).org)
  if (!org) notFound()
  const session = readApSession(await cookies())
  const agent = session && session.orgId === org.id ? await getAgent(session.agentId) : null
  if (tenantDecision(org, session, agent) !== 200 || !agent) redirect(`/ap/${org.slug}/sign-in`)

  const t = apDict(agent.lang, { org: org.name })
  const [qr, recruit] = await Promise.all([getOrIssueQrCode(agent), getOrIssueRecruitCode(agent)])
  const rows: [string, string][] = [
    [t["portal.agent_id"], agent.externalId],
    [t["portal.enroll_link"], enrollmentUrlFor(org.enrollment, agent.externalId)],
    [t["portal.qr_link"], qrLink(qr)],
    [t["portal.recruit_link"], recruitLink(org, recruit)],
  ]
  return (
    <main className="mx-auto max-w-2xl px-4 py-10" data-testid="ap-portal" data-agent-id={agent.agentId} data-org-id={org.id}>
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">{t["portal.title"]}</h1>
        <ApSignOut slug={org.slug} label={t["btn.signout"]} />
      </div>
      <p className="mt-1 text-muted-foreground">{agent.name} · {agent.email}</p>
      <dl className="mt-6 divide-y rounded-md border">
        {rows.map(([k, v]) => (
          <div key={k} className="grid gap-1 p-3 sm:grid-cols-3">
            <dt className="text-sm text-muted-foreground">{k}</dt>
            <dd className="break-all text-sm sm:col-span-2">{v}</dd>
          </div>
        ))}
      </dl>
      <h2 className="mt-8 text-lg font-semibold">{t["portal.flyers"]}</h2>
      <p className="mt-2 text-sm text-muted-foreground">{t["portal.flyers_pending"]}</p>
    </main>
  )
}
