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
  sparkles: <><path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3Z" /><path d="M19 13l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7.7-2Z" /></>,
  download: <><path d="M12 3v12" /><path d="m7 10 5 5 5-5" /><path d="M5 21h14" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 3" /></>,
  qr: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><path d="M14 21v-4h4" /><path d="M21 14v3" /><path d="M17 17h.01" /></>,
  save: <path d="M19 21 12 16 5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2Z" />,
  share: <><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><path d="M8.6 10.6 15.4 6.4" /><path d="M8.6 13.4 15.4 17.6" /></>,
  print: <><path d="M6 9V3h12v6" /><rect x="4" y="9" width="16" height="8" rx="1" /><path d="M6 17v4h12v-4" /></>,
}

/* Rotating accent palette for icon tiles — adds color variety across sections */
const ACCENTS = [
  { fg: "var(--brand-teal-bright)", bg: "var(--brand-teal-tint)" },
  { fg: "var(--brand-slate)", bg: "var(--brand-slate-tint)" },
  { fg: "var(--brand-sky)", bg: "rgba(142,203,245,0.12)" },
  { fg: "var(--brand-ice)", bg: "var(--brand-ice-tint)" },
]

/* Shared card-lift treatment — a bit more tactile/inviting than a plain border-color swap */
const CARD_HOVER = "transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-black/20"

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
          <span className="ml-3 text-[11px] text-muted-foreground tracking-wide">your flyer, on-brand</span>
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
          {/* AI design engine + dashboard status preview */}
          <div className="col-span-2 flex flex-col gap-3">
            <div className="rounded-xl bg-[var(--brand-navy-deep)] border border-white/10 p-3">
              <div className="flex items-center gap-2 mb-2">
                <span className="w-6 h-6 rounded-full bg-[var(--brand-teal)] flex items-center justify-center text-white">
                  <Icon path={ICONS.sparkles} className="w-3.5 h-3.5" />
                </span>
                <div className="flex flex-col gap-1">
                  <div className="h-1.5 w-24 rounded bg-white/20" />
                  <div className="h-1.5 w-14 rounded bg-white/10" />
                </div>
              </div>
              <div className="h-14 rounded-lg bg-white/[0.06] flex items-center justify-center gap-2 px-3">
                {["var(--brand-teal-bright)", "var(--brand-slate)", "var(--brand-sky)", "var(--brand-ice)"].map((c) => (
                  <span key={c} className="w-6 h-6 rounded-full" style={{ background: c }} />
                ))}
                <span className="text-xs text-muted-foreground ml-1">brand-matched</span>
              </div>
            </div>
            <div className="rounded-xl bg-[var(--brand-teal-tint)] border border-[var(--brand-teal)]/40 p-3 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <div className="h-1.5 w-28 rounded bg-white/20" />
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium bg-[var(--brand-teal-tint)] text-[var(--brand-teal-bright)] border border-[var(--brand-teal)]/40">
                  <span className="w-1.5 h-1.5 rounded-full bg-current" />Ready
                </span>
              </div>
              <div className="flex items-center justify-between">
                <div className="h-1.5 w-20 rounded bg-white/15" />
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-400/10 text-amber-300 border border-amber-400/30">
                  <span className="w-1.5 h-1.5 rounded-full bg-current" />In Progress
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
      {/* soft terracotta glow */}
      <div
        className="absolute -inset-6 -z-10 rounded-[2rem] opacity-40 blur-3xl"
        style={{ background: "radial-gradient(circle at 70% 30%, rgba(94,184,240,0.35), transparent 60%)" }}
      />
    </div>
  )
}

