import Link from "next/link"
import { tNop, type NopStringKey } from "@/lib/enterprise/nop-i18n"
import { nopLangForPage } from "@/lib/enterprise/nop-i18n/server"
import { requirePortalPage } from "@/lib/enterprise/portal/page"
import type { AgentFeature } from "@/lib/enterprise/portal/features"
import { canBuyPro } from "@/lib/enterprise/portal/agent-billing"
import { ManageBilling, UpgradeToPro } from "@/components/nop-agent-billing"
import { PortalShell } from "../portal-shell"

export const dynamic = "force-dynamic"

export async function generateMetadata() {
  const { lang } = await nopLangForPage(null)
  return { title: tNop(lang, "pro.title") }
}

/**
 * What Pro gives an agent, organized around what it does for them, listing
 * only what their org has switched on. Plain and honest: no numbers, no
 * claims about income, prices or coverage. Every upgrade button links here.
 * The price is the agent Pro price; the Upgrade button offers the free trial
 * instead while it's on and unused (pro-trial.ts).
 */
const BENEFITS: { feature: AgentFeature; title: NopStringKey; body: NopStringKey }[] = [
  { feature: "leads", title: "pro.b_leads_title", body: "pro.b_leads_body" },
  { feature: "leads", title: "pro.b_track_title", body: "pro.b_track_body" },
  { feature: "followUpReminders", title: "pro.b_remind_title", body: "pro.b_remind_body" },
  { feature: "leads", title: "pro.b_inbox_title", body: "pro.b_inbox_body" },
  { feature: "agentPage", title: "pro.b_page_title", body: "pro.b_page_body" },
  { feature: "emailSignature", title: "pro.b_signature_title", body: "pro.b_signature_body" },
  { feature: "events", title: "pro.b_events_title", body: "pro.b_events_body" },
  { feature: "recruiting", title: "pro.b_team_title", body: "pro.b_team_body" },
  { feature: "results", title: "pro.b_results_title", body: "pro.b_results_body" },
]

export default async function Page() {
  const page = await requirePortalPage()
  const { ctx, lang, readOnly } = page
  const t = (k: NopStringKey, v?: Record<string, string>) => tNop(lang, k, v)
  const benefits = BENEFITS.filter((b) => ctx.orgFeatures[b.feature])
  const hasPro = ctx.tier !== "basic"
  const buy = canBuyPro(ctx)
  const preview = !hasPro && ctx.agent.active && ctx.orgFeatures.agentPage
  return (
    <PortalShell page={page} title={t("pro.title")} intro={t("pro.intro")}>
      <ul data-testid="pro-benefits" className="flex flex-col gap-3">
        {benefits.map((b) => (
          <li key={b.title} data-benefit={b.title} className="rounded-2xl border border-border bg-card p-5">
            <h2 className="font-semibold">{t(b.title)}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {t(b.body)}{b.feature === "results" && ctx.orgFeatures.monthlyEmail ? ` ${t("pro.b_results_monthly")}` : ""}
            </p>
          </li>
        ))}
      </ul>

      {preview && (
        <Link href="/agent/page/preview" data-testid="pro-preview-link" className="mt-4 inline-flex min-h-11 items-center text-sm font-medium text-[var(--brand-teal-bright)] underline-offset-2 hover:underline">
          {t("pro.preview_link")}
        </Link>
      )}

      <section aria-labelledby="pro-price" data-testid="pro-buy" className="mt-6 rounded-2xl border border-[var(--brand-teal-bright)] bg-card p-5">
        <h2 id="pro-price" className="font-semibold">{t("pro.price")}</h2>
        {hasPro ? (
          <>
            <p data-testid="pro-have" className="mt-1 text-sm text-muted-foreground">{t("pro.have_pro")}</p>
            {ctx.tier === "pro" && <div className="mt-3"><ManageBilling readOnly={readOnly} /></div>}
          </>
        ) : buy ? (
          <div className="mt-3"><UpgradeToPro readOnly={readOnly} /></div>
        ) : (
          <p data-testid="pro-cant-buy" className="mt-1 text-sm text-muted-foreground">{t("pro.cant_buy")}</p>
        )}
      </section>
    </PortalShell>
  )
}
