"use client"

import { useState } from "react"
import { MobileNav } from "@/components/mobile-nav"
import { IntroAnimation, HERO_REVEAL_MS } from "@/components/intro-animation"
import { RevealText } from "@/components/reveal-text"
import { Reveal } from "@/components/reveal"
import { PricingCards } from "@/components/pricing-cards"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"

/* --------------------------------- Icons --------------------------------- */
function Icon({ path, className = "" }: { path: React.ReactNode; className?: string }) {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {path}
    </svg>
  )
}

const ICONS = {
  brand: <><path d="M12 2 2 7l10 5 10-5-10-5Z" /><path d="m2 17 10 5 10-5" /><path d="m2 12 10 5 10-5" /></>,
  reputation: <><path d="M12 2 15 8l6 .9-4.5 4.3 1 6-5.5-3-5.5 3 1-6L3 8.9 9 8Z" /></>,
  content: <><rect x="2" y="4" width="20" height="16" rx="2" /><path d="m10 9 5 3-5 3V9Z" /></>,
  ads: <><path d="M3 11v3a1 1 0 0 0 1 1h3l4 4V7L7 11H4a1 1 0 0 0-1 0Z" /><path d="M15.5 8.5a5 5 0 0 1 0 7" /></>,
  comms: <><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2Z" /></>,
  assess: <><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></>,
  build: <><path d="M14.7 6.3a4 4 0 0 0-5.6 5.6l-6.4 6.4a2 2 0 1 0 2.8 2.8l6.4-6.4a4 4 0 0 0 5.6-5.6l-2.5 2.5-2.1-2.1 2.5-2.5Z" /></>,
  automate: <><path d="M12 2v4" /><path d="m16.2 7.8 2.9-2.9" /><path d="M18 12h4" /><path d="M12 22a10 10 0 1 0-8-4" /></>,
  check: <polyline points="20 6 9 17 4 12" />,
}

/* Rotating accent palette for icon tiles — adds color variety across sections */
const ACCENTS = [
  { fg: "var(--brand-teal-bright)", bg: "var(--brand-teal-tint)" },
  { fg: "var(--brand-amber)", bg: "var(--brand-amber-tint)" },
  { fg: "var(--brand-sky)", bg: "rgba(70,184,230,0.12)" },
]

/* ----------------------------- Small helpers ----------------------------- */
function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-white/10 bg-white/[0.04] text-[11px] tracking-widest uppercase text-[var(--brand-teal-bright)]">
      <span className="w-1.5 h-1.5 rounded-full bg-[var(--brand-teal-bright)]" />
      {children}
    </span>
  )
}

/* ---------------------------- Hero visual mock --------------------------- */
function HeroVisual() {
  return (
    <div className="relative w-full">
      <div className="rounded-2xl border border-white/10 bg-card p-5 shadow-2xl shadow-black/40">
        <div className="flex items-center gap-2 mb-4">
          <span className="w-2.5 h-2.5 rounded-full bg-white/15" />
          <span className="w-2.5 h-2.5 rounded-full bg-white/15" />
          <span className="w-2.5 h-2.5 rounded-full bg-white/15" />
          <span className="ml-3 text-[11px] text-muted-foreground tracking-wide">your brand system</span>
        </div>
        <div className="grid grid-cols-3 gap-3">
          {/* Flyer — real white "paper" */}
          <div className="col-span-1 rounded-xl bg-white border border-white/10 p-3 flex flex-col gap-2 shadow-lg shadow-black/30">
            <div className="h-2 w-8 rounded bg-[var(--brand-teal)]" />
            <div className="h-1.5 w-full rounded bg-[var(--on-white)]/25" />
            <div className="h-1.5 w-3/4 rounded bg-[var(--on-white)]/15" />
            <div className="mt-2 h-10 rounded-lg bg-[var(--surface-soft)] border border-[var(--on-white)]/5" />
            <div className="h-1.5 w-full rounded bg-[var(--on-white)]/15" />
            <div className="h-1.5 w-2/3 rounded bg-[var(--on-white)]/10" />
          </div>
          {/* Content post + reviews */}
          <div className="col-span-2 flex flex-col gap-3">
            <div className="rounded-xl bg-[var(--brand-navy-deep)] border border-white/10 p-3">
              <div className="flex items-center gap-2 mb-2">
                <span className="w-6 h-6 rounded-full bg-[var(--brand-teal)]" />
                <div className="flex flex-col gap-1">
                  <div className="h-1.5 w-20 rounded bg-white/20" />
                  <div className="h-1.5 w-12 rounded bg-white/10" />
                </div>
              </div>
              <div className="h-14 rounded-lg bg-white/[0.06] flex items-center justify-center text-[var(--brand-teal-bright)]">
                <Icon path={ICONS.content} />
              </div>
            </div>
            <div className="rounded-xl bg-[var(--brand-teal-tint)] border border-[var(--brand-teal)]/40 p-3 flex items-center justify-between">
              <div className="flex flex-col gap-1">
                <div className="flex gap-0.5 text-[var(--brand-teal-bright)]">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Icon key={i} path={ICONS.reputation} className="w-3.5 h-3.5" />
                  ))}
                </div>
                <div className="h-1.5 w-24 rounded bg-white/20" />
              </div>
              <span className="text-xs font-semibold text-[var(--brand-teal-bright)]">+ review</span>
            </div>
          </div>
        </div>
      </div>
      {/* soft teal glow */}
      <div
        className="absolute -inset-6 -z-10 rounded-[2rem] opacity-40 blur-3xl"
        style={{ background: "radial-gradient(circle at 70% 30%, rgba(14,124,123,0.35), transparent 60%)" }}
      />
    </div>
  )
}

