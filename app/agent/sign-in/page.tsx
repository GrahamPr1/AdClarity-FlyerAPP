import { redirect } from "next/navigation"
import Link from "next/link"
import { cookies } from "next/headers"
import { getSessionIdentity, ADMIN_SUB } from "@/lib/auth"
import { tNop } from "@/lib/enterprise/nop-i18n"
import { nopLangForPage } from "@/lib/enterprise/nop-i18n/server"
import { loadNopAgent } from "@/lib/enterprise/nop-render/agent-context"
import { NopSignIn } from "@/components/nop-access"
import { NopPageShell } from "../../enterprise/nop/nop-page-shell"

export const dynamic = "force-dynamic"

export async function generateMetadata() {
  const { lang } = await nopLangForPage(null)
  return { title: tNop(lang, "signin.meta_title") }
}

// "Already registered? Sign in" with an emailed code.
export default async function Page() {
  const session = await getSessionIdentity({ cookies: await cookies() })
  if (session && session.sub !== ADMIN_SUB && (await loadNopAgent(session.sub))) redirect("/enterprise/nop/dashboard")
  const { lang, source } = await nopLangForPage(null)
  return (
    <NopPageShell
      lang={lang}
      source={source}
      title={tNop(lang, "signin.title")}
      intro={tNop(lang, "signin.intro")}
      headerAction={<Link href="/agent" className="inline-flex min-h-11 items-center text-sm text-muted-foreground transition-colors hover:text-foreground">{tNop(lang, "page.back_agent")}</Link>}
    >
      <NopSignIn />
    </NopPageShell>
  )
}
