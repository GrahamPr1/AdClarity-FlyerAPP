import { MobileNav } from "@/components/mobile-nav"
import { RevealText } from "@/components/reveal-text"
import { Reveal } from "@/components/reveal"
import { PricingCards } from "@/components/pricing-cards"
import { HeroFlyer3D } from "@/components/flyer-3d"
import { QrMock } from "@/components/asset-previews"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { PLAN_LIMITS } from "@/lib/types"
import { PLANS } from "@/lib/plans"
import {
  CAMPAIGN_ASSETS,
  COMPARISON,
  CTA_REASSURANCE,
  DATA_ASSURANCE,
  FAQS,
  MICRO_TRUST,
  OBJECTIONS,
  PRIMARY_CTA_HREF,
  PRIMARY_CTA_LABEL,
  SECONDARY_CTA_HREF,
  SECONDARY_CTA_LABEL,
  USE_CASES,
} from "@/lib/marketing"
import { SampleGallery } from "@/components/sample-gallery"
import { CampaignDemoLazy as CampaignDemo } from "@/components/campaign-demo-lazy"

// Structured data, built from the SAME constants the page renders (PLANS,
// FAQS) rather than hand-written duplicates — so prices and answers in
// Google's rich results can't drift from what the page actually says. Only
// facts that appear on the page are included: no aggregateRating or
// reviewCount, since there are no real reviews to base them on.
const STRUCTURED_DATA = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "SoftwareApplication",
      name: "OneFlyer",
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      description:
        "Turns one business promotion into a professional flyer, Instagram post, text-blast message, Nextdoor post, and trackable QR code.",
      offers: PLANS.map((p) => ({
        "@type": "Offer",
        name: p.name,
        price: String(p.monthlyFee),
        priceCurrency: "USD",
        description: p.description,
      })),
    },
    {
      "@type": "FAQPage",
      mainEntity: FAQS.map((f) => ({
        "@type": "Question",
        name: f.q,
        acceptedAnswer: { "@type": "Answer", text: f.a },
      })),
    },
  ],
}

// NOTE: this page is deliberately a SERVER component — the only interactive
// pieces are the nav, the pricing toggle, the 3D hero flyer, and the campaign
// demo, each already its own client component. The old version made the whole
// page a client component to hold one piece of intro-animation state, which
// shipped the entire landing page as JS to every visitor.
//
// The full-screen "ONEFLYER" intro splash (components/intro-animation.tsx)
// was also removed from this page: it blocked all hero content for ~2.8s,
// which is both a conversion problem (the headline is the thing that has to
// land first) and an LCP problem. The component file is left untouched and
// unreferenced, so restoring it is a one-line change if that tradeoff is
// wanted back.
//
// LAYOUT: editorial light theme — serif display headings on warm paper,
// hairline rules between sections, pill controls. Headings must NOT carry
// font-semibold/font-bold: DM Serif Display ships a single 400 weight, and a
// utility weight class beats the base-layer rule in globals.css, so the
// browser would synthesise a smeared faux-bold.

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
  check: <polyline points="20 6 9 17 4 12" />,
  x: <><path d="M18 6 6 18" /><path d="m6 6 12 12" /></>,
  sparkles: <><path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3Z" /><path d="M19 13l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7.7-2Z" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 3" /></>,
  qr: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><path d="M14 21v-4h4" /><path d="M21 14v3" /><path d="M17 17h.01" /></>,
  share: <><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><path d="M8.6 10.6 15.4 6.4" /><path d="M8.6 13.4 15.4 17.6" /></>,
  print: <><path d="M6 9V3h12v6" /><rect x="4" y="9" width="16" height="8" rx="1" /><path d="M6 17v4h12v-4" /></>,
  save: <path d="M19 21 12 16 5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2Z" />,
  brand: <><path d="M12 2 2 7l10 5 10-5-10-5Z" /><path d="m2 17 10 5 10-5" /><path d="m2 12 10 5 10-5" /></>,
  chat: <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2Z" />,
  home: <path d="M3 10.5 12 4l9 6.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1Z" />,
  pen: <><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></>,
  chart: <><path d="M3 3v18h18" /><path d="m7 15 4-4 3 3 5-6" /></>,
  bolt: <path d="M13 2 3 14h7l-1 8 10-12h-7l1-8Z" />,
}

// Re-tuned for paper. The old set leaned on pale blues (--brand-ice, --brand-sky)
// as FOREGROUND colours, which read fine on near-black and vanish on off-white.
// Every fg here clears AA against the card it sits on.
const ACCENTS = [
  { fg: "var(--brand-teal-bright)", bg: "var(--brand-teal-tint)" },
  { fg: "var(--brand-teal)", bg: "var(--brand-ice)" },
  { fg: "var(--brand-slate)", bg: "var(--brand-slate-tint)" },
  { fg: "var(--brand-teal-bright)", bg: "var(--brand-ice-tint)" },
]

