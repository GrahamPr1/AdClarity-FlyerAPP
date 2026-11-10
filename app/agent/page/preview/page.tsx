import Link from "next/link"
import { redirect } from "next/navigation"
import { tNop } from "@/lib/enterprise/nop-i18n"
import { nopLangForPage } from "@/lib/enterprise/nop-i18n/server"
import { requirePortalPage } from "@/lib/enterprise/portal/page"
import { agentPagePreviewFor, approvedPackages } from "@/lib/enterprise/portal/agent-page"
import { NopAgentPageView } from "@/components/nop-agent-page-view"

export const dynamic = "force-dynamic"

export async function generateMetadata() {
  const { lang } = await nopLangForPage(null)
  return { title: tNop(lang, "pro.preview_title"), robots: { index: false, follow: false } }
}

/**
 * /agent/page/preview — what the agent's personal web page would look like,
 * with their real details, marked "Preview — available with Pro". Signed in
 * only (it's the portal), never public, no working form. Shown while the org
 * has the personal page switched on.
 */
export default async function Page() {
  const page = await requirePortalPage()
  const { ctx, lang } = page
  if (!ctx.orgFeatures.agentPage || !ctx.agent.active) redirect("/agent")
  const preview = await agentPagePreviewFor(ctx)
  const packages = await approvedPackages(preview.orgId, lang)
  return (
    <div>
      <div className="mx-auto max-w-md px-4 pt-4 sm:px-6">
        <Link href="/agent/pro" data-testid="preview-back" className="inline-flex min-h-11 items-center text-sm text-muted-foreground hover:text-foreground">{tNop(lang, "pro.preview_back")}</Link>
      </div>
      <NopAgentPageView page={preview} code="" lang={lang} packages={packages} consent={null} sms={null} mode="preview" />
    </div>
  )
}
