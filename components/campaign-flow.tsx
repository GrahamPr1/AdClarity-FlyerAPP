"use client"

import { useState } from "react"
import {
  FlyerPreview,
  InstagramPreview,
  TextPreview,
  NextdoorPreview,
  QrMock,
  type AssetContent,
} from "./asset-previews"
import {
  DEMO_BUSINESS,
  DEMO_PROMO,
  DEMO_TRADE,
  PRIMARY_CTA_HREF,
  USE_CASES,
} from "@/lib/marketing"

/* --------------------------------- Shared -------------------------------- */

function FieldRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-2.5">
      <span className="w-[4.75rem] shrink-0 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/35">
        {label}
      </span>
      <span className="truncate text-[13px] font-medium text-white/90">{value}</span>
    </div>
  )
}

function DownArrow({ className = "" }: { className?: string }) {
  return (
    <div className={`flex justify-center ${className}`} aria-hidden="true">
      <svg width="16" height="26" viewBox="0 0 16 26" fill="none" className="text-white/20">
        <path d="M8 0v20" stroke="currentColor" strokeWidth="1.5" strokeDasharray="3 3" />
        <path d="M3 18l5 6 5-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  )
}

/**
 * The small "and all of these too" cards next to the flyer. Each one names a
 * real output of the same submission — see CAMPAIGN_ASSETS in lib/marketing.ts.
 */
function MiniAsset({
  label,
  sub,
  children,
  delay,
}: {
  label: string
  sub: string
  children: React.ReactNode
  delay: number
}) {
  return (
    <div
      className="asset-in flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-2.5"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-lg bg-[#12141a]">
        {children}
      </div>
      <div className="min-w-0">
        <p className="truncate text-[12.5px] font-semibold text-white/85">{label}</p>
        <p className="truncate text-[10.5px] text-white/40">{sub}</p>
      </div>
    </div>
  )
}

/* --------------------------- Hero flow visual ---------------------------- */

/**
 * Input → OneFlyer → output, top to bottom. The point is that a visitor
 * understands the product without reading a paragraph: they typed two lines,
 * they got a flyer plus four more things.
 */
export function CampaignFlowVisual() {
  const content: AssetContent = { business: DEMO_BUSINESS, promo: DEMO_PROMO, trade: DEMO_TRADE }

  return (
    <div className="relative w-full">
      {/* ambient glow behind the whole flow */}
      <div
        aria-hidden="true"
        className="absolute -inset-8 -z-10 rounded-[2.5rem] opacity-50 blur-3xl"
        style={{ background: "radial-gradient(circle at 65% 25%, rgba(94,184,240,0.32), transparent 62%)" }}
      />

      <div className="rounded-2xl border border-white/10 bg-card/80 p-4 shadow-2xl shadow-black/50 backdrop-blur-sm sm:p-5">
        {/* ── Input ── */}
        <div className="asset-in rounded-xl border border-white/10 bg-[#12141a] p-3.5" style={{ animationDelay: "0ms" }}>
          <p className="mb-2.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--brand-teal-bright)]">
            You tell us
          </p>
          <div className="flex flex-col gap-1.5">
            <FieldRow label="Business" value={DEMO_BUSINESS} />
            <FieldRow label="Promoting" value={DEMO_PROMO} />
          </div>
        </div>

        <DownArrow className="py-1" />

        {/* ── Engine ── */}
        <div
          className="asset-in flex items-center justify-center gap-2.5 rounded-xl border border-[var(--brand-teal)]/40 bg-[var(--brand-teal-tint)] py-2.5"
          style={{ animationDelay: "160ms" }}
        >
          <span className="relative grid h-6 w-6 place-items-center rounded-full bg-[var(--brand-teal-bright)] text-white">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3Z" />
            </svg>
          </span>
          <span className="text-[12.5px] font-semibold tracking-tight text-white">OneFlyer</span>
        </div>

        <DownArrow className="py-1" />

        {/* ── Output ── */}
        <p className="mb-2.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/35">
          You get
        </p>
        <div className="grid grid-cols-5 gap-3">
          <div className="asset-in col-span-2" style={{ animationDelay: "320ms" }}>
            <FlyerPreview content={content} />
            <p className="mt-1.5 text-center text-[10px] font-medium text-white/45">Print flyer</p>
          </div>

          <div className="col-span-3 flex flex-col gap-2">
            <MiniAsset label="Instagram post" sub="Redesigned square + caption" delay={420}>
              <span
                className="h-full w-full"
                style={{ background: "linear-gradient(150deg,#1b3a5c,#5eb8f0)" }}
              />
            </MiniAsset>
            <MiniAsset label="Text blast" sub="Copy ready to send" delay={500}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#5eb8f0" strokeWidth="1.8" aria-hidden="true">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2Z" />
              </svg>
            </MiniAsset>
            <MiniAsset label="Nextdoor post" sub="Local, neighborly wording" delay={580}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#8ecbf5" strokeWidth="1.8" aria-hidden="true">
                <path d="M3 10.5 12 4l9 6.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1Z" />
              </svg>
            </MiniAsset>
            <MiniAsset label="Trackable QR code" sub="Scans & clicks counted" delay={660}>
              <QrMock seed={DEMO_BUSINESS} className="h-8 w-8" />
            </MiniAsset>
          </div>
        </div>

        <p className="mt-3.5 border-t border-white/[0.07] pt-3 text-center text-[10.5px] leading-relaxed text-white/35">
          Example campaign · {DEMO_BUSINESS} is a fictional business
        </p>
      </div>
    </div>
  )
}

/* ---------------------------- Interactive demo --------------------------- */

const TRADE_OPTIONS = USE_CASES.slice(0, 8).map((u) => u.trade)

/**
 * Lets a visitor put their own business name and offer in and see the shape
 * of the result before signing up. Renders the same mock previews as the hero
 * with their text substituted in — it does NOT call the real pipeline (that
 * costs a real Claude call per generation and requires an account), and the
 * UI says so plainly rather than implying these are freshly designed for them.
 */
export function CampaignDemo() {
  const [business, setBusiness] = useState(DEMO_BUSINESS)
  const [promo, setPromo] = useState(DEMO_PROMO)
  const [trade, setTrade] = useState(DEMO_TRADE)
  // Starts populated with the example campaign rather than an empty
  // placeholder, so this one section does both jobs: it's the polished
  // "here's what the output looks like" showcase on arrival, and becomes an
  // interactive demo the moment they type their own business in. Two separate
  // sections for those would have shown the same four assets twice.
  const [shown, setShown] = useState<AssetContent>({
    business: DEMO_BUSINESS,
    promo: DEMO_PROMO,
    trade: DEMO_TRADE,
  })
  // Re-keys the previews so the reveal animation replays on each submit —
  // otherwise swapping text in place gives no feedback that anything happened.
  const [run, setRun] = useState(0)

  const content: AssetContent = {
    business: business.trim() || DEMO_BUSINESS,
    promo: promo.trim() || DEMO_PROMO,
    trade,
  }

  const field =
    "w-full rounded-lg border border-white/12 bg-white/[0.04] px-3.5 py-2.5 text-sm text-foreground transition-colors placeholder:text-muted-foreground/50 focus:border-[var(--brand-teal-bright)] focus:ring-1 focus:ring-[var(--brand-teal-bright)] focus:outline-none"

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] lg:gap-12">
      {/* Controls */}
      <form
        onSubmit={(e) => {
          e.preventDefault()
          setShown(content)
          setRun((r) => r + 1)
        }}
        className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-card p-6"
      >
        <div>
          <label htmlFor="demo-business" className="mb-1.5 block text-sm font-medium">
            Business name
          </label>
          <input
            id="demo-business"
            className={field}
            value={business}
            onChange={(e) => setBusiness(e.target.value)}
            placeholder="Bluegrass Roofing"
            maxLength={40}
          />
        </div>
        <div>
          <label htmlFor="demo-promo" className="mb-1.5 block text-sm font-medium">
            What are you promoting?
          </label>
          <input
            id="demo-promo"
            className={field}
            value={promo}
            onChange={(e) => setPromo(e.target.value)}
            placeholder="$500 Off Your New Roof"
            maxLength={48}
          />
        </div>
        <div>
          <label htmlFor="demo-trade" className="mb-1.5 block text-sm font-medium">
            Business type
          </label>
          <select
            id="demo-trade"
            className={field}
            value={trade}
            onChange={(e) => setTrade(e.target.value)}
          >
            {TRADE_OPTIONS.map((t) => (
              <option key={t} value={t} className="bg-card">
                {t}
              </option>
            ))}
          </select>
        </div>

        <button
          type="submit"
          className="mt-1 rounded-xl bg-[var(--brand-teal-bright)] px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-[var(--brand-teal)]/25 transition-colors hover:bg-[var(--brand-teal)]"
        >
          Preview My Campaign
        </button>
        <p className="text-xs leading-relaxed text-muted-foreground/70">
          A styled preview using your details — not a live generation. Real campaigns are
          designed around your actual brand, logo, and colors.
        </p>
      </form>

      {/* Output */}
      <div>
        {/* Three tracks on wide screens so the square Instagram post can't
            stretch to the full remaining width (it's aspect-square, so extra
            width also makes it taller, and it was ballooning past 500px and
            dwarfing the flyer). */}
        <div
          key={run}
          className="grid gap-5 sm:grid-cols-[minmax(0,12rem)_minmax(0,1fr)] xl:grid-cols-[minmax(0,12rem)_minmax(0,17rem)_minmax(0,1fr)]"
        >
          {/* Capped and centred on mobile only: at full 375px width the
              letter-ratio flyer is ~485px tall and the square post ~430px, so
              the four assets stacked ran to nearly three screens of scrolling.
              Container queries keep the text legible at the smaller size. */}
          <div className="asset-in mx-auto w-full max-w-[15rem] sm:mx-0 sm:max-w-none" style={{ animationDelay: "0ms" }}>
            <FlyerPreview content={shown} />
            <p className="mt-2 text-center text-[11px] font-medium text-muted-foreground">
              Print flyer
            </p>
          </div>

          <div className="asset-in mx-auto w-full max-w-[17rem] sm:mx-0 sm:max-w-none" style={{ animationDelay: "120ms" }}>
            <InstagramPreview content={shown} />
          </div>

          <div className="flex flex-col gap-3 sm:col-span-2 xl:col-span-1">
            <div className="asset-in" style={{ animationDelay: "220ms" }}>
              <TextPreview content={shown} />
            </div>
            <div className="asset-in" style={{ animationDelay: "320ms" }}>
              <NextdoorPreview content={shown} />
            </div>
          </div>
        </div>

        {/* The demo's payoff line — this is the moment the value is clearest,
            so the CTA sits directly under it rather than further down the page. */}
        <div className="mt-7 rounded-2xl border border-[var(--brand-teal)]/40 bg-[var(--brand-teal-tint)] p-6">
          <div className="flex flex-col items-center gap-5 text-center sm:flex-row sm:justify-between sm:text-left">
            <div>
              <p className="text-lg font-semibold tracking-tight">
                One promotion. Five ready-to-use marketing assets.
              </p>
              <p className="mt-1.5 text-sm text-muted-foreground">
                The real thing is built around your brand, logo, and colors.
              </p>
            </div>
            <a
              href={PRIMARY_CTA_HREF}
              className="group inline-flex shrink-0 items-center gap-2 rounded-xl bg-[var(--brand-teal-bright)] px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-[var(--brand-teal)]/25 transition-all duration-200 hover:-translate-y-0.5 hover:bg-[var(--brand-teal)]"
            >
              Create Mine Free
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden="true">
                <path d="M5 12h14" />
                <path d="m12 5 7 7-7 7" />
              </svg>
            </a>
          </div>
          {/* The five-asset claim is a Basic/Pro outcome — the free tier gets
              the flyer. Saying so right next to the number keeps the headline
              honest instead of letting it read as the trial experience. */}
          <p className="mt-4 border-t border-[var(--brand-teal)]/20 pt-4 text-xs leading-relaxed text-muted-foreground">
            Free tier includes the flyer. The Instagram, text, and Nextdoor versions plus QR
            tracking are on Basic and Pro.
          </p>
        </div>
      </div>
    </div>
  )
}
