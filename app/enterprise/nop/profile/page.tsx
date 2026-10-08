import { redirect } from "next/navigation"
import { cookies } from "next/headers"
import { getSessionIdentity, ADMIN_SUB } from "@/lib/auth"
import { tNop } from "@/lib/enterprise/nop-i18n"
import { nopLangForPage } from "@/lib/enterprise/nop-i18n/server"
import Link from "next/link"
import { NopProfileForm, NopSignOut } from "@/components/nop-agent"
import { loadNopAgent } from "@/lib/enterprise/nop-render/agent-context"
import { NopPageShell } from "../nop-page-shell"

export async function generateMetadata() {
  const session = await getSessionIdentity({ cookies: await cookies() })
  const { lang } = await nopLangForPage(session?.sub ?? null)
  return { title: tNop(lang, "profile.meta_title") }
}

// Checks the session here rather than widening middleware's matcher: an
// agent registers onto an existing OneFlyer account, so signing in comes first.
export default async function Page() {
  const session = await getSessionIdentity({ cookies: await cookies() })
  if (!session) redirect("/login?next=/enterprise/nop/profile")
  if (session.sub === ADMIN_SUB) redirect("/admin/enterprise/nop")

  const { lang, source } = await nopLangForPage(session.sub)
  const registered = (await loadNopAgent(session.sub)) !== null
  return (
    <NopPageShell
      lang={lang}
      source={source}
      title={tNop(lang, "profile.title")}
      intro={tNop(lang, "profile.intro")}
      headerAction={
        <>
          {registered && (
            <Link href="/enterprise/nop/dashboard" className="inline-flex min-h-11 items-center text-sm text-muted-foreground transition-colors hover:text-foreground">
              {tNop(lang, "flyer.back")}
            </Link>
          )}
          <NopSignOut />
        </>
      }
    >
      <NopProfileForm />
    </NopPageShell>
  )
}
