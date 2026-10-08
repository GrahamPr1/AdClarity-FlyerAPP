import { redirect } from "next/navigation"
import Link from "next/link"
import { cookies } from "next/headers"
import { getSessionIdentity, ADMIN_SUB } from "@/lib/auth"
import { tNop } from "@/lib/enterprise/nop-i18n"
import { nopLangForPage } from "@/lib/enterprise/nop-i18n/server"
import { loadNopAgent, nopStatusMessageKey } from "@/lib/enterprise/nop-render/agent-context"
import { NopDashboard } from "@/components/nop-dashboard"
import { NopSignOut } from "@/components/nop-agent"
import { NopPageShell } from "../nop-page-shell"

export const dynamic = "force-dynamic"

export async function generateMetadata() {
  const session = await getSessionIdentity({ cookies: await cookies() })
  const { lang } = await nopLangForPage(session?.sub ?? null)
  return { title: tNop(lang, "dash.meta_title") }
}

// The NOP agent's home. Roster status is read here on every visit; the
// render route checks it again on every preview and download.
export default async function Page() {
  const session = await getSessionIdentity({ cookies: await cookies() })
  if (!session) redirect("/login?next=/enterprise/nop/dashboard")
  if (session.sub === ADMIN_SUB) redirect("/admin/enterprise/nop")
  const agent = await loadNopAgent(session.sub)
  if (!agent) redirect("/enterprise/nop/register")

  const { lang, source } = await nopLangForPage(session.sub)
  return (
    <NopPageShell
      lang={lang}
      source={source}
      title={tNop(lang, "dash.title")}
      intro={tNop(lang, "dash.intro")}
      headerAction={
        <>
          <Link href="/enterprise/nop/profile" className="inline-flex min-h-11 min-w-11 items-center justify-center text-sm text-muted-foreground transition-colors hover:text-foreground">
            {tNop(lang, "dash.profile_link")}
          </Link>
          <NopSignOut />
        </>
      }
    >
      <NopDashboard active={agent.active} statusKey={agent.active ? null : nopStatusMessageKey(agent.status)} />
    </NopPageShell>
  )
}
