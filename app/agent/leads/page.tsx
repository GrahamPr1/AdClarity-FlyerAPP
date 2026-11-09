import { redirect } from "next/navigation"
import { tNop } from "@/lib/enterprise/nop-i18n"
import { nopLangForPage } from "@/lib/enterprise/nop-i18n/server"
import { requirePortalPage } from "@/lib/enterprise/portal/page"
import { ProLocked } from "@/components/nop-portal"
import { NopAgentLeads } from "@/components/nop-agent-leads"
import { listAgentLeads } from "@/lib/enterprise/portal/agent-data"
import { followUpsForLeads } from "@/lib/enterprise/portal/follow-ups"
import type { PortalContext } from "@/lib/enterprise/portal/context"
import { PortalShell } from "../portal-shell"
import { canBuyPro } from "@/lib/enterprise/portal/agent-billing"

export const dynamic = "force-dynamic"

export async function generateMetadata() {
  const { lang } = await nopLangForPage(null)
  return { title: tNop(lang, "portal.leads_title") }
}

/**
 * Leads. Hidden entirely when the org has lead capture off; a short locked
 * "Pro" screen for Basic; a one-line status note for a Pro/Leader agent whose
 * roster record isn't active. Otherwise the list, newest first. Leads are
 * read only after canUse allows it.
 */
export default async function Page() {
  const page = await requirePortalPage()
  const { ctx, lang } = page
  if (!ctx.orgFeatures.leads) redirect("/agent")
  return (
    <PortalShell page={page} title={tNop(lang, "portal.leads_title")}>
      {ctx.can.leads ? (
        <LeadsList ctx={ctx} readOnly={page.readOnly} empty={tNop(lang, "portal.leads_empty")} />
      ) : ctx.tier !== "basic" && !ctx.active ? (
        <p data-testid="leads-inactive" className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">{tNop(lang, "portal.leads_inactive")}</p>
      ) : (
        <ProLocked sentence="portal.leads_locked" upgrade={canBuyPro(ctx)} readOnly={page.readOnly} />
      )}
    </PortalShell>
  )
}

async function LeadsList({ ctx, readOnly, empty }: { ctx: PortalContext; readOnly: boolean; empty: string }) {
  const leads = await listAgentLeads(ctx.agent.agentId)
  if (leads.length === 0) return <p data-testid="leads-empty" className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">{empty}</p>
  // Follow-ups only after canUse allows them (followUpsForLeads checks).
  return <NopAgentLeads leads={leads} followUps={await followUpsForLeads(ctx, leads)} readOnly={readOnly} />
}
