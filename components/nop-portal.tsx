"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useState } from "react"
import { useNop } from "@/components/nop-i18n"
import type { NopStringKey } from "@/lib/enterprise/nop-i18n"
import type { PortalTab } from "@/lib/enterprise/portal/features"

// Client pieces of the agent portal: the bottom navigation, the read-only
// banner an admin sees while viewing an agent's portal, and the short locked
// "Pro" screen. Server pages decide what each one shows.

const TAB_HREF: Record<PortalTab, string> = { home: "/agent", create: "/agent/create", leads: "/agent/leads", team: "/agent/team" }
const TAB_LABEL: Record<PortalTab, NopStringKey> = { home: "portal.tab_home", create: "portal.tab_create", leads: "portal.tab_leads", team: "portal.tab_team" }

function TabIcon({ tab }: { tab: PortalTab }) {
  const common = { width: 22, height: 22, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true }
  if (tab === "home") return <svg {...common}><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V21h14V9.5" /></svg>
  if (tab === "create") return <svg {...common}><path d="M12 5v14M5 12h14" /></svg>
  if (tab === "leads") return <svg {...common}><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0" /><path d="M17 11h5M19.5 8.5v5" /></svg>
  return <svg {...common}><circle cx="8" cy="8" r="3" /><circle cx="16.5" cy="9" r="2.5" /><path d="M2.5 19.5a5.5 5.5 0 0 1 11 0M13.5 19.5a4.5 4.5 0 0 1 8 -2.8" /></svg>
}

/** At most 4 tabs; each target is at least 56px tall. */
export function PortalNav({ tabs }: { tabs: PortalTab[] }) {
  const { t } = useNop()
  const path = usePathname() ?? "/agent"
  const current = (tab: PortalTab) => (tab === "home" ? path === "/agent" : path === TAB_HREF[tab] || path.startsWith(`${TAB_HREF[tab]}/`))
  return (
    <nav aria-label={t("portal.nav_label")} className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 backdrop-blur pb-[env(safe-area-inset-bottom)]">
      <ul className="mx-auto flex max-w-xl">
        {tabs.map((tab) => (
          <li key={tab} className="flex-1">
            <Link
              href={TAB_HREF[tab]}
              data-tab={tab}
              aria-current={current(tab) ? "page" : undefined}
              className={
                "flex min-h-14 flex-col items-center justify-center gap-0.5 px-2 py-2 text-xs font-medium transition-colors " +
                (current(tab) ? "text-[var(--brand-teal-bright)]" : "text-muted-foreground hover:text-foreground")
              }
            >
              <TabIcon tab={tab} />
              {t(TAB_LABEL[tab])}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}

/** Shown only to an admin viewing an agent's portal. Exit clears the read-only view. */
export function ViewAsBanner({ name, email }: { name: string; email: string }) {
  const { t } = useNop()
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  return (
    <div role="status" data-testid="view-as-banner" className="sticky top-0 z-50 flex flex-wrap items-center justify-between gap-3 bg-amber-400 px-4 py-2 text-sm font-medium text-black">
      <span>{t("portal.view_as", { name })}</span>
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true)
          await fetch("/api/admin/enterprise/view-as", { method: "DELETE" }).catch(() => {})
          router.push(`/admin/enterprise/agents/${encodeURIComponent(email)}`)
          router.refresh()
        }}
        className="min-h-11 rounded-lg bg-black px-4 font-semibold text-white disabled:opacity-60"
      >
        {t("portal.view_as_exit")}
      </button>
    </div>
  )
}

/** A feature the agent's tier doesn't include: one label, one sentence. */
export function ProLocked({ sentence }: { sentence: NopStringKey }) {
  const { t } = useNop()
  return (
    <div data-testid="pro-locked" className="rounded-2xl border border-border bg-card p-6">
      <span className="inline-flex rounded-full bg-[var(--brand-teal-bright)] px-2.5 py-0.5 text-xs font-semibold text-[var(--primary-foreground)]">
        {t("portal.pro_label")}
      </span>
      <p className="mt-3 text-sm text-muted-foreground">{t(sentence)}</p>
    </div>
  )
}