/* --------------------------------- Data ---------------------------------- */
const NEW_FEATURES = [
  {
    icon: ICONS.qr,
    title: "Know What's Working",
    desc: "Every flyer includes a built-in QR code that tracks real scans and clicks — so you can see if a flyer actually got a response, not just that it looks good.",
    tier: "Basic",
  },
  {
    icon: ICONS.share,
    title: "One Flyer, Every Channel",
    desc: "Every flyer also comes with a matching Instagram post, a text-blast blurb, and a Nextdoor post — all written to fit, so one campaign covers everywhere your customers are.",
    tier: "Basic",
  },
  {
    icon: ICONS.save,
    title: "Save Your Info Once",
    desc: "Save your business info once and reuse it to fill out any future form automatically — no more re-uploading the same paperwork every time.",
    tier: "Pro",
  },
  {
    icon: ICONS.print,
    title: "Get It Printed",
    desc: "Request printed copies of any flyer right from your dashboard — tell us the quantity and where to ship it, and we'll take care of the rest.",
    tier: "Basic",
  },
]

const WHY_ONEFLYER = [
  {
    icon: ICONS.sparkles,
    title: "AI Design Engine",
    desc: "Every flyer is generated by AI and automatically matched to your brand — colors, fonts, and layout, no templates to wrestle with.",
    note: null,
  },
  {
    icon: ICONS.clock,
    title: "Minutes, Not Days",
    desc: "Tell us about your business once and get professional flyers back in minutes — not the days or weeks a design agency takes.",
    note: null,
  },
  {
    icon: ICONS.check,
    title: "You Own Every Flyer",
    desc: "Every flyer you generate is yours to keep, download, and reuse — no subscription required to access what you've already made.",
    note: null,
  },
]

const STEPS = [
  { n: "01", icon: ICONS.assess, title: "Tell Us About Your Business", desc: "A quick form covers your services, brand colors, and what you need each flyer to say." },
  { n: "02", icon: ICONS.build, title: "We Design Your Flyers", desc: "Our AI matches your brand and designs a print-ready flyer for each request — no back-and-forth required." },
  { n: "03", icon: ICONS.download, title: "Download & Use", desc: "Your finished flyers land in your dashboard, ready to print, share, or post online." },
]

