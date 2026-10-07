import { redirect } from "next/navigation"
import Link from "next/link"
import { cookies } from "next/headers"
import { getSessionIdentity, ADMIN_SUB } from "@/lib/auth"
import { tNop } from "@/lib/enterprise/nop-i18n"
import { nopLangForPage } from "@/lib/enterprise/nop-i18n/server"
import { NopRegisterFlow } from "@/components/nop-agent"
import { NopPageShell } from "../nop-page-shell"

export async function generateMetadata() {
  const session = await getSessionIdentity({ cookies: await cookies() })
  const { lang } = await nopLangForPage(session?.sub ?? null)
  return { title: tNop(lang, "register.meta_title") }
}

// Checks the session here rather than widening middleware's matcher: an
// agent registers onto an existing OneFlyer account, so signing in comes first.
export default async function Page() {
  const session = await getSessionIdentity({ cookies: await cookies() })
  if (!session) redirect("/login?next=/enterprise/nop/register")
  if (session.sub === ADMIN_SUB) redirect("/admin/enterprise/nop")

  const { lang, source } = await nopLangForPage(session.sub)
  return (
    <NopPageShell
      lang={lang}
      source={source}
      title={tNop(lang, "register.title")}
      intro={tNop(lang, "register.intro")}
      headerAction={
        <Link href="/dashboard" className="text-sm text-muted-foreground transition-colors hover:text-foreground">
          {tNop(lang, "page.back_dashboard")}
        </Link>
      }
    >
      <NopRegisterFlow />
    </NopPageShell>
  )
}
