import { notFound, redirect } from "next/navigation"
import Link from "next/link"
import { cookies } from "next/headers"
import { getSessionIdentity, ADMIN_SUB } from "@/lib/auth"
import { tNop, type NopStringKey } from "@/lib/enterprise/nop-i18n"
import { nopLangForPage } from "@/lib/enterprise/nop-i18n/server"
import { isNopTemplate, templateParts } from "@/lib/enterprise/nop-render/kit"
import { loadNopAgent, nopStatusMessageKey } from "@/lib/enterprise/nop-render/agent-context"
import { NopFlyerPreview } from "@/components/nop-dashboard"
import { NopPageShell } from "../../nop-page-shell"

export const dynamic = "force-dynamic"

export async function generateMetadata() {
  const session = await getSessionIdentity({ cookies: await cookies() })
  const { lang } = await nopLangForPage(session?.sub ?? null)
  return { title: tNop(lang, "flyer.meta_title") }
}

export default async function Page({ params }: { params: Promise<{ template: string }> }) {
  const { template } = await params
  if (!isNopTemplate(template)) notFound()
  const session = await getSessionIdentity({ cookies: await cookies() })
  if (!session) redirect(`/login?next=/enterprise/nop/flyer/${template}`)
  if (session.sub === ADMIN_SUB) redirect("/admin/enterprise/nop")
  const agent = await loadNopAgent(session.sub)
  if (!agent) redirect("/enterprise/nop/register")

  const { lang, source } = await nopLangForPage(session.sub)
  const { pkg, lang: flyerLang } = templateParts(template)
  return (
    <NopPageShell
      lang={lang}
      source={source}
      title={`${tNop(lang, `pkg.${pkg}` as NopStringKey)} · ${tNop(lang, `pkg.${pkg}_name` as NopStringKey)}`}
      intro={`${tNop(lang, "dash.flyer_lang")}: ${tNop(lang, flyerLang === "EN" ? "dash.flyer_lang_en" : "dash.flyer_lang_es")}`}
      headerAction={
        <Link href="/enterprise/nop/dashboard" className="text-sm text-muted-foreground transition-colors hover:text-foreground">
          {tNop(lang, "flyer.back")}
        </Link>
      }
    >
      <NopFlyerPreview
        template={template}
        active={agent.active}
        statusKey={agent.active ? null : nopStatusMessageKey(agent.status)}
        agentName={agent.profile.displayName ?? agent.profile.name}
      />
    </NopPageShell>
  )
}
