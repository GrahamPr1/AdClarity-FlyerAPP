import { notFound } from "next/navigation"
import Link from "next/link"
import { tNop, type NopStringKey } from "@/lib/enterprise/nop-i18n"
import { nopLangForPage } from "@/lib/enterprise/nop-i18n/server"
import { isNopTemplate } from "@/lib/enterprise/nop-render/kit"
import { isNopV2Template } from "@/lib/enterprise/nop-render/kit-v2-ids"
import { agentMaySeeTemplate, getNopFlyerSettings } from "@/lib/enterprise/nop-render/kit-v2-access"
import { nopStatusMessageKey } from "@/lib/enterprise/nop-render/agent-context"
import { requirePortalPage } from "@/lib/enterprise/portal/page"
import { NopFlyerPreview } from "@/components/nop-dashboard"
import { flyerLabels } from "@/lib/enterprise/nop-render/flyer-labels"
import { PortalShell } from "../../portal-shell"
import { NopPrintRequest } from "@/components/nop-print-request"
import { canUse } from "@/lib/enterprise/portal/features"
import { canBuyPro } from "@/lib/enterprise/portal/agent-billing"

export const dynamic = "force-dynamic"

export async function generateMetadata() {
  const { lang } = await nopLangForPage(null)
  return { title: tNop(lang, "flyer.meta_title") }
}

/** One flyer: the agent's own preview, then the downloads. (Was /enterprise/nop/flyer/[template].) */
export default async function Page({ params }: { params: Promise<{ template: string }> }) {
  const { template } = await params
  // Only the kit agents are on (and Spanish kit v2 only once switched on), the same rule as the render route.
  if (!(isNopTemplate(template) || isNopV2Template(template)) || !agentMaySeeTemplate(template, await getNopFlyerSettings(), isNopTemplate(template))) notFound()
  const page = await requirePortalPage()
  const { ctx, lang } = page
  const flyerLang = template.split("_")[2]
  const labels = flyerLabels(template)
  const t = (k: NopStringKey) => tNop(lang, k)
  return (
    <PortalShell
      page={page}
      title={[t(labels.eyebrow), t(labels.name), labels.pricing && t(labels.pricing)].filter(Boolean).join(" · ")}
      intro={`${t("dash.flyer_lang")}: ${t(flyerLang === "EN" ? "dash.flyer_lang_en" : "dash.flyer_lang_es")}`}
    >
      <Link href="/agent/create" className="-mt-2 mb-4 inline-flex min-h-11 items-center text-sm text-muted-foreground hover:text-foreground">{t("flyer.back")}</Link>
      <NopFlyerPreview
        template={template}
        active={ctx.agent.active}
        statusKey={ctx.agent.active ? null : nopStatusMessageKey(ctx.agent.status)}
        agentName={ctx.agent.profile.displayName ?? ctx.agent.profile.name}
        readOnly={page.readOnly}
        upsell={canBuyPro(ctx) && ctx.orgFeatures.leads}
      />
      {canUse(ctx, "printRequests") && <NopPrintRequest template={template} readOnly={page.readOnly} />}
    </PortalShell>
  )
}
