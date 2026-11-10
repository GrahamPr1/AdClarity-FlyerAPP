import Link from "next/link"
import { redirect } from "next/navigation"
import { tNop } from "@/lib/enterprise/nop-i18n"
import { nopLangForPage } from "@/lib/enterprise/nop-i18n/server"
import { requirePortalPage } from "@/lib/enterprise/portal/page"
import { canUse } from "@/lib/enterprise/portal/features"
import { EVENT_FLYER_READY } from "@/lib/enterprise/portal/events"
import { NopEventEditor } from "@/components/nop-event-editor"
import { PortalShell } from "../../portal-shell"

export const dynamic = "force-dynamic"

export async function generateMetadata() {
  const { lang } = await nopLangForPage(null)
  return { title: tNop(lang, "event.new") }
}

/** A new event: only for agents who can use events (Pro/Leader, active, org switch on). */
export default async function Page() {
  const page = await requirePortalPage()
  if (!canUse(page.ctx, "events")) redirect("/agent/create")
  const t = (k: Parameters<typeof tNop>[1]) => tNop(page.lang, k)
  return (
    <PortalShell page={page} title={t("event.new")}>
      <Link href="/agent/create" className="-mt-2 mb-4 inline-flex min-h-11 items-center text-sm text-muted-foreground hover:text-foreground">{t("flyer.back")}</Link>
      <NopEventEditor event={null} stats={null} readOnly={page.readOnly} flyerReady={EVENT_FLYER_READY} />
    </PortalShell>
  )
}
