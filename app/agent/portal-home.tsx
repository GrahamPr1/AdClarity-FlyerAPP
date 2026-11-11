import { tNop, type NopStringKey } from "@/lib/enterprise/nop-i18n"
import { nopStatusMessageKey } from "@/lib/enterprise/nop-render/agent-context"
import type { PortalPage } from "@/lib/enterprise/portal/page"
import type { AgentFeature } from "@/lib/enterprise/portal/features"
import { NopDashboard } from "@/components/nop-dashboard"
import { agentFlyerKit, getNopFlyerSettings } from "@/lib/enterprise/nop-render/kit-v2-access"
import { agentResults } from "@/lib/enterprise/portal/results"
import Link from "next/link"
import { PortalShell } from "./portal-shell"
import { canBuyPro, getAgentBilling } from "@/lib/enterprise/portal/agent-billing"
import { getAgentTierSource } from "@/lib/enterprise/portal/store"
import { ManageBilling, UpgradeToPro } from "@/components/nop-agent-billing"
import { getRosterRecord } from "@/lib/enterprise/agents-store"
import { flyerLabels } from "@/lib/enterprise/nop-render/flyer-labels"
import { pickTemplate, picksForMember } from "@/lib/enterprise/portal/team"

// What a Basic agent's one line about Pro may mention: only features their org
// has switched on, so it never advertises something they couldn't get.
const PRO_WORDS: [AgentFeature, NopStringKey][] = [
  ["results", "portal.pro_word_results"],
  ["leads", "portal.pro_word_leads"],
  ["events", "portal.pro_word_events"],
  ["recruiting", "portal.pro_word_recruiting"],
]

