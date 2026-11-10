import Link from "next/link"
import { tNop, type NopStringKey } from "@/lib/enterprise/nop-i18n"
import { requirePortalPage } from "@/lib/enterprise/portal/page"
import { nopLangForPage } from "@/lib/enterprise/nop-i18n/server"
import { agentFlyerKit, getNopFlyerSettings } from "@/lib/enterprise/nop-render/kit-v2-access"
import { NOP_V2_PACKAGES, NOP_V2_PRICING } from "@/lib/enterprise/nop-render/kit-v2-ids"
import { PortalShell } from "../portal-shell"
import { canUse } from "@/lib/enterprise/portal/features"
import { formatEventWhen, listAgentEvents } from "@/lib/enterprise/portal/events"
import { canBuyPro } from "@/lib/enterprise/portal/agent-billing"
import { ProLocked } from "@/components/nop-portal"

export const dynamic = "force-dynamic"

export async function generateMetadata() {
  const { lang } = await nopLangForPage(null)
  return { title: tNop(lang, "portal.create_title") }
}

const PACKAGES = ["P1", "P2", "P3", "ALL"] as const

const link = "inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-border px-3 text-sm font-medium hover:bg-[var(--surface-sunken)]"

/** Create: everything an agent can make. Today, Basic Benefits' flyers; events and recruiting arrive in later phases. */
export default async function Page() {
  const page = await requirePortalPage()
  const t = (k: NopStringKey) => tNop(page.lang, k)
  const kit = agentFlyerKit(await getNopFlyerSettings())
  return (
    <PortalShell page={page} title={t("portal.create_title")} intro={t("portal.create_intro")}>
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-widest text-muted-foreground">{t("portal.create_flyers")}</h2>
      {kit.kit === "v2" ? (
        // Kit v2: one row per package and pricing; English, plus Spanish once admin turns it on.
        <ul data-testid="create-flyers" data-kit="v2" className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
          {NOP_V2_PACKAGES.flatMap((pkg) => NOP_V2_PRICING.map((pr) => (
            <li key={`${pkg}_${pr}`} className="flex flex-wrap items-center justify-between gap-3 p-4">
              <span>
                <span className="block text-xs uppercase tracking-widest text-muted-foreground">{t(`pkg.${pkg}`)}</span>
                <span className="font-semibold">{t(`pkg2.${pkg}_name`)}</span>
                <span className="block text-sm text-muted-foreground">{t(pr === "PRICE" ? "flyer.with_prices" : "flyer.without_prices")}</span>
              </span>
              <span className="flex gap-2">
                {(kit.spanish ? (["EN", "ES"] as const) : (["EN"] as const)).map((l) => (
                  <Link key={l} href={`/agent/create/NOP2_${pkg}_${l}_${pr}`} data-template={`NOP2_${pkg}_${l}_${pr}`} className={link}>
                    {t(l === "EN" ? "dash.flyer_lang_en" : "dash.flyer_lang_es")}
                  </Link>
                ))}
              </span>
            </li>
          )))}
        </ul>
      ) : (
      <ul data-testid="create-flyers" data-kit="v1" className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
        {PACKAGES.map((pkg) => (
          <li key={pkg} className="flex flex-wrap items-center justify-between gap-3 p-4">
            <span>
              <span className="block text-xs uppercase tracking-widest text-muted-foreground">{t(`pkg.${pkg}`)}</span>
              <span className="font-semibold">{t(`pkg.${pkg}_name`)}</span>
            </span>
            <span className="flex gap-2">
              {(["EN", "ES"] as const).map((l) => (
                <Link key={l} href={`/agent/create/NOP_${pkg}_${l}`} data-template={`NOP_${pkg}_${l}`} className={link}>
                  {t(l === "EN" ? "dash.flyer_lang_en" : "dash.flyer_lang_es")}
                </Link>
              ))}
            </span>
          </li>
        ))}
      </ul>
      )}
      {page.ctx.orgFeatures.events && <EventsSection page={page} />}
    </PortalShell>
  )
}

/** Events (Pro): the agent's events, soonest first, and "New event"; Basic sees the Pro note with the upgrade. */
async function EventsSection({ page }: { page: Awaited<ReturnType<typeof requirePortalPage>> }) {
  const t = (k: NopStringKey) => tNop(page.lang, k)
  const events = canUse(page.ctx, "events") ? await listAgentEvents(page.ctx.agent.agentId) : null
  return (
    <section aria-labelledby="events" data-testid="create-events" className="mt-8">
      <h2 id="events" className="mb-3 text-sm font-semibold uppercase tracking-widest text-muted-foreground">{t("event.section_title")}</h2>
      {!events ? (
        <ProLocked sentence="event.locked" upgrade={canBuyPro(page.ctx)} readOnly={page.readOnly} />
      ) : (
        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="text-sm text-muted-foreground">{t("event.section_intro")}</p>
          {events.length === 0 ? <p className="mt-3 text-sm">{t("event.none")}</p> : (
            <ul className="mt-3 divide-y divide-border">
              {events.map((e) => (
                <li key={e.id}>
                  <Link href={`/agent/events/${e.id}`} data-event={e.id} className="flex min-h-11 flex-wrap items-center justify-between gap-2 py-2 hover:underline">
                    <span className="font-medium">{e.title}</span>
                    <span className="text-sm text-muted-foreground">{e.cancelledAt ? t("event.cancelled_badge") : formatEventWhen(e, page.lang)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {!page.readOnly && <Link href="/agent/events/new" data-testid="event-new" className="mt-3 inline-flex min-h-11 items-center justify-center rounded-lg bg-[var(--brand-teal-bright)] px-4 text-sm font-semibold text-[var(--primary-foreground)]">{t("event.new")}</Link>}
        </div>
      )}
    </section>
  )
}
