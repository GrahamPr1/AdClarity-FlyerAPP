import Link from "next/link"
import { cookies } from "next/headers"
import { getSessionIdentity, ADMIN_SUB } from "@/lib/auth"
import { tNop } from "@/lib/enterprise/nop-i18n"
import { nopLangForPage } from "@/lib/enterprise/nop-i18n/server"
import { loadNopAgent } from "@/lib/enterprise/nop-render/agent-context"
import { NopPageShell } from "../enterprise/nop/nop-page-shell"

export const dynamic = "force-dynamic"

export async function generateMetadata() {
  const { lang } = await nopLangForPage(null)
  return { title: tNop(lang, "agent.meta_title") }
}

const big =
  "flex min-h-14 w-full items-center justify-center rounded-xl px-5 py-4 text-center text-base font-semibold transition-colors"

// oneflyer.org/agent (and /agente): the one front door for Neighborhood
// Outreach Program agents. Two choices, nothing else to read.
export default async function Page() {
  const session = await getSessionIdentity({ cookies: await cookies() })
  const agent = session && session.sub !== ADMIN_SUB ? await loadNopAgent(session.sub) : null
  const { lang, source } = await nopLangForPage(session?.sub ?? null)
  const t = (k: Parameters<typeof tNop>[1]) => tNop(lang, k)

  return (
    <NopPageShell lang={lang} source={source} title={t("agent.title")} intro={t("agent.intro")}>
      <div className="flex flex-col gap-3">
        {agent ? (
          <Link href="/enterprise/nop/dashboard" className={`${big} bg-[var(--brand-teal-bright)] text-[var(--primary-foreground)] hover:bg-[var(--brand-teal)]`}>
            {t("agent.go_dashboard")}
          </Link>
        ) : (
          <>
            <Link href="/agent/start" className={`${big} bg-[var(--brand-teal-bright)] text-[var(--primary-foreground)] hover:bg-[var(--brand-teal)]`}>
              {t("agent.get_started")}
            </Link>
            <Link href="/agent/sign-in" className={`${big} border-2 border-[var(--brand-teal-bright)] text-foreground hover:bg-[var(--surface-sunken)]`}>
              {t("agent.sign_in")}
            </Link>
          </>
        )}
        <Link href="/login" className="mt-4 text-center text-sm text-muted-foreground hover:text-foreground">
          {t("agent.business_note")}
        </Link>
      </div>
    </NopPageShell>
  )
}
