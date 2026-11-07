import type { ReactNode } from "react"
import Link from "next/link"
import { NopLangProvider, NopLanguageToggle } from "@/components/nop-i18n"
import { NopSignOut } from "@/components/nop-agent"
import { PortalNav, ViewAsBanner } from "@/components/nop-portal"
import { tNop } from "@/lib/enterprise/nop-i18n"
import type { PortalPage } from "@/lib/enterprise/portal/page"

/**
 * Frame for every signed-in portal page: the read-only banner (admin view
 * only), header, heading, and the bottom navigation. Mobile-first: one
 * column, and room at the bottom for the fixed nav.
 */
export function PortalShell({ page, title, intro, children }: { page: PortalPage; title: string; intro?: string; children: ReactNode }) {
  const { ctx, lang, source, readOnly } = page
  const name = ctx.agent.profile.displayName ?? ctx.agent.profile.name
  return (
    <main lang={lang} className="min-h-screen bg-background text-foreground">
      {/* Never persist a language to the agent's account while an admin is viewing it. */}
      <NopLangProvider lang={lang} persist={source === "profile" && !readOnly}>
        {readOnly && <ViewAsBanner name={name} email={ctx.email} />}
        <div className="mx-auto max-w-xl px-4 pt-6 pb-28 sm:px-6">
          <div className="mb-6 flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2 font-semibold">
              <span className="inline-block h-2 w-2 shrink-0 rounded-full bg-[var(--brand-teal-bright)]" />
              OneFlyer
            </div>
            <div className="flex items-center gap-1">
              <Link href="/agent/profile" className="inline-flex min-h-11 min-w-11 items-center justify-center px-2 text-sm text-muted-foreground transition-colors hover:text-foreground">
                {tNop(lang, "portal.profile_link")}
              </Link>
              {!readOnly && <NopSignOut />}
              <NopLanguageToggle cookieOnly={readOnly} />
            </div>
          </div>
          {/* Program name stays English, as in Basic Benefits' Spanish masters. */}
          <p lang="en" className="text-xs uppercase tracking-widest text-muted-foreground">{ctx.orgName}</p>
          <h1 className="mt-1 text-2xl">{title}</h1>
          {intro && <p className="mt-2 text-sm text-muted-foreground">{intro}</p>}
          <div className="mt-6">{children}</div>
        </div>
        <PortalNav tabs={ctx.tabs} />
      </NopLangProvider>
    </main>
  )
}
