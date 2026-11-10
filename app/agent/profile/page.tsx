import { tNop } from "@/lib/enterprise/nop-i18n"
import { nopLangForPage } from "@/lib/enterprise/nop-i18n/server"
import { requirePortalPage } from "@/lib/enterprise/portal/page"
import { NopProfileForm } from "@/components/nop-agent"
import { PortalShell } from "../portal-shell"
import { NopMonthlyEmailToggle } from "@/components/nop-monthly-email-toggle"
import { canUse } from "@/lib/enterprise/portal/features"
import { getAgentProfile } from "@/lib/store"

export const dynamic = "force-dynamic"

export async function generateMetadata() {
  const { lang } = await nopLangForPage(null)
  return { title: tNop(lang, "profile.meta_title") }
}

/** The agent's details. (Was /enterprise/nop/profile.) */
export default async function Page() {
  const page = await requirePortalPage()
  const monthly = canUse(page.ctx, "monthlyEmail") ? (await getAgentProfile(page.ctx.email))?.monthlyEmail !== false : null
  return (
    <PortalShell page={page} title={tNop(page.lang, "profile.title")} intro={tNop(page.lang, "profile.intro")}>
      <NopProfileForm readOnly={page.readOnly} />
      {monthly !== null && <NopMonthlyEmailToggle on={monthly} readOnly={page.readOnly} />}
    </PortalShell>
  )
}
