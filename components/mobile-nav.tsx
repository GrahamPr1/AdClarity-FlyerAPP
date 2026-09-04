"use client"

import { useState } from "react"
import { NAV_LINKS, PRIMARY_CTA_HREF, PRIMARY_CTA_LABEL, PRIMARY_CTA_LABEL_SHORT } from "@/lib/marketing"

const NAV_STYLE = {
  backdropFilter: "blur(20px) saturate(180%)",
  WebkitBackdropFilter: "blur(20px) saturate(180%)",
  background: "rgba(255,255,255,0.72)",
  boxShadow: "0 8px 32px rgba(22,24,29,0.10), 0 1px 2px rgba(22,24,29,0.04)",
} as const

export function MobileNav() {
  const [open, setOpen] = useState(false)

  const close = () => setOpen(false)

  return (
    <div className="fixed top-4 inset-x-0 z-50 flex justify-center px-4 pointer-events-none">
      <div className="pointer-events-auto w-full max-w-4xl">
        {/* Main bar */}
        <nav
          className="flex items-center justify-between px-5 py-3 rounded-2xl border border-border"
          style={NAV_STYLE}
        >
          <a href="#top" className="font-semibold text-sm tracking-tight text-foreground flex items-center gap-2">
            <span className="inline-block w-2 h-2 rounded-full bg-[var(--brand-teal-bright)]" />
            OneFlyer
          </a>

          {/* Desktop links */}
          <div className="hidden lg:flex items-center gap-6">
            {NAV_LINKS.map((l) => (
              <a
                key={l.label}
                href={l.href}
                className="text-[13px] text-muted-foreground hover:text-foreground transition-colors duration-200"
              >
                {l.label}
              </a>
            ))}
          </div>

          <div className="flex items-center gap-3">
            <a
              href="/login"
              className="hidden sm:inline-flex items-center rounded-full border border-foreground/25 px-4 py-2 text-[13px] text-foreground transition-colors hover:border-[var(--brand-teal-bright)] hover:bg-[var(--brand-teal-bright)] hover:text-white"
            >
              Log In
            </a>
            {/* Stays visible the whole way down the page — this is the one
                conversion the whole funnel points at. The short label is used
                below xl, where the full sentence wraps and breaks the bar. */}
            <a
              href={PRIMARY_CTA_HREF}
              className="block text-[12px] sm:text-[13px] px-3 sm:px-4 py-2 rounded-full bg-[var(--brand-teal-bright)] text-white font-medium hover:bg-[var(--brand-teal)] transition-all duration-200 whitespace-nowrap"
            >
              <span className="hidden xl:inline">{PRIMARY_CTA_LABEL}</span>
              <span className="xl:hidden">{PRIMARY_CTA_LABEL_SHORT}</span>
            </a>

            {/* Burger — shown wherever the inline links aren't (below lg) */}
            <button
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              // 44x44 (w-11 h-11), not 32: WCAG's minimum tap target, and
              // this is the primary nav control for someone using one thumb
              // on a job site. The bars inside are unchanged, so it looks the
              // same — only the hit area grew.
              className="lg:hidden flex flex-col justify-center items-center w-11 h-11 gap-[5px] rounded-lg hover:bg-[var(--surface-sunken)] transition-colors"
              aria-label={open ? "Close menu" : "Open menu"}
            >
              <span
                className="block h-px bg-foreground transition-all duration-300 origin-center"
                style={{ width: "18px", transform: open ? "translateY(6px) rotate(45deg)" : "none" }}
              />
              <span
                className="block h-px bg-foreground transition-all duration-300"
                style={{ width: "18px", opacity: open ? 0 : 1, transform: open ? "scaleX(0)" : "none" }}
              />
              <span
                className="block h-px bg-foreground transition-all duration-300 origin-center"
                style={{ width: "18px", transform: open ? "translateY(-6px) rotate(-45deg)" : "none" }}
              />
            </button>
          </div>
        </nav>

        {/* Collapsed menu — same breakpoint as the burger that opens it */}
        <div
          className="lg:hidden mt-2 overflow-hidden transition-all duration-300 ease-in-out"
          style={{ maxHeight: open ? "420px" : "0px", opacity: open ? 1 : 0 }}
        >
          <div className="rounded-2xl border border-border px-2 py-2 flex flex-col" style={NAV_STYLE}>
            {NAV_LINKS.map((l) => (
              <a
                key={l.label}
                href={l.href}
                onClick={close}
                className="px-4 py-3 text-sm text-muted-foreground hover:text-foreground hover:bg-[var(--surface-sunken)] rounded-xl transition-colors"
              >
                {l.label}
              </a>
            ))}
            <a
              href="/login"
              onClick={close}
              className="px-4 py-3 text-sm text-muted-foreground hover:text-foreground hover:bg-[var(--surface-sunken)] rounded-xl transition-colors"
            >
              Log In
            </a>
            <div className="mt-1 px-2 pb-1">
              <a
                href={PRIMARY_CTA_HREF}
                onClick={close}
                className="block text-center w-full text-sm px-4 py-3 rounded-full bg-[var(--brand-teal-bright)] text-white font-medium hover:bg-[var(--brand-teal)] transition-all duration-200"
              >
                {PRIMARY_CTA_LABEL}
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
