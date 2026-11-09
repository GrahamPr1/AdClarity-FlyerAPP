import { tNop, type NopStringKey } from "@/lib/enterprise/nop-i18n"
import { nopStatusMessageKey } from "@/lib/enterprise/nop-render/agent-context"
import type { PortalPage } from "@/lib/enterprise/portal/page"
import type { AgentFeature } from "@/lib/enterprise/portal/features"
import { NopDashboard } from "@/components/nop-dashboard"
import { agentFlyerKit, getNopFlyerSettings } from "@/lib/enterprise/nop-render/kit-v2-access"
import { agentResults } from "@/lib/enterprise/portal/results"
import { PortalShell } from "./portal-shell"

// What a Basic agent's one line about Pro may mention: only features their org
// has switched on, so it never advertises something they couldn't get.
const PRO_WORDS: [AgentFeature, NopStringKey][] = [
  ["results", "portal.pro_word_results"],
  ["leads", "portal.pro_word_leads"],
  ["events", "portal.pro_word_events"],
  ["recruiting", "portal.pro_word_recruiting"],
]

/** /agent for a signed-in agent: their ready-to-use flyers; this month's results for Pro/Leader only. */
export async function PortalHome({ page }: { page: PortalPage }) {
  const { ctx, lang, readOnly } = page
  // Read only when canUse says so: a Basic or inactive agent's numbers are never even loaded.
  const results = ctx.can.results ? await agentResults(ctx.agent.agentId) : null
  const kit = agentFlyerKit(await getNopFlyerSettings())
  const t = (k: NopStringKey, v?: Record<string, string>) => tNop(lang, k, v)
  const words = ctx.tier === "basic" ? PRO_WORDS.filter(([f]) => ctx.orgFeatures[f]).map(([, k]) => t(k)) : []
  const list = words.length > 1 ? `${words.slice(0, -1).join(", ")} ${t("portal.and")} ${words[words.length - 1]}` : words[0]

  return (
    <PortalShell page={page} title={t("portal.home_title")} intro={t("portal.home_intro")}>
      {results && (
        <section aria-labelledby="results" data-testid="home-results" className="mb-6 rounded-2xl border border-border bg-card p-5">
          <h2 id="results" className="font-semibold">{t("portal.results_title")}</h2>
          {results.scans === 0 && results.leads === 0 ? (
            <p className="mt-1 text-sm text-muted-foreground">{t("portal.results_empty")}</p>
          ) : (
            <dl className="mt-3 grid grid-cols-2 gap-3">
              <div data-testid="results-scans"><dt className="text-xs text-muted-foreground">{t("portal.results_scans")}</dt><dd className="text-2xl font-semibold tabular-nums">{results.scans}</dd></div>
              {ctx.can.leads && <div data-testid="results-leads"><dt className="text-xs text-muted-foreground">{t("portal.results_leads")}</dt><dd className="text-2xl font-semibold tabular-nums">{results.leads}</dd></div>}
            </dl>
          )}
        </section>
      )}
      <NopDashboard active={ctx.agent.active} statusKey={ctx.agent.active ? null : nopStatusMessageKey(ctx.agent.status)} readOnly={readOnly} kit={kit} />
      {list && (
        <p data-testid="pro-line" className="mt-6 text-sm text-muted-foreground">
          <span className="mr-2 inline-flex rounded-full border border-border px-2 py-0.5 text-xs font-semibold">{t("portal.pro_label")}</span>
          {t("portal.pro_line", { list })}
        </p>
      )}
    </PortalShell>
  )
}
