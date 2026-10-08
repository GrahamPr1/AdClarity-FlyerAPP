import { redirect } from "next/navigation"
import Link from "next/link"
import { cookies } from "next/headers"
import { getSessionIdentity, ADMIN_SUB } from "@/lib/auth"
import { tNop } from "@/lib/enterprise/nop-i18n"
import { nopLangForPage } from "@/lib/enterprise/nop-i18n/server"
import { loadNopAgent } from "@/lib/enterprise/nop-render/agent-context"
import { NopGetStarted } from "@/components/nop-access"
import { NopPageShell } from "../../enterprise/nop/nop-page-shell"

export const dynamic = "force-dynamic"

export async function generateMetadata() {
  const { lang } = await nopLangForPage(null)
  return { title: tNop(lang, "start.meta_title") }
}

// "First time? Get started". Signed out by design: the account is created
// at the end. A signed-in agent has nothing to do here.
export default async function Page() {
  const session = await getSessionIdentity({ cookies: await cookies() })
  if (session && session.sub !== ADMIN_SUB && (await loadNopAgent(session.sub))) redirect("/enterprise/nop/dashboard")
  const { lang, source } = await nopLangForPage(null)
  return (
    <NopPageShell
      lang={lang}
      source={source}
      title={tNop(lang, "start.title")}
      intro={tNop(lang, "start.intro")}
      headerAction={<Link href="/agent" className="inline-flex min-h-11 items-center text-sm text-muted-foreground transition-colors hover:text-foreground">{tNop(lang, "page.back_agent")}</Link>}
    >
      <NopGetStarted />
    </NopPageShell>
  )
}
