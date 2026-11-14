"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useEffect, useState, type ReactNode } from "react"

// The navy sidebar layout shared by the client dashboard and the admin portal
// (Dashboard and Admin mockups). Desktop: a sticky 256px sidebar. Under 920px:
// a top bar with the brand and a menu button; the menu opens the same sidebar
// full-screen (Esc or a link closes it), so every item is reachable on a phone.
//
// Groups let a screen put primary actions first and settings-type items in an
// account area further down (the parity map's rule: nothing more than one
// click deeper than today).

export interface SidebarItem {
  href: string
  label: string
  /** A small pill after the label, e.g. "Agents". */
  tag?: string
  /** Matches when the path starts with this (default: the href itself). */
  match?: string
}

export interface SidebarGroup {
  heading?: string
  items: SidebarItem[]
}

export function SidebarLayout({
  badge,
  primaryAction,
  groups,
  box,
  footer,
  label,
  children,
}: {
  /** e.g. "ADMIN" next to the brand. */
  badge?: string
  /** The big button at the top (e.g. "New campaign"). */
  primaryAction?: { href: string; label: string }
  groups: SidebarGroup[]
  /** A box under the navigation (e.g. plan usage). */
  box?: ReactNode
  /** Bottom of the sidebar (e.g. sign out). */
  footer?: ReactNode
  /** Accessible name for the navigation. */
  label: string
  children: ReactNode
}) {
  const pathname = usePathname() ?? ""
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false)
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open])

  const isCurrent = (it: SidebarItem) => {
    const m = it.match ?? it.href.split("?")[0].split("#")[0]
    return pathname === m || (m !== "/" && pathname.startsWith(`${m}/`))
  }

  const brand = (
    <span style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, width: "100%" }}>
      <Link href="/" style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 700, fontSize: 19, color: "#FFFFFF", textDecoration: "none" }}>
        <span aria-hidden="true" style={{ width: 10, height: 10, borderRadius: "50%", background: "var(--rf-amber)", display: "inline-block" }} />
        OneFlyer
      </Link>
      {badge && <span className="rf-pill rf-tone-solid-amber" style={{ letterSpacing: "0.1em", fontSize: 11 }}>{badge}</span>}
    </span>
  )

  return (
    <div className="rf-shell">
      <div className="rf-topbar">
        {brand}
        <button
          type="button"
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          aria-controls="rf-sidebar"
          onClick={() => setOpen(!open)}
          style={{ flex: "none", width: 44, height: 44, borderRadius: 12, border: "1px solid rgba(255,255,255,0.2)", background: "transparent", color: "#FFFFFF", display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
          </svg>
        </button>
      </div>

      <aside id="rf-sidebar" className="rf-sidebar" data-open={open ? "true" : "false"}>
        <div style={{ padding: "0 8px", display: "flex", alignItems: "center", gap: 8 }}>
          {brand}
          {open && (
            <button type="button" aria-label="Close menu" onClick={() => setOpen(false)} style={{ flex: "none", width: 44, height: 44, borderRadius: 12, border: "1px solid rgba(255,255,255,0.2)", background: "transparent", color: "#FFFFFF", cursor: "pointer" }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
            </button>
          )}
        </div>
        {primaryAction && (
          <Link href={primaryAction.href} className="rf-btn rf-btn-md rf-btn-amber" onClick={() => setOpen(false)}>
            + {primaryAction.label}
          </Link>
        )}
        <nav aria-label={label} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {groups.map((g, gi) => (
            <div key={gi} className="rf-side-group">
              {g.heading && <p className="rf-side-heading">{g.heading}</p>}
              {g.items.map((it) => (
                <Link key={it.href} href={it.href} className="rf-side-link" aria-current={isCurrent(it) ? "page" : undefined} onClick={() => setOpen(false)}>
                  <span>{it.label}</span>
                  {it.tag && <span className="rf-pill rf-tone-amber">{it.tag}</span>}
                </Link>
              ))}
            </div>
          ))}
        </nav>
        {box && <div className="rf-side-box">{box}</div>}
        {footer && <div style={{ marginTop: "auto", padding: "0 4px" }}>{footer}</div>}
      </aside>

      <main className="rf-main">{children}</main>
    </div>
  )
}