/* --------------------------------- Data ---------------------------------- */
const ADDONS = [
  {
    icon: ICONS.content,
    title: "Organic Content Engine",
    desc: "Always-on short-form video and post generation and publishing — on-brand, grounded in your real services, with no ad spend.",
    note: null,
  },
  {
    icon: ICONS.ads,
    title: "Paid Advertising Management",
    desc: "Google and Meta campaign management layered on top of your brand foundation — creative, copy, targeting, and optimization handled for you.",
    note: "Included in the Plus plan — you set your own monthly ad budget.",
  },
  {
    icon: ICONS.comms,
    title: "Automated Client Communication",
    desc: "AI receptionist and chat plus automated email and SMS follow-up sequences that keep every lead warm.",
    note: null,
  },
]

const STEPS = [
  { n: "01", icon: ICONS.assess, title: "Assess", desc: "We audit your current branding, materials, listings, and content to find what's missing." },
  { n: "02", icon: ICONS.build, title: "Build", desc: "We build your brand identity, flyers, website updates, and referral kit — all owned by you." },
  { n: "03", icon: ICONS.automate, title: "Automate & Manage", desc: "Ongoing reputation, referral, and (if selected) content and communication systems, billed monthly." },
]

const FAQS = [
  {
    q: "What's the difference between the two plans?",
    a: "Basic is a $250 one-time build of your brand, collateral, website refresh, and reputation and referral systems that you own outright, then just $50/mo to keep everything updated. Plus is a $500 one-time build that adds managed paid advertising on top — you choose your own monthly ad budget at checkout and can change it anytime.",
  },
  {
    q: "What does the $50/mo (or my ad spend) actually pay for?",
    a: "The monthly retainer keeps your account active so you can come back anytime and have your materials refreshed, rewritten, and re-designed as your business changes — up to 20 flyers per month included. Your build isn't a one-and-done file dump; it's a living system you keep updating. On the Plus plan, your monthly amount is the ad budget you set, which funds your managed Google and Meta campaigns.",
  },
  {
    q: "How does the ad budget work on the Plus plan?",
    a: "You set your monthly ad spend right at checkout (minimum $300/mo) and can raise or lower it anytime from your dashboard. That budget goes toward your paid ads, and we handle the creative, copy, targeting, and optimization for you.",
  },
  {
    q: "Is there a long-term contract?",
    a: "No long-term lock-in — the monthly retainer is cancelable anytime. The one-time build fee covers the initial brand and collateral build that you keep regardless of how long you subscribe.",
  },
  {
    q: "How much collateral do I actually get?",
    a: "Your build covers the full set of flyers, sheets, and one-pagers your business needs to launch, and your monthly retainer includes up to 20 flyer updates or new pieces every month — request them anytime from your client dashboard. Large-scale or specialty campaigns are simply scoped and quoted separately.",
  },
  {
    q: "How do I get my flyers and website once I sign up?",
    a: "After checkout, you'll complete a short onboarding form with your business details and brand assets. From there you can track progress and download finished flyers and your website from your client dashboard.",
  },
]

