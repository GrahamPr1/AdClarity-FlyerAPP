import { notFound } from "next/navigation"
import Link from "next/link"
import { tNop, type NopStringKey } from "@/lib/enterprise/nop-i18n"
import { nopLangForPage } from "@/lib/enterprise/nop-i18n/server"
import { isNopTemplate, templateParts } from "@/lib/enterprise/nop-render/kit"
import { nopStatusMessageKey } from "@/lib/enterprise/nop-render/agent-context"
import { requirePortalPage } from "@/lib/enterprise/portal/page"
import { NopFlyerPreview } from "@/components/nop-dashboard"
import { PortalShell } from "../../portal-shell"

export const dynamic = "force-dynamic"

export async function generateMetadata() {
  const { lang } = await nopLangForPage(null)
  return { title: tNop(lang, "flyer.meta_title") }
}

/** One flyer: the agent's own preview, then the downloads. (Was /enterprise/nop/flyer/[template].) */
export default async function Page({ params }: { params: Promise<{ template: string }> }) {
  const { template } = await params
  if (!isNopTemplate(template)) notFound()
  const page = await requirePortalPage()
  const { ctx, lang } = page
  const { pkg, lang: flyerLang } = templateParts(template)
  const t = (k: NopStringKey) => tNop(lang, k)
  return (
    <PortalShell
      page={page}
      title={`${t(`pkg.${pkg}` as NopStringKey)} · ${t(`pkg.${pkg}_name` as NopStringKey)}`}
      intro={`${t("dash.flyer_lang")}: ${t(flyerLang === "EN" ? "dash.flyer_lang_en" : "dash.flyer_lang_es")}`}
    >
      <Link href="/agent/create" className="-mt-2 mb-4 inline-flex min-h-11 items-center text-sm text-muted-foreground hover:text-foreground">{t("flyer.back")}</Link>
      <NopFlyerPreview
        template={template}
        active={ctx.agent.active}
        statusKey={ctx.agent.active ? null : nopStatusMessageKey(ctx.agent.status)}
        agentName={ctx.agent.profile.displayName ?? ctx.agent.profile.name}
        readOnly={page.readOnly}
      />
    </PortalShell>
  )
}
