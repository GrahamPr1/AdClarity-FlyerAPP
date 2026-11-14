"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { AccountMenu, useIsSignedIn } from "@/components/account-menu"
import { PRIMARY_CTA_HREF } from "@/lib/marketing"

// The refresh design's site header (Main mockup). Sticky; one row on desktop;
// under 920px: logo + "Start free" + a menu button that opens a full-width menu.
//
// Parity: "Agents / Agentes" (NOP's front door, /agent) is kept, next to Sign
// in, with the same text and target, separate from the B2B "For Agents" pill.
// Signed in, Sign in becomes the existing account menu (useIsSignedIn /
// AccountMenu, as today's header).

const LINKS = [
  { href: "#how", label: "How it works" },
  { href: "#features", label: "Features" },
  { href: "#pricing", label: "Pricing" },
  { href: "#faq", label: "FAQ" },
]
export const FOR_AGENTS_HREF = "/for-agents"
const NOP_AGENTS = { href: "/agent", label: "Agents / Agentes" }

export function RefreshSiteHeader() {
  const [open, setOpen] = useState(false)
  const signedIn = useIsSignedIn()

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false)
    const onResize = () => window.innerWidth > 920 && setOpen(false)
    window.addEventListener("keydown", onKey)
    window.addEventListener("resize", onResize)
    return () => {
      window.removeEventListener("keydown", onKey)
      window.removeEventListener("resize", onResize)
    }
  }, [open])

  return (
    <header style={{ position: "sticky", top: 0, zIndex: 20, padding: "12px 16px", display: "flex", justifyContent: "center", background: "var(--rf-header-bg)", backdropFilter: "blur(8px)" }}>
      <nav aria-label="Main" style={{ width: "100%", maxWidth: 1200, background: "var(--rf-surface)", border: "1px solid var(--rf-border)", borderRadius: 22, boxShadow: "var(--rf-shadow)", boxSizing: "border-box" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "8px 8px 8px 20px", minHeight: 60 }}>
          <Link href="/" style={{ flex: "none", display: "flex", alignItems: "center", gap: 8, textDecoration: "none", color: "var(--rf-text)", fontWeight: 700, fontSize: 19 }}>
            <span aria-hidden="true" style={{ width: 10, height: 10, borderRadius: "50%", background: "var(--rf-blue)", display: "inline-block" }} />
            OneFlyer
          </Link>
          <div className="rf-desk" style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 15 }}>
            {LINKS.map((l) => <a key={l.href} href={l.href} className="rf-navlink">{l.label}</a>)}
            <a href={FOR_AGENTS_HREF} className="rf-pill-amber" style={{ padding: "8px 14px", marginLeft: 4 }}>For Agents</a>
          </div>
          <div style={{ flex: "none", display: "flex", gap: 6, alignItems: "center" }}>
            <a className="rf-desk rf-navlink" href={NOP_AGENTS.href} style={{ fontSize: 14 }}>{NOP_AGENTS.label}</a>
            {signedIn ? (
              <span className="rf-desk"><AccountMenu /></span>
            ) : (
              <a className="rf-desk rf-navlink" href="/login" style={{ fontSize: 15, color: "var(--rf-text)", visibility: signedIn === null ? "hidden" : "visible" }}>Sign in</a>
            )}
            <a href={PRIMARY_CTA_HREF} className="rf-btn-primary" style={{ fontSize: 15, padding: "12px 18px" }} data-ga="header_cta">
              <span className="rf-desk-inline">Create my first campaign</span>
              <span className="rf-mob-inline">Start free</span>
            </a>
            <button
              className="rf-mob"
              type="button"
              aria-label={open ? "Close menu" : "Open menu"}
              aria-expanded={open}
              aria-controls="rf-mobile-menu"
              onClick={() => setOpen(!open)}
              style={{ width: 44, height: 44, borderRadius: 12, border: "1px solid var(--rf-border)", background: "var(--rf-surface)", alignItems: "center", justifyContent: "center", cursor: "pointer", padding: 0, color: "var(--rf-text)" }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
              </svg>
            </button>
          </div>
        </div>
        {open && (
          <div id="rf-mobile-menu" className="rf-mob" style={{ flexDirection: "column", gap: 2, padding: "4px 12px 14px", borderTop: "1px solid var(--rf-divider)" }}>
            {LINKS.map((l) => (
              <a key={l.href} href={l.href} onClick={() => setOpen(false)} style={{ color: "var(--rf-text)", textDecoration: "none", fontSize: 17, padding: "14px 10px", borderRadius: 12 }}>{l.label}</a>
            ))}
            <a href={FOR_AGENTS_HREF} className="rf-pill-amber" style={{ fontSize: 17, padding: "14px 12px", borderRadius: 12, marginTop: 4 }}>For Agents →</a>
            <a href={NOP_AGENTS.href} style={{ color: "var(--rf-text)", textDecoration: "none", fontSize: 17, padding: "14px 10px", borderRadius: 12 }}>{NOP_AGENTS.label}</a>
            {signedIn ? (
              <div style={{ marginTop: 8 }}><AccountMenu variant="stacked" /></div>
            ) : (
              <a href="/login" className="rf-btn-outline" style={{ fontSize: 17, textAlign: "center", padding: 14, marginTop: 8 }}>Sign in</a>
            )}
          </div>
        )}
      </nav>
    </header>
  )
}