/** /agent for a signed-in agent: their ready-to-use flyers; this month's results for Pro/Leader only. */
export async function PortalHome({ page, billingNotice = null }: { page: PortalPage; billingNotice?: "success" | "cancelled" | null }) {
  const { ctx, lang, readOnly } = page
  // Agent Pro billing: what Stripe last told us (agent-billing.ts), and whether they may buy.
  const [billing, tierSource] = await Promise.all([getAgentBilling(ctx.email), getAgentTierSource(ctx.email)])
  const paidByStripe = tierSource === "stripe" && !!billing?.subscriptionId
  const upgrade = canBuyPro(ctx)
  const date = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(lang === "es" ? "es-US" : "en-US", { month: "long", day: "numeric", year: "numeric" }) : "")
  // Read only when canUse says so: a Basic or inactive agent's numbers are never even loaded.
  const results = ctx.can.results ? await agentResults(ctx.agent.agentId) : null
  const kit = agentFlyerKit(await getNopFlyerSettings())
  // Flyers this agent's team Leader sent to the team (team.ts), for approved agents only.
  const fromLeader = ctx.agent.active ? await picksForMember((await getRosterRecord(ctx.agent.agentId))?.recruitedBy) : null
  const leaderFlyers = (fromLeader?.picks ?? []).flatMap((p) => {
    const template = pickTemplate(p, kit, lang)
    return template ? [{ id: p.id, template }] : []
  })
  const t = (k: NopStringKey, v?: Record<string, string>) => tNop(lang, k, v)
  const words = ctx.tier === "basic" ? PRO_WORDS.filter(([f]) => ctx.orgFeatures[f]).map(([, k]) => t(k)) : []
  const list = words.length > 1 ? `${words.slice(0, -1).join(", ")} ${t("portal.and")} ${words[words.length - 1]}` : words[0]

  return (
    <PortalShell page={page} title={t("portal.home_title")} intro={t("portal.home_intro")}>
      {billingNotice && (
        <p role="status" data-testid="billing-notice" className="mb-6 rounded-xl border border-border bg-[var(--surface-soft)] p-4 text-sm">
          {t(billingNotice === "success" ? "portal.billing_success" : "portal.billing_cancelled_checkout")}
        </p>
      )}
      {ctx.tier === "basic" && ctx.agent.active && (
        // Basic: what Pro does, the price and the button, always first. Never blocks anything below.
        <section aria-labelledby="upgrade" data-testid="home-upgrade-card" className="mb-6 rounded-2xl border border-[var(--brand-teal-bright)] bg-card p-5">
          <span className="inline-flex rounded-full bg-[var(--brand-teal-bright)] px-2.5 py-0.5 text-xs font-semibold text-[var(--primary-foreground)]">{t("portal.pro_label")}</span>
          <h2 id="upgrade" className="mt-2 font-semibold">{t("pro.home_card_title")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{ctx.orgFeatures.leads ? t("pro.home_card_body") : list ? t("portal.pro_line", { list }) : ""}</p>
          <p data-testid="home-upgrade-price" className="mt-2 text-sm font-medium">{t("pro.price")}</p>
          {upgrade ? (
            <div data-testid="home-upgrade" className="mt-3"><UpgradeToPro readOnly={readOnly} /></div>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">{t("pro.cant_buy")}</p>
          )}
          <Link href="/agent/pro" data-testid="home-upgrade-more" className="mt-2 inline-flex min-h-11 items-center text-sm font-medium text-[var(--brand-teal-bright)] underline-offset-2 hover:underline">{t("pro.see_all")}</Link>
        </section>
      )}
      {paidByStripe && (
        <section aria-labelledby="billing" data-testid="home-billing" className="mb-6 rounded-2xl border border-border bg-card p-5">
          <h2 id="billing" className="font-semibold">{t("portal.billing_title")}</h2>
          <p data-testid="billing-status" className="mt-1 text-sm text-muted-foreground">
            {billing!.status === "past_due" ? t("portal.billing_past_due")
              : billing!.cancelAtPeriodEnd && ctx.tier === "pro" ? t("portal.billing_cancels", { date: date(billing!.currentPeriodEnd) })
              : ctx.tier === "pro" ? t("portal.billing_active", { date: date(billing!.currentPeriodEnd) })
              : null}
          </p>
          <div className="mt-3"><ManageBilling readOnly={readOnly} /></div>
        </section>
      )}
      {results && (
        <section aria-labelledby="results" data-testid="home-results" className="mb-6 rounded-2xl border border-border bg-card p-5">
          <h2 id="results" className="font-semibold">{t("portal.results_title")}</h2>
          {results.scans + results.leads + results.contacted + results.appointments + results.enrolled === 0 ? (
            <p className="mt-1 text-sm text-muted-foreground">{t("portal.results_empty")}</p>
          ) : (
            <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {([
                ...(ctx.can.leads ? [
                  ["results-leads", "portal.results_leads", results.leads],
                  ["results-contacted", "results.contacted", results.contacted],
                  ["results-appointments", "results.appointments", results.appointments],
                  ["results-enrolled", "results.enrolled", results.enrolled],
                ] : []),
                ["results-scans", "portal.results_scans", results.scans],
              ] as [string, NopStringKey, number][]).map(([id, label, n]) => (
                <div key={id} data-testid={id}><dt className="text-xs text-muted-foreground">{t(label)}</dt><dd className="text-2xl font-semibold tabular-nums">{n}</dd></div>
              ))}
            </dl>
          )}
        </section>
      )}
      {ctx.can.agentPage && (
        <section aria-labelledby="my-page" data-testid="home-page-card" className="mb-6 rounded-2xl border border-border bg-card p-5">
          <h2 id="my-page" className="font-semibold">{t("portal.page_title")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("portal.page_card_body")}</p>
          <Link href="/agent/page" className="mt-3 inline-flex min-h-11 items-center justify-center rounded-lg border border-border px-4 text-sm font-medium hover:bg-[var(--surface-soft)]">
            {t("portal.page_share")}
          </Link>
        </section>
      )}
      {fromLeader && leaderFlyers.length > 0 && (
        <section aria-labelledby="from-leader" data-testid="home-from-leader" className="mb-6 rounded-2xl border border-border bg-card p-5">
          <h2 id="from-leader" className="font-semibold">{t("team.home_title", { name: fromLeader.leaderName })}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("team.home_intro")}</p>
          <ul className="mt-3 divide-y divide-border">
            {leaderFlyers.map((f) => {
              const l = flyerLabels(f.template)
              return (
                <li key={f.id}>
                  <Link href={`/agent/create/${f.template}`} data-template={f.template} className="flex min-h-11 flex-wrap items-center justify-between gap-2 py-2 hover:underline">
                    <span><span className="block text-xs uppercase tracking-widest text-muted-foreground">{t(l.eyebrow)}</span><span className="font-medium">{t(l.name)}</span>{l.pricing && <span className="block text-sm text-muted-foreground">{t(l.pricing)}</span>}</span>
                  </Link>
                </li>
              )
            })}
          </ul>
        </section>
      )}
      {!ctx.can.agentPage && ctx.tier === "basic" && ctx.agent.active && ctx.orgFeatures.agentPage && (
        // Basic: what the personal page would do, a preview of theirs, and what Pro does. Never blocks.
        <section aria-labelledby="my-page-locked" data-testid="home-page-locked" className="mb-6 rounded-2xl border border-border bg-card p-5">
          <span className="inline-flex rounded-full bg-[var(--brand-teal-bright)] px-2.5 py-0.5 text-xs font-semibold text-[var(--primary-foreground)]">{t("portal.pro_label")}</span>
          <h2 id="my-page-locked" className="mt-2 font-semibold">{t("portal.page_title")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("pro.page_locked")}</p>
          <div className="mt-3 flex flex-wrap gap-x-4">
            <Link href="/agent/page/preview" data-testid="home-page-preview" className="inline-flex min-h-11 items-center text-sm font-medium text-[var(--brand-teal-bright)] underline-offset-2 hover:underline">{t("pro.preview_link")}</Link>
            <Link href="/agent/pro" className="inline-flex min-h-11 items-center text-sm font-medium text-[var(--brand-teal-bright)] underline-offset-2 hover:underline">{t("pro.see_all")}</Link>
          </div>
        </section>
      )}
      <NopDashboard active={ctx.agent.active} statusKey={ctx.agent.active ? null : nopStatusMessageKey(ctx.agent.status)} readOnly={readOnly} kit={kit} upsell={upgrade && ctx.orgFeatures.leads} />
    </PortalShell>
  )
}
