import type { ReactNode } from "react"
import { NOP_ORG_NAME } from "@/lib/enterprise/nop-roster"
import type { NopLang, NopLangSource } from "@/lib/enterprise/nop-i18n"
import { NopLangProvider, NopLanguageToggle } from "@/components/nop-i18n"

/**
 * Frame for every NOP agent page: language provider, EN/ES toggle, heading.
 *
 * <html lang> lives in the root layout, which every OneFlyer page shares and
 * which must stay static. <main lang> marks the page's language from the
 * first byte; NopLangProvider then sets <html lang> before paint, after a
 * toggle and on client navigation, and resets it on the way out.
 */
export function NopPageShell({
  lang,
  source,
  title,
  intro,
  headerAction,
  children,
}: {
  lang: NopLang
  source: NopLangSource
  title: string
  intro: string
  headerAction?: ReactNode
  children: ReactNode
}) {
  return (
    <main lang={lang} className="min-h-screen bg-background px-6 py-16 text-foreground md:py-24">
      <NopLangProvider lang={lang} persist={source === "profile"}>
        <div className="mx-auto max-w-xl">
          <div className="mb-8 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 font-semibold">
              <span className="inline-block h-2 w-2 rounded-full bg-[var(--brand-teal-bright)]" />
              OneFlyer
            </div>
            <div className="flex items-center gap-3">
              {headerAction}
              <NopLanguageToggle />
            </div>
          </div>
          {/* Program name stays English, as in Basic Benefits' Spanish masters. */}
          <p lang="en" className="text-xs uppercase tracking-widest text-muted-foreground">{NOP_ORG_NAME}</p>
          <h1 className="mt-2 text-2xl">{title}</h1>
          <p className="mt-2 mb-8 text-sm text-muted-foreground">{intro}</p>
          {children}
        </div>
      </NopLangProvider>
    </main>
  )
}
