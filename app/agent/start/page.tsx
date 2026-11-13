import { redirect } from "next/navigation"
import Link from "next/link"
import { cookies } from "next/headers"
import { getSessionIdentity, ADMIN_SUB } from "@/lib/auth"
import { tNop } from "@/lib/enterprise/nop-i18n"
import { nopLangForPage } from "@/lib/enterprise/nop-i18n/server"
import { loadNopAgent } from "@/lib/enterprise/nop-render/agent-context"
import { NopGetStarted } from "@/components/nop-access"
import { agentIdParam, withAgentId } from "@/lib/enterprise/nop-roster"
import { NopPageShell } from "../../enterprise/nop/nop-page-shell"
import { parseRecruitRef, resolveRecruiter } from "@/lib/enterprise/portal/recruiting"

export const dynamic = "force-dynamic"

export async function generateMetadata() {
  const { lang } = await nopLangForPage(null)
  return { title: tNop(lang, "start.meta_title") }
}

// "First time? Get started". Signed out by design: the account is created
// at the end. A signed-in agent has nothing to do here. Through a recruit link
// (?ref=, recruiting.ts) it says who invited them, and that this agent will see
// their name and whether they're approved.
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams
  const agentCode = agentIdParam(params)
  const ref = parseRecruitRef(params.ref)
  const recruiter = await resolveRecruiter(ref)
  const session = await getSessionIdentity({ cookies: await cookies() })
  if (session && session.sub !== ADMIN_SUB && (await loadNopAgent(session.sub))) redirect(withAgentId("/agent", agentCode))
  const { lang, source } = await nopLangForPage(null)
  return (
    <NopPageShell
      lang={lang}
      source={source}
      title={tNop(lang, "start.title")}
      intro={tNop(lang, "start.intro")}
      headerAction={<Link href="/agent" className="inline-flex min-h-11 items-center text-sm text-muted-foreground transition-colors hover:text-foreground">{tNop(lang, "page.back_agent")}</Link>}
    >
      {recruiter && (
        <p data-testid="recruit-invited" className="mb-6 rounded-xl border border-border bg-card p-4 text-sm">
          {tNop(lang, "recruit.invited_by", { name: recruiter.name })}{" "}
          <span className="text-muted-foreground">{tNop(lang, "recruit.invited_note", { name: recruiter.name })}</span>
        </p>
      )}
      <NopGetStarted agentCode={agentCode} recruitRef={recruiter ? ref : null} />
    </NopPageShell>
  )
}