const CARD_HOVER =
  "transition-all duration-300 hover:-translate-y-1 hover:shadow-[var(--shadow-lift)]"

/* ----------------------------- Small helpers ----------------------------- */
/** Section opener — the reference template's "• What we do" eyebrow. */
function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="eyebrow uppercase tracking-[0.18em] text-[11px]">
      <span className="h-1.5 w-1.5 rounded-full bg-[var(--brand-teal-bright)]" />
      {children}
    </span>
  )
}

/**
 * The one CTA the whole funnel points at. Same label and href everywhere.
 * The arrow nudges right on hover — a small, cheap signal that this button
 * takes you somewhere rather than submitting something. `group` is on the
 * anchor so the arrow reacts to a hover anywhere on the button, not just on
 * the arrow itself.
 */
function PrimaryCta({
  className = "",
  label = PRIMARY_CTA_LABEL,
  invert = false,
}: {
  className?: string
  label?: string
  /** For the blue closing band, where a blue button would disappear. */
  invert?: boolean
}) {
  return (
    <a
      href={PRIMARY_CTA_HREF}
      // min-h-11 = 44px, WCAG's minimum, on the page's highest-intent button.
      className={`group pill ${
        invert
          ? "bg-white text-[var(--brand-teal)] hover:bg-white/90"
          : "pill-solid"
      } px-7 text-sm font-medium ${className}`}
    >
      {label}
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="shrink-0 transition-transform duration-200 group-hover:translate-x-0.5"
        aria-hidden="true"
      >
        <path d="M5 12h14" />
        <path d="m12 5 7 7-7 7" />
      </svg>
    </a>
  )
}

function Reassurance({ className = "", withData = false }: { className?: string; withData?: boolean }) {
  return (
    <p className={`text-xs text-muted-foreground ${className}`}>
      {CTA_REASSURANCE}
      {/* Appended to the SAME line rather than added as its own block: the
          page is already long and this is reassurance, not a section.
          Opt-in so it shows once, beside the signup CTA. */}
      {withData && <span className="hidden sm:inline"> • {DATA_ASSURANCE}</span>}
    </p>
  )
}

/** Compact hesitation-killer row — see MICRO_TRUST in lib/marketing.ts. */
function MicroTrustRow({ className = "" }: { className?: string }) {
  return (
    <ul className={`flex flex-wrap items-center gap-x-5 gap-y-2 ${className}`}>
      {MICRO_TRUST.map((t) => (
        <li key={t} className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--brand-teal-bright)" strokeWidth="3" aria-hidden="true">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          {t}
        </li>
      ))}
    </ul>
  )
}

/* --------------------------------- Steps --------------------------------- */
const STEPS = [
  {
    n: "01",
    icon: ICONS.brand,
    title: "Tell OneFlyer what you're promoting",
    desc: "Your business and your offer. Answer a few short questions, or paste your website and let OneFlyer read your logo, colors, and details for you.",
  },
  {
    n: "02",
    icon: ICONS.sparkles,
    title: "OneFlyer builds your campaign",
    desc: "The flyer gets designed and the matching Instagram, text, and Nextdoor versions get written — with a QR code placed on the flyer.",
  },
  {
    n: "03",
    icon: ICONS.share,
    title: "Share it",
    desc: "Download and print it, post the square version, paste the text into a blast, drop the Nextdoor post in your feed.",
  },
  {
    n: "04",
    icon: ICONS.chart,
    title: "Track it",
    desc: "Your dashboard counts how many people opened the QR code's offer page and how many tapped the call-to-action on it.",
    tier: "Basic",
  },
]

