import { redirect } from "next/navigation"
import { tNop } from "@/lib/enterprise/nop-i18n"
import { nopLangForPage } from "@/lib/enterprise/nop-i18n/server"
import { requirePortalPage } from "@/lib/enterprise/portal/page"
import { PortalShell } from "../portal-shell"

export const dynamic = "force-dynamic"

export async function generateMetadata() {
  const { lang } = await nopLangForPage(null)
  return { title: tNop(lang, "portal.team_title") }
}

/** Team: Leaders only, and only when the org has it on. Everyone else never sees the tab. */
export default async function Page() {
  const page = await requirePortalPage()
  if (!page.ctx.can.team) redirect("/agent")
  return (
    <PortalShell page={page} title={tNop(page.lang, "portal.team_title")}>
      <p data-testid="team-empty" className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">{tNop(page.lang, "portal.team_empty")}</p>
    </PortalShell>
  )
}
