import { redirect } from "next/navigation"
import { tNop } from "@/lib/enterprise/nop-i18n"
import { nopLangForPage } from "@/lib/enterprise/nop-i18n/server"
import { requirePortalPage } from "@/lib/enterprise/portal/page"
import { ProLocked } from "@/components/nop-portal"
import { PortalShell } from "../portal-shell"

export const dynamic = "force-dynamic"

export async function generateMetadata() {
  const { lang } = await nopLangForPage(null)
  return { title: tNop(lang, "portal.leads_title") }
}

/**
 * Leads. Hidden entirely when the org has lead capture off; a short locked
 * "Pro" screen for Basic. The list itself arrives in Phase 2, through
 * /api/enterprise/agent/leads, which refuses Basic agents on the server.
 */
export default async function Page() {
  const page = await requirePortalPage()
  const { ctx, lang } = page
  if (!ctx.orgFeatures.leads) redirect("/agent")
  return (
    <PortalShell page={page} title={tNop(lang, "portal.leads_title")}>
      {ctx.can.leads ? (
        <p data-testid="leads-empty" className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">{tNop(lang, "portal.leads_empty")}</p>
      ) : (
        <ProLocked sentence="portal.leads_locked" />
      )}
    </PortalShell>
  )
}
