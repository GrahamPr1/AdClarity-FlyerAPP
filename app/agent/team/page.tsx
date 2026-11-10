import { redirect } from "next/navigation"
import { tNop, type NopStringKey } from "@/lib/enterprise/nop-i18n"
import { nopLangForPage } from "@/lib/enterprise/nop-i18n/server"
import { requirePortalPage } from "@/lib/enterprise/portal/page"
import { agentFlyerKit, getNopFlyerSettings } from "@/lib/enterprise/nop-render/kit-v2-access"
import { NOP_V2_PACKAGES, NOP_V2_PRICING } from "@/lib/enterprise/nop-render/kit-v2-ids"
import { listPicks, listTeam, pickTemplate } from "@/lib/enterprise/portal/team"
import type { RecruitStatus } from "@/lib/enterprise/portal/recruiting"
import { NopTeamSend, type TeamFlyerOption } from "@/components/nop-team-send"
import { PortalShell } from "../portal-shell"

export const dynamic = "force-dynamic"

export async function generateMetadata() {
  const { lang } = await nopLangForPage(null)
  return { title: tNop(lang, "portal.team_title") }
}

const STATUS: Record<RecruitStatus, NopStringKey> = { pending: "recruit.status_pending", approved: "recruit.status_approved", inactive: "recruit.status_inactive" }

/**
 * Team: Leaders only, and only when the org has it on. Everyone else never sees
 * the tab. The agents who joined through the Leader's recruit link, with
 * activity counts for approved members (never lead details), and "Send to
 * team" (team.ts).
 */
export default async function Page() {
  const page = await requirePortalPage()
  if (!page.ctx.can.team) redirect("/agent")
  const t = (k: NopStringKey, v?: Record<string, string>) => tNop(page.lang, k, v)
  const leaderId = page.ctx.agent.agentId
  const kit = agentFlyerKit(await getNopFlyerSettings())
  const [team, picks] = await Promise.all([listTeam(leaderId), listPicks(leaderId)])
  const approved = team.filter((m) => m.status === "approved").length
  const pending = team.filter((m) => m.status === "pending").length
  const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(page.lang === "es" ? "es-US" : "en-US", { month: "short", day: "numeric", year: "numeric" }) : t("team.never"))
  const options: TeamFlyerOption[] = kit.kit === "v1"
    ? ["P1", "P2", "P3", "ALL"].map((pkg) => ({ pkg, pricing: null, template: `NOP_${pkg}_EN` }))
    : NOP_V2_PACKAGES.flatMap((pkg) => NOP_V2_PRICING.map((pricing) => ({ pkg, pricing, template: `NOP2_${pkg}_EN_${pricing}` })))

  return (
    <PortalShell page={page} title={t("portal.team_title")}>
      {team.length === 0 ? (
        <p data-testid="team-empty" className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">{t("portal.team_empty")}</p>
      ) : (
        <section aria-labelledby="team" data-testid="team-list" className="rounded-2xl border border-border bg-card p-5">
          <h2 id="team" className="font-semibold">{t("team.members_title")}</h2>
          <p data-testid="team-summary" className="mt-1 text-sm text-muted-foreground">
            {t(approved === 1 ? "team.summary_one" : "team.summary", { n: String(approved) })}{pending > 0 && ` · ${t("team.summary_pending", { n: String(pending) })}`}
          </p>
          <ul className="mt-3 divide-y divide-border">
            {team.map((m) => (
              <li key={m.agentId} data-testid="team-member" data-status={m.status} className="py-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">{m.name}</span>
                  <span className="text-muted-foreground">{t(STATUS[m.status])}</span>
                </div>
                {m.activity && (
                  <dl className="mt-2 grid grid-cols-3 gap-2" data-testid="team-activity">
                    <div><dt className="text-xs text-muted-foreground">{t("team.flyers_made")}</dt><dd className="font-semibold tabular-nums">{m.activity.flyersMade}</dd></div>
                    <div><dt className="text-xs text-muted-foreground">{t("portal.results_leads")}</dt><dd className="font-semibold tabular-nums">{m.activity.leads}</dd></div>
                    <div><dt className="text-xs text-muted-foreground">{t("team.last_active")}</dt><dd className="font-semibold">{day(m.activity.lastActive)}</dd></div>
                  </dl>
                )}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-muted-foreground">{t("team.counts_only")}</p>
        </section>
      )}

      <section aria-labelledby="send" data-testid="team-send-section" className="mt-6 rounded-2xl border border-border bg-card p-5">
        <h2 id="send" className="font-semibold">{t("team.send_title")}</h2>
        <p className="mt-1 mb-3 text-sm text-muted-foreground">{t("team.send_intro")}</p>
        <NopTeamSend options={options} readOnly={page.readOnly} picks={picks.map((p) => ({ id: p.id, at: p.at, template: pickTemplate(p, kit, "en") }))} />
      </section>
    </PortalShell>
  )
}
