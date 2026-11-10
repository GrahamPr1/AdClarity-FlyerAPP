import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { tNop } from "@/lib/enterprise/nop-i18n"
import { nopLangForPage } from "@/lib/enterprise/nop-i18n/server"
import { requirePortalPage } from "@/lib/enterprise/portal/page"
import { canUse } from "@/lib/enterprise/portal/features"
import { EVENT_FLYER_READY, eventLink, getEvent } from "@/lib/enterprise/portal/events"
import { listAgentLeads } from "@/lib/enterprise/portal/agent-data"
import { NopEventEditor } from "@/components/nop-event-editor"
import { PortalShell } from "../../portal-shell"

export const dynamic = "force-dynamic"

export async function generateMetadata() {
  const { lang } = await nopLangForPage(null)
  return { title: tNop(lang, "event.edit_title") }
}

/** One of the agent's events: share it, see RSVPs, edit or cancel. Anyone else's: not found. */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const page = await requirePortalPage()
  if (!canUse(page.ctx, "events")) redirect("/agent/create")
  const event = await getEvent((await params).id)
  if (!event || event.agentId !== page.ctx.agent.agentId) notFound()
  const rsvps = (await listAgentLeads(event.agentId)).filter((l) => l.eventId === event.id)
  const t = (k: Parameters<typeof tNop>[1]) => tNop(page.lang, k)
  return (
    <PortalShell page={page} title={event.title}>
      <Link href="/agent/create" className="-mt-2 mb-4 inline-flex min-h-11 items-center text-sm text-muted-foreground hover:text-foreground">{t("flyer.back")}</Link>
      <NopEventEditor
        event={{ ...event, link: eventLink(event.code) }}
        stats={{ rsvps: rsvps.length, guests: rsvps.reduce((n, l) => n + 1 + (l.guests ?? 0), 0) }}
        readOnly={page.readOnly}
        flyerReady={EVENT_FLYER_READY}
      />
    </PortalShell>
  )
}
