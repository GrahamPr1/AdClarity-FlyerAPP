"use client"

import { useState } from "react"
import { NAV_LINKS, PRIMARY_CTA_HREF, PRIMARY_CTA_LABEL, PRIMARY_CTA_LABEL_SHORT } from "@/lib/marketing"

const NAV_STYLE = {
  backdropFilter: "blur(16px)",
  WebkitBackdropFilter: "blur(16px)",
  background: "rgba(27,30,38,0.55)",
  boxShadow: "0 8px 32px rgba(0,0,0,0.35), 0 2px 8px rgba(0,0,0,0.25)",
} as const

export function MobileNav() {
  const [open, setOpen] = useState(false)

  const close = () => setOpen(false)

  return (
    <div className="fixed top-4 inset-x-0 z-50 flex justify-center px-4 pointer-events-none">
      <div className="pointer-events-auto w-full max-w-4xl">
        {/* Main bar */}
        <nav
          className="flex items-center justify-between px-5 py-3 rounded-2xl border border-white/10"
          style={NAV_STYLE}
        >
          <a href="#top" className="font-semibold text-sm tracking-tight text-white flex items-center gap-2">
            <span className="inline-block w-2 h-2 rounded-full bg-[var(--brand-teal-bright)]" />
            OneFlyer
          </a>

          {/* Desktop links */}
          <div className="hidden lg:flex items-center gap-6">
            {NAV_LINKS.map((l) => (
              <a
                key={l.label}
                href={l.href}
                className="text-[13px] text-white/60 hover:text-white transition-colors duration-200"
              >
                {l.label}
              </a>
            ))}
          </div>

          <div className="flex items-center gap-3">
            <a
              href="/login"
              className="hidden sm:block text-[13px] text-white/55 hover:text-white transition-colors"
            >
              Log In
            </a>
            {/* Stays visible the whole way down the page — this is the one
                conversion the whole funnel points at. The short label is used
                below xl, where the full sentence wraps and breaks the bar. */}
            <a
              href={PRIMARY_CTA_HREF}
              className="block text-[12px] sm:text-[13px] px-3 sm:px-4 py-2 rounded-lg bg-[var(--brand-teal-bright)] text-white font-semibold hover:bg-[var(--brand-teal)] transition-all duration-200 whitespace-nowrap"
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
              className="lg:hidden flex flex-col justify-center items-center w-11 h-11 gap-[5px] rounded-lg hover:bg-white/10 transition-colors"
              aria-label={open ? "Close menu" : "Open menu"}
            >
              <span
                className="block h-px bg-white/70 transition-all duration-300 origin-center"
                style={{ width: "18px", transform: open ? "translateY(6px) rotate(45deg)" : "none" }}
              />
              <span
                className="block h-px bg-white/70 transition-all duration-300"
                style={{ width: "18px", opacity: open ? 0 : 1, transform: open ? "scaleX(0)" : "none" }}
              />
              <span
                className="block h-px bg-white/70 transition-all duration-300 origin-center"
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
          <div className="rounded-2xl border border-white/10 px-2 py-2 flex flex-col" style={NAV_STYLE}>
            {NAV_LINKS.map((l) => (
              <a
                key={l.label}
                href={l.href}
                onClick={close}
                className="px-4 py-3 text-sm text-white/70 hover:text-white hover:bg-white/5 rounded-xl transition-colors"
              >
                {l.label}
              </a>
            ))}
            <a
              href="/login"
              onClick={close}
              className="px-4 py-3 text-sm text-white/70 hover:text-white hover:bg-white/5 rounded-xl transition-colors"
            >
              Log In
            </a>
            <div className="mt-1 px-2 pb-1">
              <a
                href={PRIMARY_CTA_HREF}
                onClick={close}
                className="block text-center w-full text-sm px-4 py-3 rounded-xl bg-[var(--brand-teal-bright)] text-white font-semibold hover:bg-[var(--brand-teal)] transition-all duration-200"
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