/* ------------------------------- Capabilities ----------------------------- */
/* --------------------------------- Page ---------------------------------- */
export default function Page() {
  return (
    <div id="top" className="min-h-screen overflow-x-hidden bg-background text-foreground">
      {/* Runs synchronously during parse, BEFORE the veil below is painted, so
          a returning visitor never sees a frame of it. Inline and tiny on
          purpose — anything async (or React state) would paint the veil first
          and then remove it, which is a visible flash. */}
      <script
        dangerouslySetInnerHTML={{
          __html:
            "try{if(sessionStorage.getItem('of_intro')){document.documentElement.setAttribute('data-intro-seen','1')}else{sessionStorage.setItem('of_intro','1')}}catch(e){}",
        }}
      />
      {/* Brand intro — animates itself away in ~900ms, see .intro-veil in
          app/globals.css. Decorative, so it's hidden from assistive tech. */}
      <div className="intro-veil" aria-hidden="true">
        <div className="intro-veil-glow" />
        <div className="intro-mark">
          <span className="intro-mark-dot" />
          OneFlyer
        </div>
      </div>

      <script
        type="application/ld+json"
        // Serialized from a plain object literal built above — no user input
        // reaches this, so there's nothing here to inject.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(STRUCTURED_DATA) }}
      />
      <MobileNav />

      <main>
        {/* ── HERO ───────────────────────────────────────────────────────────
            Editorial split: the headline claims the left, a short framing
            note sits top-right, and the product itself gets its own stage
            below — the reference template's hero shape, with an interactive
            3D flyer where the template put a stock photograph. */}
        <section className="relative overflow-hidden px-6 pt-28 pb-16 md:px-12 md:pt-36 lg:px-20">
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
            <div
              className="absolute -top-40 -left-24 h-[36rem] w-[36rem] rounded-full opacity-70 blur-[130px]"
              style={{ background: "radial-gradient(circle, rgba(47,109,149,0.13), transparent 66%)" }}
            />
            <div
              className="absolute top-10 -right-32 h-[30rem] w-[30rem] rounded-full opacity-60 blur-[130px]"
              style={{ background: "radial-gradient(circle, rgba(201,178,140,0.18), transparent 66%)" }}
            />
          </div>

          <div className="mx-auto max-w-6xl">
            <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between lg:gap-16">
              <div className="lg:max-w-3xl">
                <Tag>Marketing for local business</Tag>

                <h1 className="mt-6 text-balance text-[2.6rem] leading-[1.02] tracking-tight sm:text-6xl lg:text-[4.2rem]">
                  Turn one promotion into an{" "}
                  <em className="not-italic text-[var(--brand-teal-bright)]">
                    entire marketing campaign
                  </em>
                </h1>

                <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                  <PrimaryCta className="w-full sm:w-auto" />
                  <a
                    href={SECONDARY_CTA_HREF}
                    className="pill pill-outline border-foreground/25 px-7"
                  >
                    {SECONDARY_CTA_LABEL}
                  </a>
                </div>

                <Reassurance className="mt-4" />
              </div>

              {/* Names the exact five things the pipeline produces, in the
                  order the hero visual shows them — no "and more", which
                  invites a visitor to imagine channels we don't generate. */}
              <p className="max-w-xs text-sm leading-relaxed text-muted-foreground lg:pb-2">
                A professional flyer, an Instagram post, a text message, a Nextdoor
                post, and a trackable QR code — all from one simple promotion.
              </p>
            </div>

            <MicroTrustRow className="mt-8 border-t border-border pt-6" />
          </div>
        </section>

        {/* ── HERO STAGE ─────────────────────────────────────────────────────
            The 3D flyer gets the reference template's full-bleed image slot.
            Tilt follows the pointer; it drifts on its own until touched, so
            it reads as interactive without an instruction telling you so. */}
        <section className="px-6 pb-20 md:px-12 lg:px-20 lg:pb-28">
          <div
            className="mx-auto max-w-6xl overflow-hidden rounded-[2rem] border border-border px-6 pt-16 pb-10 sm:px-12"
            style={{
              background:
                "linear-gradient(150deg,#f7f4ed 0%,#eef3f7 52%,#e7eef4 100%)",
            }}
          >
            <HeroFlyer3D />
          </div>
        </section>

        {/* ── PROBLEM + WHAT YOU GET (merged) ────────────────────────────────
            These were two separate full-height sections whose headlines said
            the same thing ("Stop recreating the same promotion five different
            ways." / "Create once. Use everywhere.") and which BOTH enumerated
            the five assets — while the hero visual above already shows all
            five a third time. Merged into one: the comparison below IS the
            asset list, so the separate six-card grid was ~1050px of repetition
            standing between the visitor and the pricing. */}
        <section id="what-you-get" className="scroll-mt-24 border-t border-border px-6 py-16 md:px-12 lg:px-20">
          <div className="mx-auto max-w-6xl">
            <div className="rounded-3xl bg-[var(--surface-soft)] px-6 py-14 md:px-14 md:py-16">
              <div className="mx-auto max-w-3xl text-center">
                <Tag>What you get</Tag>
                <RevealText
                  as="h2"
                  className="mt-6 text-balance text-3xl leading-snug tracking-tight md:text-4xl lg:text-5xl"
                >
                  Create once. Use everywhere.
                </RevealText>
                <Reveal delay={120}>
                  <p className="mt-5 text-pretty text-base leading-relaxed text-muted-foreground md:text-lg">
                    Stop recreating the same promotion five different ways. You
                    shouldn&apos;t need a designer, a design tool, a chatbot, and a QR
                    generator just to promote one offer.
                  </p>
                </Reveal>
              </div>

              <div className="mx-auto mt-12 grid max-w-3xl gap-5 sm:grid-cols-2">
                <Reveal>
                  <div className="h-full rounded-2xl border border-border bg-background p-6">
                    <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                      Doing it yourself
                    </p>
                    <ul className="mt-4 flex flex-col gap-2.5">
                      {[
                        "Design the flyer",
                        "Write the copy",
                        "Resize it for Instagram",
                        "Reword it for a text blast",
                        "Generate a QR code somewhere else",
                        "Figure out printing",
                        "Guess whether any of it worked",
                      ].map((t) => (
                        <li key={t} className="flex items-start gap-2.5 text-sm text-muted-foreground">
                          <span className="mt-0.5 shrink-0 opacity-45">
                            <Icon path={ICONS.x} className="h-4 w-4" />
                          </span>
                          <span className="leading-snug">{t}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </Reveal>

                <Reveal delay={110}>
                  <div className="flex h-full flex-col rounded-2xl border-2 border-[var(--brand-teal)]/30 bg-card p-6 shadow-[var(--shadow-soft)]">
                    <p className="text-xs font-medium uppercase tracking-widest text-[var(--brand-teal)]">
                      With OneFlyer
                    </p>
                    <p className="mt-4 text-xl leading-snug tracking-tight" style={{ fontFamily: "var(--font-heading)" }}>
                      Tell us what you&apos;re promoting.
                    </p>
                    <p className="mt-2 text-base text-muted-foreground">
                      We handle the rest.
                    </p>
                    <div className="mt-5 flex flex-1 flex-col justify-end gap-2.5">
                      {CAMPAIGN_ASSETS.map((a) => (
                        <div key={a.key} className="flex items-center gap-2.5 text-sm font-medium">
                          <span className="shrink-0 text-[var(--brand-teal)]">
                            <Icon path={ICONS.check} className="h-4 w-4" />
                          </span>
                          {a.label}
                        </div>
                      ))}
                    </div>
                  </div>
                </Reveal>
              </div>

              {/* The only content kept from the deleted card grid: which tier
                  includes what. Nothing else on the page states it. */}
              <p className="mx-auto mt-8 max-w-3xl text-center text-sm leading-relaxed text-muted-foreground">
                The free tier includes the flyer itself, so you can judge the design quality
                before paying. QR tracking, the Instagram/text/Nextdoor versions, and print
                requests start on Basic.{" "}
                <a href="#pricing" className="font-medium text-[var(--brand-teal)] underline">
                  Compare plans
                </a>
              </p>
            </div>
          </div>
        </section>

        {/* ── HOW IT WORKS ─────────────────────────────────────────────────
            The template's Services shape: a standing left column that holds
            the argument, and the items themselves in a rule-separated grid
            on the right rather than four floating boxes. */}
        <section id="how-it-works" className="scroll-mt-24 border-t border-border px-6 py-20 md:px-12 lg:px-20">
          <div className="mx-auto grid max-w-6xl gap-12 lg:grid-cols-2 lg:gap-16">
            <div className="lg:sticky lg:top-28 lg:self-start">
              <Reveal>
                <Tag>How it works</Tag>
              </Reveal>
              <RevealText
                as="h2"
                className="mt-6 text-balance text-3xl leading-tight tracking-tight md:text-5xl"
              >
                From idea to campaign in minutes.
              </RevealText>
              <Reveal delay={80}>
                <p className="mt-5 max-w-lg text-base leading-relaxed text-muted-foreground">
                  Four steps, none of which need a design tool. The longest part is
                  deciding what your offer should be.
                </p>
              </Reveal>
              <Reveal delay={220}>
                <div className="mt-8 flex flex-col items-start gap-3">
                  <PrimaryCta />
                  <Reassurance />
                </div>
              </Reveal>
            </div>

            <div className="grid gap-x-8 gap-y-10 sm:grid-cols-2">
              {STEPS.map((s, i) => {
                const accent = ACCENTS[i % ACCENTS.length]
                return (
                  <Reveal key={s.n} delay={i * 100}>
                    <div className="group flex h-full flex-col border-t border-border pt-6 transition-colors hover:border-[var(--brand-teal-bright)]">
                      <div className="flex items-center justify-between">
                        <div
                          className="grid h-11 w-11 place-items-center rounded-xl"
                          style={{ background: accent.bg, color: accent.fg }}
                        >
                          <Icon path={s.icon} />
                        </div>
                        <span
                          className="text-3xl"
                          style={{ color: accent.fg, opacity: 0.3, fontFamily: "var(--font-heading)" }}
                        >
                          {s.n}
                        </span>
                      </div>
                      <h3 className="mt-5 text-[19px] leading-snug transition-colors group-hover:text-[var(--brand-teal)]">
                        {s.title}
                      </h3>
                      <p className="mt-2.5 flex-1 text-sm leading-relaxed text-muted-foreground">{s.desc}</p>
                      {/* Label built as one interpolated string: written as
                          `{s.tier} &amp; Pro` the space after the expression was
                          dropped and it rendered as "Basic& Pro". */}
                      {s.tier && (
                        <span className="mt-4 self-start rounded-full bg-[var(--brand-slate-tint)] px-2.5 py-0.5 text-[10px] font-medium text-[var(--brand-slate)]">
                          {`${s.tier} & Pro`}
                        </span>
                      )}
                    </div>
                  </Reveal>
                )
              })}
            </div>
          </div>
        </section>

        {/* ── SEE IT / INTERACTIVE DEMO ──────────────────────────────────── */}
        <section id="see-it" className="scroll-mt-24 border-t border-border px-6 py-20 md:px-12 lg:px-20">
          <div className="mx-auto max-w-6xl">
            <div className="mb-12">
              <Reveal>
                <Tag>See it</Tag>
              </Reveal>
              <RevealText
                as="h2"
                className="mt-6 max-w-2xl text-balance text-3xl leading-tight tracking-tight md:text-5xl"
              >
                See what OneFlyer creates.
              </RevealText>
              <Reveal delay={80}>
                <p className="mt-4 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                  Give us a business and an offer. See how one promotion becomes a complete
                  campaign. It starts on an example for a fictional roofing company — change it
                  to yours.
                </p>
              </Reveal>
            </div>

            <Reveal>
              <CampaignDemo />
            </Reveal>
          </div>
        </section>

        {/* ── PRICING ────────────────────────────────────────────────────── */}
        <section id="pricing" className="relative scroll-mt-24 overflow-hidden border-t border-border px-6 py-20 md:px-12 lg:px-20">
          <div className="mx-auto max-w-6xl">
            <div className="mb-14 text-center">
              <Reveal>
                <Tag>Pricing</Tag>
              </Reveal>
              <RevealText
                as="h2"
                className="mt-6 text-balance text-3xl leading-tight tracking-tight md:text-5xl"
              >
                Start free. Upgrade when you&apos;re ready.
              </RevealText>
              <Reveal delay={80}>
                <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-muted-foreground">
                  {PLAN_LIMITS.trial} campaigns free with no credit card, so you can judge the
                  design quality before you decide anything.
                </p>
              </Reveal>
            </div>

            <PricingCards />

            <Reveal delay={160}>
              <div className="mt-10 flex flex-col items-center gap-3">
                <p className="text-center text-base font-medium">
                  Start free. Upgrade when you need more.
                </p>
                <MicroTrustRow className="justify-center" />
                {/* The one line worth keeping from the deleted Trust section —
                    the rest of it restated the pricing table and the FAQ. */}
                <p className="mx-auto mt-2 max-w-2xl text-center text-sm leading-relaxed text-muted-foreground">
                  Every flyer you make is yours to keep and reuse, including if you stop
                  subscribing. Not sure which plan fits? Reach out anytime — we&apos;re happy to
                  help you pick.
                </p>
              </div>
            </Reveal>
          </div>
        </section>

        {/* ── USE CASES ──────────────────────────────────────────────────── */}
        <section id="use-cases" className="relative scroll-mt-24 overflow-hidden border-t border-border px-6 py-20 md:px-12 lg:px-20">
          <div className="mx-auto max-w-6xl">
            <Reveal>
              <Tag>Use cases</Tag>
            </Reveal>
            <RevealText
              as="h2"
              className="mt-6 max-w-2xl text-balance text-3xl leading-tight tracking-tight md:text-5xl"
            >
              Built for businesses that need to market fast.
            </RevealText>
            <Reveal delay={80}>
              <p className="mt-4 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                A few examples of what businesses like yours ask OneFlyer to promote.
              </p>
            </Reveal>

            <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {USE_CASES.map((u, i) => (
                <Reveal key={u.trade} delay={(i % 6) * 60}>
                  <div className={`h-full rounded-2xl border border-border bg-card p-5 ${CARD_HOVER}`}>
                    <p className="text-xs font-medium uppercase tracking-widest text-[var(--brand-teal-bright)]">
                      {u.trade}
                    </p>
                    <p className="mt-2 text-base leading-snug" style={{ fontFamily: "var(--font-heading)" }}>
                      &ldquo;{u.promo}&rdquo;
                    </p>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* ── TRACKING / RESULTS ─────────────────────────────────────────── */}
        <section className="border-t border-border px-6 py-20 md:px-12 lg:px-20">
          <div className="mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-2 lg:gap-16">
            <div>
              <Reveal>
                <Tag>Results</Tag>
              </Reveal>
              <RevealText
                as="h2"
                className="mt-6 text-balance text-3xl leading-tight tracking-tight md:text-5xl"
              >
                Don&apos;t just send it. Track it.
              </RevealText>
              <Reveal delay={100}>
                <p className="mt-5 text-base leading-relaxed text-muted-foreground">
                  A printed flyer usually disappears the moment you hand it over. Every
                  OneFlyer flyer carries its own QR code pointing at a page we host for you —
                  so you can see that someone actually scanned it, and that they actually
                  tapped through.
                </p>
              </Reveal>
              <Reveal delay={160}>
                <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
                  Two real numbers per flyer, updating in your dashboard. It doesn&apos;t
                  measure impressions or claim credit for closed jobs — just whether your
                  flyer got a response.
                </p>
              </Reveal>
              <Reveal delay={220}>
                <div className="mt-8">
                  <PrimaryCta />
                </div>
              </Reveal>
            </div>

            {/* Example dashboard. Labeled as an example in the UI itself,
                and shows ONLY the two metrics that actually exist (see
                TrackingStats in lib/types.ts) — no invented shares, views,
                or lead counts. */}
            <Reveal delay={120}>
              <div className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-lift)]">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs uppercase tracking-widest text-muted-foreground">Campaign</p>
                    <p className="mt-1 text-lg" style={{ fontFamily: "var(--font-heading)" }}>
                      Summer Roof Promotion
                    </p>
                  </div>
                  <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-[var(--brand-teal)]/40 bg-[var(--brand-teal-tint)] px-2.5 py-1 text-xs font-medium text-[var(--brand-teal)]">
                    <span className="h-1.5 w-1.5 rounded-full bg-current" />
                    Ready
                  </span>
                </div>

                {/* Framed as "the two numbers you'll see", not as results
                    achieved. The figures were disclaimed as samples in a
                    footnote, but a big teal 147 reads as a claim regardless of
                    what the small print says — and we have no customer data to
                    claim yet. Muted, labelled as a preview, same footprint. */}
                <div className="mt-6 grid grid-cols-2 gap-4">
                  <div className="rounded-xl border border-border bg-[var(--surface-soft)] p-5">
                    <p className="text-xs uppercase tracking-widest text-muted-foreground">QR scans</p>
                    <p className="mt-2 text-4xl tracking-tight text-foreground/25" style={{ fontFamily: "var(--font-heading)" }}>147</p>
                  </div>
                  <div className="rounded-xl border border-border bg-[var(--surface-soft)] p-5">
                    <p className="text-xs uppercase tracking-widest text-muted-foreground">CTA clicks</p>
                    <p className="mt-2 text-4xl tracking-tight text-foreground/25" style={{ fontFamily: "var(--font-heading)" }}>32</p>
                  </div>
                </div>

                <div className="mt-4 flex items-center gap-4 rounded-xl border border-border bg-[var(--surface-soft)] p-4">
                  <QrMock seed="summer-roof" className="h-16 w-16 shrink-0 rounded" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium">Printed on every flyer</p>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                      Points to your own offer page, so a scan is countable.
                    </p>
                  </div>
                </div>

                <p className="mt-5 border-t border-border pt-4 text-xs text-muted-foreground">
                  This is the dashboard you get — two real counts per flyer. The figures shown are
                  placeholders; we don&apos;t publish customer results.
                </p>
              </div>
            </Reveal>
          </div>
        </section>

        {/* ── WHY ONEFLYER / COMPARISON ────────────────────────────────────
            The four capability cards that used to sit under this table were
            removed: brand matching, plain-English edits, printing and the
            saved profile are each already covered by the merged What You Get
            section, the tracking section, or the FAQ. The table is the part
            that earns its space. */}
        <section className="border-t border-border px-6 py-20 md:px-12 lg:px-20">
          <div className="mx-auto max-w-5xl">
            <div className="text-center">
              <Reveal>
                <Tag>Why OneFlyer</Tag>
              </Reveal>
              <RevealText
                as="h2"
                className="mt-6 text-balance text-3xl leading-tight tracking-tight md:text-5xl"
              >
                The same work, without the afternoon.
              </RevealText>
              <Reveal delay={80}>
                <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-muted-foreground">
                  Not a comparison against other tools — a comparison against what promoting
                  one offer actually takes when you do it yourself.
                </p>
              </Reveal>
            </div>

            <Reveal delay={120}>
              <div className="mt-12 overflow-hidden rounded-2xl border border-border bg-card">
                <div className="hidden bg-[var(--surface-soft)] px-6 py-3.5 sm:grid sm:grid-cols-[1.25fr_1fr_1fr] sm:gap-4">
                  <span className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                    What it takes
                  </span>
                  <span className="text-xs font-medium uppercase tracking-widest text-[var(--brand-teal-bright)]">
                    OneFlyer
                  </span>
                  <span className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                    On your own
                  </span>
                </div>

                {COMPARISON.map((row) => (
                  <div
                    key={row.task}
                    className="grid gap-2 border-t border-border px-6 py-4 sm:grid-cols-[1.25fr_1fr_1fr] sm:items-center sm:gap-4"
                  >
                    <span className="text-sm font-medium">{row.task}</span>
                    <div className="flex items-start gap-2 text-sm">
                      <span className="mt-0.5 shrink-0 text-[var(--brand-teal-bright)]">
                        <Icon path={ICONS.check} className="h-4 w-4" />
                      </span>
                      <span className="leading-snug">
                        <span className="text-muted-foreground sm:hidden">OneFlyer: </span>
                        {row.oneflyer}
                      </span>
                    </div>
                    <span className="text-sm leading-snug text-muted-foreground">
                      <span className="sm:hidden">On your own: </span>
                      {row.diy}
                    </span>
                  </div>
                ))}
              </div>
            </Reveal>
          </div>
        </section>

        {/* ── OBJECTIONS ─────────────────────────────────────────────────── */}
        <section className="border-t border-border px-6 py-20 md:px-12 lg:px-20">
          <div className="mx-auto max-w-5xl">
            <div className="text-center">
              <Reveal>
                <Tag>Before you start</Tag>
              </Reveal>
              <RevealText
                as="h2"
                className="mt-6 text-balance text-3xl leading-tight tracking-tight md:text-5xl"
              >
                &ldquo;Couldn&apos;t I just do this myself?&rdquo;
              </RevealText>
              <Reveal delay={80}>
                <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-muted-foreground">
                  Honestly — yes. Here&apos;s the actual difference.
                </p>
              </Reveal>
            </div>

            <div className="mt-12 grid gap-6 md:grid-cols-2">
              {OBJECTIONS.map((o, i) => (
                <Reveal key={o.heading} delay={i * 110}>
                  <div className="flex h-full flex-col rounded-2xl border border-border bg-card p-8">
                    <h3 className="text-2xl leading-snug tracking-tight">{o.heading}</h3>
                    <p className="mt-4 text-sm leading-relaxed">{o.lead}</p>
                    <p className="mt-3 flex-1 text-sm leading-relaxed text-muted-foreground">{o.body}</p>
                    <ul className="mt-6 flex flex-col gap-2.5 border-t border-border pt-5">
                      {o.points.map((p) => (
                        <li key={p} className="flex items-start gap-2.5 text-sm">
                          <span className="mt-0.5 shrink-0 text-[var(--brand-teal-bright)]">
                            <Icon path={ICONS.check} className="h-4 w-4" />
                          </span>
                          <span className="leading-snug">{p}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* Real sample output, if any has been added. Renders nothing when
            the list is empty — see lib/samples.ts. */}
        <SampleGallery />

        {/* ── FAQ ────────────────────────────────────────────────────────── */}
        <section id="faq" className="scroll-mt-24 border-t border-border px-6 py-20 md:px-12 lg:px-20">
          <div className="mx-auto max-w-3xl">
            <div className="mb-10 text-center">
              <Reveal>
                <Tag>FAQ</Tag>
              </Reveal>
              <RevealText
                as="h2"
                className="mt-6 text-balance text-3xl leading-tight tracking-tight md:text-5xl"
              >
                Questions, answered.
              </RevealText>
            </div>
            <Reveal>
              <Accordion type="single" collapsible className="w-full">
                {FAQS.map((f, i) => (
                  <AccordionItem key={i} value={`item-${i}`} className="border-border">
                    <AccordionTrigger className="text-left text-base font-medium hover:text-[var(--brand-teal-bright)] hover:no-underline">
                      {f.q}
                    </AccordionTrigger>
                    <AccordionContent className="text-sm leading-relaxed text-muted-foreground">
                      {f.a}
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </Reveal>
          </div>
        </section>

        {/* ── FINAL CTA ──────────────────────────────────────────────────────
            The reference template's full-bleed accent band, used here as the
            close rather than as a statistics panel — the template filled that
            band with "98% satisfaction / 50+ award-winning campaigns", and
            there are no real numbers to put in it. */}
        <section className="bg-[var(--brand-teal-bright)] px-6 py-20 text-white md:px-12 lg:px-20">
          <div className="mx-auto max-w-3xl text-center">
            <RevealText
              as="h2"
              className="text-balance text-3xl leading-tight tracking-tight text-white md:text-5xl lg:text-6xl"
            >
              Your next promotion could be ready in minutes.
            </RevealText>
            <Reveal delay={100}>
              <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-white/80">
                Tell OneFlyer what you&apos;re promoting. We&apos;ll turn it into professional
                marketing you can actually use.
              </p>
            </Reveal>
            <Reveal delay={180}>
              <div className="mt-9 flex flex-col items-center gap-3">
                <PrimaryCta invert className="px-9 py-4 text-base" />
                <p className="text-xs text-white/70">
                  {CTA_REASSURANCE}
                  <span className="hidden sm:inline"> • {DATA_ASSURANCE}</span>
                </p>
              </div>
            </Reveal>
          </div>
        </section>
      </main>

      {/* ── FOOTER ───────────────────────────────────────────────────────── */}
      <footer className="border-t border-border px-6 py-14 md:px-12 lg:px-20">
        <div className="mx-auto grid max-w-6xl gap-10 sm:grid-cols-2 lg:grid-cols-5">
          <div className="sm:col-span-2 lg:col-span-1">
            <div className="flex items-center gap-2 text-lg" style={{ fontFamily: "var(--font-heading)" }}>
              <span className="inline-block h-2 w-2 rounded-full bg-[var(--brand-teal-bright)]" />
              OneFlyer
            </div>
            <p className="mt-3 max-w-xs text-sm leading-relaxed text-muted-foreground">
              Turn one promotion into a full set of marketing materials — yours to keep.
            </p>
          </div>

          <div className="flex flex-col gap-2.5">
            <span className="text-xs uppercase tracking-widest text-muted-foreground">Product</span>
            <a href="#what-you-get" className="text-sm text-muted-foreground transition-colors hover:text-[var(--brand-teal-bright)]">What You Get</a>
            <a href="#how-it-works" className="text-sm text-muted-foreground transition-colors hover:text-[var(--brand-teal-bright)]">How It Works</a>
            <a href="#use-cases" className="text-sm text-muted-foreground transition-colors hover:text-[var(--brand-teal-bright)]">Use Cases</a>
            <a href="#pricing" className="text-sm text-muted-foreground transition-colors hover:text-[var(--brand-teal-bright)]">Pricing</a>
          </div>

          <div className="flex flex-col gap-2.5">
            <span className="text-xs uppercase tracking-widest text-muted-foreground">Resources</span>
            <a href="/about" className="text-sm text-muted-foreground transition-colors hover:text-[var(--brand-teal-bright)]">About</a>
            <a href="/contact" className="text-sm text-muted-foreground transition-colors hover:text-[var(--brand-teal-bright)]">Contact</a>
            <a href="#faq" className="text-sm text-muted-foreground transition-colors hover:text-[var(--brand-teal-bright)]">FAQ</a>
            <a href="#see-it" className="text-sm text-muted-foreground transition-colors hover:text-[var(--brand-teal-bright)]">See Examples</a>
            <a href="mailto:Gpearl1006@gmail.com" className="text-sm text-muted-foreground transition-colors hover:text-[var(--brand-teal-bright)]">Get Help</a>
          </div>

          <div className="flex flex-col gap-2.5">
            <span className="text-xs uppercase tracking-widest text-muted-foreground">Legal</span>
            <a href="/privacy" className="text-sm text-muted-foreground transition-colors hover:text-[var(--brand-teal-bright)]">Privacy Policy</a>
            <a href="/terms" className="text-sm text-muted-foreground transition-colors hover:text-[var(--brand-teal-bright)]">Terms of Service</a>
            <a href="/refund-policy" className="text-sm text-muted-foreground transition-colors hover:text-[var(--brand-teal-bright)]">Cancellation &amp; Refunds</a>
          </div>

          <div className="flex flex-col gap-2.5">
            <span className="text-xs uppercase tracking-widest text-muted-foreground">Account</span>
            <a href="/login" className="text-sm text-muted-foreground transition-colors hover:text-[var(--brand-teal-bright)]">Log In</a>
            <a href={PRIMARY_CTA_HREF} className="text-sm font-medium text-[var(--brand-teal-bright)] transition-colors hover:text-[var(--brand-teal)]">
              Start Free
            </a>
            <a href="mailto:Gpearl1006@gmail.com" className="text-sm text-muted-foreground transition-colors hover:text-[var(--brand-teal-bright)]">Contact</a>
          </div>
        </div>

        <div className="mx-auto mt-12 flex max-w-6xl flex-col gap-2 border-t border-border pt-6 sm:flex-row sm:items-center sm:justify-between">
          <span className="text-xs text-muted-foreground">
            © 2026 OneFlyer. All rights reserved. ·{" "}
            <a href="/privacy" className="underline transition-colors hover:text-[var(--brand-teal-bright)]">Privacy</a> ·{" "}
            <a href="/terms" className="underline transition-colors hover:text-[var(--brand-teal-bright)]">Terms</a>
          </span>
          <span className="text-xs text-muted-foreground">
            Questions? <a href="mailto:Gpearl1006@gmail.com" className="underline transition-colors hover:text-[var(--brand-teal-bright)]">Gpearl1006@gmail.com</a>
          </span>
        </div>
      </footer>
    </div>
  )
}
