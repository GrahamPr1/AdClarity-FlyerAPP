"use client"

import { useState } from "react"
import {
  FlyerPreview,
  InstagramPreview,
  TextPreview,
  NextdoorPreview,
  type AssetContent,
} from "./asset-previews"
import {
  DEMO_BUSINESS,
  DEMO_PROMO,
  DEMO_TRADE,
  PRIMARY_CTA_HREF,
  USE_CASES,
} from "@/lib/marketing"

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
  // Mobile-only: the Instagram/text/Nextdoor previews start collapsed so the
  // demo doesn't run to 3+ screens on a phone. Irrelevant from sm up, where
  // the <details> wrapper becomes `contents` and everything is always shown.
  const [secondaryOpen, setSecondaryOpen] = useState(false)

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
        // Reads as a small tool rather than a form printed on the page: a
        // brighter border and tinted fill mark it as the one thing here you
        // interact with. Purely a treatment on the existing container — no
        // added markup and no added height.
        className="flex flex-col gap-4 rounded-2xl border border-[var(--brand-teal)]/35 bg-[var(--brand-teal-tint)] p-6 shadow-lg shadow-[color:var(--brand-teal)]/10"
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

          {/* Collapsed on phones only. Stacked, these three previews made the
              demo 3.4 screens tall on a 375px viewport and pushed pricing far
              down the page; the flyer alone still proves the point, and
              anyone who wants the rest is one tap away. From sm up they're
              always visible (`sm:contents` drops this wrapper from the grid
              so the children remain direct grid items). */}
          <details className="group sm:contents" open={secondaryOpen} onToggle={(e) => setSecondaryOpen((e.currentTarget as HTMLDetailsElement).open)}>
            <summary className="mx-auto mt-1 w-full max-w-[17rem] cursor-pointer list-none rounded-lg border border-white/12 bg-white/[0.03] px-4 py-2.5 text-center text-sm font-medium text-foreground/80 sm:hidden">
              {secondaryOpen ? "Hide the other formats" : "See the Instagram, text & Nextdoor versions"}
            </summary>

            <div className="asset-in mx-auto mt-3 w-full max-w-[17rem] sm:mx-0 sm:mt-0 sm:max-w-none" style={{ animationDelay: "120ms" }}>
              <InstagramPreview content={shown} />
            </div>

            <div className="mt-3 flex flex-col gap-3 sm:mt-0 sm:col-span-2 xl:col-span-1">
              <div className="asset-in" style={{ animationDelay: "220ms" }}>
                <TextPreview content={shown} />
              </div>
              <div className="asset-in" style={{ animationDelay: "320ms" }}>
                <NextdoorPreview content={shown} />
              </div>
            </div>
          </details>
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
