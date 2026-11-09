import { redirect } from "next/navigation"
import { tNop } from "@/lib/enterprise/nop-i18n"
import { nopLangForPage } from "@/lib/enterprise/nop-i18n/server"
import { requirePortalPage } from "@/lib/enterprise/portal/page"
import { getAgentQrCode, getOrIssueAgentQrCode } from "@/lib/enterprise/nop-qr-code"
import { getAgentPageSettings, nopPageLink, NOP_PAGE_PATH } from "@/lib/enterprise/portal/agent-page"
import { ProLocked } from "@/components/nop-portal"
import { NopAgentPageSettings } from "@/components/nop-agent-page-settings"
import { PortalShell } from "../portal-shell"

export const dynamic = "force-dynamic"

export async function generateMetadata() {
  const { lang } = await nopLangForPage(null)
  return { title: tNop(lang, "portal.page_title") }
}

/**
 * The agent's personal page settings: its link and QR, the booking link, and
 * (only while the org's photo switch is on) the photo. Hidden entirely when the
 * org has the agent page off; a locked "Pro" screen for Basic; a status note
 * for an inactive Pro/Leader. An admin viewing as the agent sees it all
 * read-only, and their view never issues the agent a code.
 */
export default async function Page() {
  const page = await requirePortalPage()
  const { ctx, lang, readOnly } = page
  if (!ctx.orgFeatures.agentPage) redirect("/agent")
  return (
    <PortalShell page={page} title={tNop(lang, "portal.page_title")} intro={ctx.can.agentPage ? tNop(lang, "portal.page_intro") : undefined}>
      {ctx.can.agentPage ? (
        <Settings agentId={ctx.agent.agentId} readOnly={readOnly} photoAllowed={ctx.can.agentPhoto} />
      ) : ctx.tier !== "basic" && !ctx.active ? (
        <p data-testid="page-inactive" className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">{tNop(lang, "portal.page_inactive")}</p>
      ) : (
        <ProLocked sentence="portal.page_locked" />
      )}
    </PortalShell>
  )
}

async function Settings({ agentId, readOnly, photoAllowed }: { agentId: string; readOnly: boolean; photoAllowed: boolean }) {
  const code = readOnly ? await getAgentQrCode(agentId) : await getOrIssueAgentQrCode(agentId)
  const settings = await getAgentPageSettings(agentId)
  return (
    <NopAgentPageSettings
      link={code ? nopPageLink(code) : null}
      path={code ? `${NOP_PAGE_PATH}/${code}` : null}
      bookingUrl={settings.bookingUrl}
      hasPhoto={photoAllowed && !!settings.photo}
      photoAllowed={photoAllowed}
      readOnly={readOnly}
    />
  )
}