const FAQS = [
  {
    q: "What's the difference between the plans?",
    a: "Free Trial gives you 3 flyers a month to try the AI design engine, no credit card required. Basic is $19/month for 25 flyers plus QR scan/click tracking, Instagram/text/Nextdoor versions of every flyer, and print requests. Pro is $39/month for 50 flyers, everything in Basic, plus a saved Business Profile that auto-fills any form.",
  },
  {
    q: "Do I need any design experience?",
    a: "No. Just tell us about your business and what you need each flyer to say — our AI handles the layout, colors, and fonts automatically, matched to your brand.",
  },
  {
    q: "What if I run out of flyers on my plan?",
    a: "You can upgrade to a higher tier anytime, or email us if you need more than Pro includes — we're happy to help with custom volume.",
  },
  {
    q: "Is there a long-term contract?",
    a: "No — Basic and Pro are both cancel-anytime monthly plans. The Free Trial never requires a credit card at all.",
  },
  {
    q: "What if I don't have a logo or brand colors yet?",
    a: "That's fine — OneFlyer can still generate a professional, cohesive look for your flyers based on your business details and preferred style.",
  },
  {
    q: "How do I get my flyers once I sign up?",
    a: "After a short onboarding form, your flyers appear in your dashboard as they're generated — track progress and download each one the moment it's ready.",
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
            style={{ background: "radial-gradient(circle, rgba(94,184,240,0.35), transparent 65%)" }}
          />
          <div
            className="absolute top-24 -right-24 w-[30rem] h-[30rem] rounded-full blur-[120px] opacity-25"
            style={{ background: "radial-gradient(circle, rgba(154,165,177,0.28), transparent 65%)" }}
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
              <Tag>AI-Designed Flyers</Tag>
            </div>
            <RevealText
              as="h1"
              className="mt-6 text-4xl sm:text-5xl lg:text-[3.5rem] font-semibold tracking-tight leading-[1.05] text-balance text-white"
              delay={HERO_REVEAL_MS - 200}
              stagger={55}
            >
              {"Beautiful Flyers\nfor Your Business,\nReady in Minutes"}
            </RevealText>
            <p
              className="mt-6 text-base sm:text-lg text-muted-foreground leading-relaxed max-w-lg"
              style={{
                opacity: heroReady ? 1 : 0,
                transform: heroReady ? "translateY(0)" : "translateY(16px)",
                transition: "opacity 0.8s cubic-bezier(0.16,1,0.3,1) 120ms, transform 0.8s cubic-bezier(0.16,1,0.3,1) 120ms",
              }}
            >
              OneFlyer designs brand-matched, print-ready flyers for your business using AI — no design skills, no waiting on an agency.
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
              {["No credit card required", "You own every flyer", "Built for local businesses"].map((t) => (
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
                Most small businesses don&apos;t have a designer on call.
              </RevealText>
              <Reveal delay={120}>
                <p className="mt-6 text-base md:text-lg text-[var(--on-white-muted)] leading-relaxed text-pretty">
                  Hiring a designer or agency for every flyer is slow and expensive, and DIY tools still expect you to know design. OneFlyer generates professional, brand-matched flyers in minutes — you just tell us about your business.
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
            Everything you need, built into every flyer.
          </RevealText>

          <div className="mt-12 grid md:grid-cols-2 gap-6">
            <Reveal>
              <div className="h-full rounded-2xl border border-white/10 bg-card p-8">
                <div className="w-11 h-11 rounded-xl bg-[var(--brand-teal-tint)] flex items-center justify-center text-[var(--brand-teal-bright)]">
                  <Icon path={ICONS.brand} />
                </div>
                <h3 className="mt-5 text-xl font-semibold">Your Brand, Applied Automatically</h3>
                <ul className="mt-5 flex flex-col gap-3">
                  {[
                    "Logo, colors & fonts pulled straight from your business",
                    "A consistent, professional look across every flyer",
                    "No design software or skills required",
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
                <div className="w-11 h-11 rounded-xl flex items-center justify-center" style={{ background: "var(--brand-slate-tint)", color: "var(--brand-slate)" }}>
                  <Icon path={ICONS.download} />
                </div>
                <h3 className="mt-5 text-xl font-semibold">Ready to Print or Share</h3>
                <ul className="mt-5 flex flex-col gap-3">
                  {[
                    "Print-ready, high-resolution flyers",
                    "Download instantly from your dashboard",
                    "Use in-store, by mail, or online",
                  ].map((f) => (
                    <li key={f} className="flex items-start gap-2.5 text-sm text-foreground/85">
                      <span className="mt-0.5" style={{ color: "var(--brand-slate)" }}><Icon path={ICONS.check} className="w-4 h-4" /></span>
                      <span className="leading-snug">{f}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ── WHAT'S NEW ───────────────────────────────────────────────────── */}
      <section id="new" className="relative px-6 md:px-12 lg:px-20 py-24 border-t border-white/[0.06] scroll-mt-24 overflow-hidden">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
          <div
            className="absolute top-0 right-0 w-[34rem] h-[34rem] rounded-full blur-[130px] opacity-30"
            style={{ background: "radial-gradient(circle, var(--brand-ice), transparent 65%)" }}
          />
        </div>
        <div className="max-w-6xl mx-auto">
          <Reveal>
            <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-[var(--brand-ice)]/30 bg-[var(--brand-ice-tint)] text-[11px] tracking-widest uppercase text-[var(--brand-ice)]">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--brand-ice)]" />
              Just Added
            </span>
          </Reveal>
          <RevealText
            as="h2"
            className="mt-6 text-3xl md:text-4xl font-semibold tracking-tight leading-tight max-w-2xl text-balance"
          >
            Every flyer just got a lot more useful.
          </RevealText>
          <Reveal delay={80}>
            <p className="mt-4 text-sm text-muted-foreground max-w-xl">
              Same AI design engine, now with measurement, reuse, and fulfillment built into Basic and Pro flyers.
            </p>
          </Reveal>

          <div className="mt-12 grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {NEW_FEATURES.map((f, i) => {
              const accent = ACCENTS[i % ACCENTS.length]
              return (
                <Reveal key={f.title} delay={i * 90}>
                  <div className={`h-full rounded-2xl border border-white/10 bg-card p-7 flex flex-col hover:border-white/20 ${CARD_HOVER}`}>
                    <div className="flex items-center justify-between">
                      <div
                        className="w-11 h-11 rounded-xl flex items-center justify-center"
                        style={{ background: accent.bg, color: accent.fg }}
                      >
                        <Icon path={f.icon} />
                      </div>
                      <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-[var(--brand-slate-tint)] text-[var(--brand-slate)]">{f.tier}</span>
                    </div>
                    <h3 className="mt-5 text-lg font-semibold">{f.title}</h3>
                    <p className="mt-2.5 text-sm text-muted-foreground leading-relaxed flex-1">{f.desc}</p>
                  </div>
                </Reveal>
              )
            })}
          </div>
        </div>
      </section>

      {/* ── WHY ONEFLYER ─────────────────────────────────────────────────── */}
      <section className="px-6 md:px-12 lg:px-20 py-24 border-t border-white/[0.06]">
        <div className="max-w-6xl mx-auto">
          <Reveal>
            <Tag>Why OneFlyer</Tag>
          </Reveal>
          <RevealText
            as="h2"
            className="mt-6 text-3xl md:text-4xl font-semibold tracking-tight leading-tight max-w-2xl text-balance"
          >
            Why local businesses choose OneFlyer.
          </RevealText>
          <Reveal delay={80}>
            <p className="mt-4 text-sm text-muted-foreground max-w-xl">
              The same AI design engine powers every plan below.
            </p>
          </Reveal>

          <div className="mt-12 grid md:grid-cols-3 gap-6">
            {WHY_ONEFLYER.map((a, i) => {
              const accent = ACCENTS[i % ACCENTS.length]
              return (
                <Reveal key={a.title} delay={i * 90}>
                  <div className={`h-full rounded-2xl border border-white/10 bg-card p-7 flex flex-col hover:border-white/20 ${CARD_HOVER}`}>
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
            style={{ background: "radial-gradient(circle, rgba(94,184,240,0.3), transparent 65%)" }}
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
              Simple pricing that grows with your business.
            </RevealText>
          </div>

          <PricingCards />

          <Reveal delay={160}>
            <p className="mt-8 text-center text-sm text-muted-foreground max-w-2xl mx-auto leading-relaxed">
              Not sure which plan fits your business? Reach out anytime — we&apos;re happy to help you pick.
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
              Three steps to a flyer you&apos;re proud of.
            </RevealText>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {STEPS.map((s, i) => {
              const accent = ACCENTS[i % ACCENTS.length]
              return (
                <Reveal key={s.n} delay={i * 100}>
                  <div className={`h-full rounded-2xl border border-white/10 bg-card p-8 hover:border-white/20 ${CARD_HOVER}`}>
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
              OneFlyer
            </div>
            <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
              AI-designed flyers your business owns outright.
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
              <a href="mailto:Gpearl1006@gmail.com" className="text-sm text-foreground/70 hover:text-white transition-colors">Questions? Email us at Gpearl1006@gmail.com</a>
              <a href="/dashboard" className="text-sm text-foreground/70 hover:text-white transition-colors">Client Login</a>
              <div className="flex gap-3 mt-1">
                <span className="text-sm text-muted-foreground/60">Instagram</span>
                <span className="text-sm text-muted-foreground/60">LinkedIn</span>
              </div>
            </div>
          </div>
        </div>
        <div className="max-w-6xl mx-auto mt-10 pt-6 border-t border-white/[0.06]">
          <span className="text-xs text-muted-foreground/60">© 2026 OneFlyer. All rights reserved.</span>
        </div>
      </footer>
    </div>
  )
}