/* --------------------------------- Page ---------------------------------- */
export default function Page() {
  const [heroReady, setHeroReady] = useState(false)

  return (
    <div id="top" className="min-h-screen bg-background text-foreground overflow-x-hidden">
      <IntroAnimation onDone={() => setHeroReady(true)} />
      <MobileNav />

      {/* ── HERO ─────────────────────────────────────────────────────────── */}
      <section className="relative px-6 md:px-12 lg:px-20 pt-36 md:pt-44 pb-24 overflow-hidden">
        {/* ambient color glows */}
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
          <div
            className="absolute -top-32 -left-24 w-[36rem] h-[36rem] rounded-full blur-[120px] opacity-40"
            style={{ background: "radial-gradient(circle, rgba(19,168,164,0.35), transparent 65%)" }}
          />
          <div
            className="absolute top-24 -right-24 w-[30rem] h-[30rem] rounded-full blur-[120px] opacity-25"
            style={{ background: "radial-gradient(circle, rgba(245,181,68,0.28), transparent 65%)" }}
          />
        </div>
        <div className="max-w-6xl mx-auto grid lg:grid-cols-2 gap-14 items-center">
          <div>
            <div
              style={{
                opacity: heroReady ? 1 : 0,
                transform: heroReady ? "translateY(0)" : "translateY(16px)",
                transition: "opacity 0.7s cubic-bezier(0.16,1,0.3,1), transform 0.7s cubic-bezier(0.16,1,0.3,1)",
              }}
            >
              <Tag>Back-End & Organic Marketing</Tag>
            </div>
            <RevealText
              as="h1"
              className="mt-6 text-4xl sm:text-5xl lg:text-[3.5rem] font-semibold tracking-tight leading-[1.05] text-balance text-white"
              delay={HERO_REVEAL_MS - 200}
              stagger={55}
            >
              {"Back-End & Organic\nMarketing Systems for\nGrowing Businesses"}
            </RevealText>
            <p
              className="mt-6 text-base sm:text-lg text-muted-foreground leading-relaxed max-w-lg"
              style={{
                opacity: heroReady ? 1 : 0,
                transform: heroReady ? "translateY(0)" : "translateY(16px)",
                transition: "opacity 0.8s cubic-bezier(0.16,1,0.3,1) 120ms, transform 0.8s cubic-bezier(0.16,1,0.3,1) 120ms",
              }}
            >
              We build the brand, materials, and always-on reputation systems your business owns outright — no ad spend required to start.
            </p>
            <div
              className="mt-8 flex flex-col sm:flex-row gap-3"
              style={{
                opacity: heroReady ? 1 : 0,
                transform: heroReady ? "translateY(0)" : "translateY(16px)",
                transition: "opacity 0.8s cubic-bezier(0.16,1,0.3,1) 240ms, transform 0.8s cubic-bezier(0.16,1,0.3,1) 240ms",
              }}
            >
              <a
                href="#pricing"
                className="px-7 py-3.5 rounded-xl bg-[var(--brand-teal-bright)] text-white text-sm font-semibold hover:bg-[var(--brand-teal)] transition-colors text-center shadow-lg shadow-[var(--brand-teal)]/25"
              >
                View Plans
              </a>
              <a
                href="#services"
                className="px-7 py-3.5 rounded-xl border border-white/15 text-foreground/80 text-sm font-medium hover:bg-white/[0.05] hover:border-white/25 transition-all text-center"
              >
                See What&apos;s Included
              </a>
            </div>

            {/* Light trust-point chips — inject white on the dark hero */}
            <div
              className="mt-8 flex flex-wrap gap-2.5"
              style={{
                opacity: heroReady ? 1 : 0,
                transform: heroReady ? "translateY(0)" : "translateY(16px)",
                transition: "opacity 0.8s cubic-bezier(0.16,1,0.3,1) 340ms, transform 0.8s cubic-bezier(0.16,1,0.3,1) 340ms",
              }}
            >
              {["No long-term contracts", "You own everything", "Built for local businesses"].map((t) => (
                <span
                  key={t}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white text-[var(--on-white)] text-xs font-medium shadow-sm"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--brand-teal)" strokeWidth="3" aria-hidden="true">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  {t}
                </span>
              ))}
            </div>
          </div>

          <div
            style={{
              opacity: heroReady ? 1 : 0,
              transform: heroReady ? "translateY(0) scale(1)" : "translateY(24px) scale(0.98)",
              transition: "opacity 0.9s cubic-bezier(0.16,1,0.3,1) 200ms, transform 0.9s cubic-bezier(0.16,1,0.3,1) 200ms",
            }}
          >
            <HeroVisual />
          </div>
        </div>
      </section>

      {/* ── PROBLEM (white contrast band) ────────────────────────────────── */}
      <section className="px-6 md:px-12 lg:px-20 py-20 border-t border-white/[0.06]">
        <div className="max-w-6xl mx-auto">
          <div className="rounded-3xl bg-[var(--surface-white)] px-6 py-16 md:px-16 md:py-20 shadow-2xl shadow-black/40">
            <div className="max-w-3xl mx-auto text-center">
              <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-[var(--on-white)]/10 bg-[var(--surface-soft)] text-[11px] tracking-widest uppercase text-[var(--brand-teal)]">
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--brand-teal)]" />
                The Problem
              </span>
              <RevealText
                as="h2"
                className="mt-6 text-2xl md:text-3xl lg:text-4xl font-semibold tracking-tight leading-snug text-balance text-[var(--on-white)]"
              >
                Most businesses have no marketing foundation underneath them.
              </RevealText>
              <Reveal delay={120}>
                <p className="mt-6 text-base md:text-lg text-[var(--on-white-muted)] leading-relaxed text-pretty">
                  Most businesses either have no real marketing infrastructure — no consistent brand, no sales materials, no system for turning referrals or reviews into revenue — or they&apos;re paying for scattered vendors and ad campaigns with no foundation underneath them. AdClarity builds what&apos;s missing, and you own it outright.
                </p>
              </Reveal>
            </div>
          </div>
        </div>
      </section>

      {/* ── SERVICES (CORE) ──────────────────────────────────────────────── */}
      <section id="services" className="px-6 md:px-12 lg:px-20 py-24 border-t border-white/[0.06] scroll-mt-24">
        <div className="max-w-6xl mx-auto">
          <Reveal>
            <Tag>What&apos;s Included</Tag>
          </Reveal>
          <RevealText
            as="h2"
            className="mt-6 text-3xl md:text-4xl font-semibold tracking-tight leading-tight max-w-2xl text-balance"
          >
            The core foundation every plan is built on.
          </RevealText>

          <div className="mt-12 grid md:grid-cols-2 gap-6">
            <Reveal>
              <div className="h-full rounded-2xl border border-white/10 bg-card p-8">
                <div className="w-11 h-11 rounded-xl bg-[var(--brand-teal-tint)] flex items-center justify-center text-[var(--brand-teal-bright)]">
                  <Icon path={ICONS.brand} />
                </div>
                <h3 className="mt-5 text-xl font-semibold">Brand & Collateral Build</h3>
                <ul className="mt-5 flex flex-col gap-3">
                  {[
                    "Visual identity refinement — logo, colors, fonts",
                    "Professionally designed flyers, sheets & one-pagers for referral partners and new-client packets",
                    "Website / landing page refresh",
                    "Referral & partner kits",
                  ].map((f) => (
                    <li key={f} className="flex items-start gap-2.5 text-sm text-foreground/85">
                      <span className="text-[var(--brand-teal-bright)] mt-0.5"><Icon path={ICONS.check} className="w-4 h-4" /></span>
                      <span className="leading-snug">{f}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </Reveal>

            <Reveal delay={100}>
              <div className="h-full rounded-2xl border border-white/10 bg-card p-8">
                <div className="w-11 h-11 rounded-xl flex items-center justify-center" style={{ background: "var(--brand-amber-tint)", color: "var(--brand-amber)" }}>
                  <Icon path={ICONS.reputation} />
                </div>
                <h3 className="mt-5 text-xl font-semibold">Reputation & Referral Systems</h3>
                <ul className="mt-5 flex flex-col gap-3">
                  {[
                    "Automated review requests",
                    "Documented referral program setup",
                    "Google Business Profile & listings management",
                    "Systems that turn happy customers into revenue",
                  ].map((f) => (
                    <li key={f} className="flex items-start gap-2.5 text-sm text-foreground/85">
                      <span className="mt-0.5" style={{ color: "var(--brand-amber)" }}><Icon path={ICONS.check} className="w-4 h-4" /></span>
                      <span className="leading-snug">{f}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ── OPTIONAL ADD-ONS ─────────────────────────────────────────────── */}
      <section className="px-6 md:px-12 lg:px-20 py-24 border-t border-white/[0.06]">
        <div className="max-w-6xl mx-auto">
          <Reveal>
            <Tag>Optional Add-Ons</Tag>
          </Reveal>
          <RevealText
            as="h2"
            className="mt-6 text-3xl md:text-4xl font-semibold tracking-tight leading-tight max-w-2xl text-balance"
          >
            Layer on more growth once the foundation is set.
          </RevealText>
          <Reveal delay={80}>
            <p className="mt-4 text-sm text-muted-foreground max-w-xl">
              These are optional, layered on top of the core plans below.
            </p>
          </Reveal>

          <div className="mt-12 grid md:grid-cols-3 gap-6">
            {ADDONS.map((a, i) => {
              const accent = ACCENTS[i % ACCENTS.length]
              return (
                <Reveal key={a.title} delay={i * 90}>
                  <div className="h-full rounded-2xl border border-white/10 bg-card p-7 flex flex-col transition-colors hover:border-white/20">
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center"
                      style={{ background: accent.bg, color: accent.fg }}
                    >
                      <Icon path={a.icon} />
                    </div>
                    <h3 className="mt-5 text-lg font-semibold">{a.title}</h3>
                    <p className="mt-2.5 text-sm text-muted-foreground leading-relaxed flex-1">{a.desc}</p>
                    {a.note && (
                      <p
                        className="mt-4 text-xs rounded-lg px-3 py-2"
                        style={{ background: accent.bg, color: accent.fg }}
                      >
                        {a.note}
                      </p>
                    )}
                  </div>
                </Reveal>
              )
            })}
          </div>
        </div>
      </section>

      {/* ── PRICING ──────────────────────────────────────────────────────── */}
      <section id="pricing" className="relative px-6 md:px-12 lg:px-20 py-24 border-t border-white/[0.06] scroll-mt-24 overflow-hidden">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
          <div
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[42rem] h-[42rem] rounded-full blur-[130px] opacity-25"
            style={{ background: "radial-gradient(circle, rgba(19,168,164,0.3), transparent 65%)" }}
          />
        </div>
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <Reveal>
              <Tag>Pricing</Tag>
            </Reveal>
            <RevealText
              as="h2"
              className="mt-6 text-3xl md:text-4xl font-semibold tracking-tight leading-tight text-balance"
            >
              A one-time build, then an owned system on subscription.
            </RevealText>
          </div>

          <PricingCards />

          <Reveal delay={160}>
            <p className="mt-8 text-center text-sm text-muted-foreground max-w-2xl mx-auto leading-relaxed">
              Both plans include up to 20 flyer updates or new pieces per month. On the Plus plan you set your own monthly ad budget (minimum $300/mo) and can change it anytime. Large-scale or specialty campaigns are scoped separately.
            </p>
          </Reveal>
        </div>
      </section>

      {/* ── HOW IT WORKS ─────────────────────────────────────────────────── */}
      <section id="how-it-works" className="px-6 md:px-12 lg:px-20 py-24 border-t border-white/[0.06] scroll-mt-24">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <Reveal>
              <Tag>How It Works</Tag>
            </Reveal>
            <RevealText
              as="h2"
              className="mt-6 text-3xl md:text-4xl font-semibold tracking-tight leading-tight text-balance"
            >
              Three steps to a marketing system you own.
            </RevealText>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {STEPS.map((s, i) => {
              const accent = ACCENTS[i % ACCENTS.length]
              return (
                <Reveal key={s.n} delay={i * 100}>
                  <div className="h-full rounded-2xl border border-white/10 bg-card p-8 transition-colors hover:border-white/20">
                    <div className="flex items-center justify-between">
                      <div
                        className="w-11 h-11 rounded-xl flex items-center justify-center"
                        style={{ background: accent.bg, color: accent.fg }}
                      >
                        <Icon path={s.icon} />
                      </div>
                      <span className="text-2xl font-bold" style={{ color: accent.fg, opacity: 0.35 }}>{s.n}</span>
                    </div>
                    <h3 className="mt-5 text-lg font-semibold">{s.title}</h3>
                    <p className="mt-2.5 text-sm text-muted-foreground leading-relaxed">{s.desc}</p>
                  </div>
                </Reveal>
              )
            })}
          </div>
        </div>
      </section>

      {/* ── FAQ ──────────────────────────────────────────────────────────── */}
      <section id="faq" className="px-6 md:px-12 lg:px-20 py-24 border-t border-white/[0.06] scroll-mt-24">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-10">
            <Reveal>
              <Tag>FAQ</Tag>
            </Reveal>
            <RevealText
              as="h2"
              className="mt-6 text-3xl md:text-4xl font-semibold tracking-tight leading-tight text-balance"
            >
              Questions, answered.
            </RevealText>
          </div>
          <Reveal>
            <Accordion type="single" collapsible className="w-full">
              {FAQS.map((f, i) => (
                <AccordionItem key={i} value={`item-${i}`} className="border-white/10">
                  <AccordionTrigger className="text-left text-base font-medium hover:no-underline hover:text-[var(--brand-teal-bright)]">
                    {f.q}
                  </AccordionTrigger>
                  <AccordionContent className="text-sm text-muted-foreground leading-relaxed">
                    {f.a}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </Reveal>
        </div>
      </section>

      {/* ── FOOTER ───────────────────────────────────────────────────────── */}
      <footer className="px-6 md:px-12 lg:px-20 py-14 border-t border-white/[0.06]">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row justify-between gap-8">
          <div className="max-w-xs">
            <div className="flex items-center gap-2 font-semibold">
              <span className="inline-block w-2 h-2 rounded-full bg-[var(--brand-teal-bright)]" />
              AdClarity
            </div>
            <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
              Back-end and organic marketing systems your business owns outright.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-10">
            <div className="flex flex-col gap-2.5">
              <span className="text-xs uppercase tracking-widest text-muted-foreground/70">Explore</span>
              <a href="#services" className="text-sm text-foreground/70 hover:text-white transition-colors">Services</a>
              <a href="#pricing" className="text-sm text-foreground/70 hover:text-white transition-colors">Pricing</a>
              <a href="#how-it-works" className="text-sm text-foreground/70 hover:text-white transition-colors">How It Works</a>
              <a href="#faq" className="text-sm text-foreground/70 hover:text-white transition-colors">FAQ</a>
            </div>
            <div className="flex flex-col gap-2.5">
              <span className="text-xs uppercase tracking-widest text-muted-foreground/70">Contact</span>
              {/* TODO: Replace with the real business email once set up */}
              <a href="mailto:hello@adclarity.co" className="text-sm text-foreground/70 hover:text-white transition-colors">hello@adclarity.co</a>
              <a href="/dashboard" className="text-sm text-foreground/70 hover:text-white transition-colors">Client Login</a>
              <div className="flex gap-3 mt-1">
                <span className="text-sm text-muted-foreground/60">Instagram</span>
                <span className="text-sm text-muted-foreground/60">LinkedIn</span>
              </div>
            </div>
          </div>
        </div>
        <div className="max-w-6xl mx-auto mt-10 pt-6 border-t border-white/[0.06]">
          <span className="text-xs text-muted-foreground/60">© 2026 AdClarity. All rights reserved.</span>
        </div>
      </footer>
    </div>
  )
}
