import Link from "next/link"
import type { ReactNode } from "react"

/** Shared shell for the three policy pages, so they can't drift apart visually. */
export function LegalPage({ title, updated, children }: { title: string; updated: string; children: ReactNode }) {
  return (
    <main className="min-h-screen bg-background px-6 py-16 text-foreground md:py-24">
      <div className="mx-auto max-w-2xl">
        <Link href="/" className="inline-flex items-center gap-2 font-semibold transition-colors hover:text-[var(--brand-teal-bright)]">
          <span className="inline-block h-2 w-2 rounded-full bg-[var(--brand-teal-bright)]" />
          OneFlyer
        </Link>
        <h1 className="mt-8 text-2xl font-semibold tracking-tight md:text-3xl">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">Last updated {updated}</p>
        <div className="legal mt-8 flex flex-col gap-5 text-sm leading-relaxed text-foreground/85">{children}</div>
        <p className="mt-12 border-t border-white/10 pt-6 text-xs text-muted-foreground">
          Questions about any of this? Email{" "}
          <a href="mailto:support@oneflyer.org" className="text-[var(--brand-teal-bright)] hover:underline">
            support@oneflyer.org
          </a>
          .
        </p>
      </div>
    </main>
  )
}

export function H2({ children }: { children: ReactNode }) {
  return <h2 className="mt-4 text-base font-semibold text-foreground">{children}</h2>
}

export function UL({ children }: { children: ReactNode }) {
  return <ul className="flex list-disc flex-col gap-2 pl-5 marker:text-muted-foreground">{children}</ul>
}
