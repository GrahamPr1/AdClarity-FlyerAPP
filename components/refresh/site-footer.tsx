import Link from "next/link"
import { FOR_AGENTS_HREF } from "./site-header"

// Site footer (Main mockup, plus the links the parity map keeps: About,
// Contact, Refund policy, and NOP's "Agents / Agentes").
const LINKS = [
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" },
  { href: "/privacy", label: "Privacy" },
  { href: "/terms", label: "Terms" },
  { href: "/refund-policy", label: "Refund policy" },
  { href: "/agent", label: "Agents / Agentes" },
]

export function RefreshSiteFooter() {
  return (
    <footer className="rf-footer">
      <div style={{ width: "100%", maxWidth: 1200, display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: 16, fontSize: 14 }}>
        <span style={{ color: "#FFFFFF", fontWeight: 700 }}>OneFlyer</span>
        <nav aria-label="Footer" style={{ display: "flex", flexWrap: "wrap", gap: "8px 20px" }}>
          {LINKS.map((l) => <Link key={l.href} href={l.href}>{l.label}</Link>)}
          <Link href={FOR_AGENTS_HREF} className="rf-footer-amber">OneFlyer for Agents</Link>
        </nav>
      </div>
    </footer>
  )
}
