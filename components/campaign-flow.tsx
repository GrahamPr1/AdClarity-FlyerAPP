"use client"

import {
  FlyerPreview,
  QrMock,
  type AssetContent,
} from "./asset-previews"
import {
  DEMO_BUSINESS,
  DEMO_PROMO,
  DEMO_TRADE,
} from "@/lib/marketing"

/* --------------------------------- Shared -------------------------------- */

function FieldRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-2.5">
      <span className="w-[4.75rem] shrink-0 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </span>
      <span className="truncate text-[13px] font-medium text-foreground">{value}</span>
    </div>
  )
}

function DownArrow({ className = "" }: { className?: string }) {
  return (
    <div className={`flex justify-center ${className}`} aria-hidden="true">
      <svg width="16" height="26" viewBox="0 0 16 26" fill="none" className="text-[var(--brand-slate)]/45">
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
      className="asset-in flex items-center gap-3 rounded-xl border border-border bg-[var(--surface-soft)] p-2.5"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-lg bg-[#16181d]">
        {children}
      </div>
      <div className="min-w-0">
        <p className="truncate text-[12.5px] font-semibold text-foreground">{label}</p>
        <p className="truncate text-[10.5px] text-muted-foreground">{sub}</p>
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
        style={{ background: "radial-gradient(circle at 65% 25%, rgba(47,109,149,0.18), transparent 62%)" }}
      />

      <div className="rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-pop)] sm:p-5">
        {/* ── Input ── */}
        <div className="asset-in rounded-xl border border-border bg-[var(--surface-soft)] p-3.5" style={{ animationDelay: "0ms" }}>
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
          <span className="text-[12.5px] font-semibold tracking-tight text-foreground">OneFlyer</span>
        </div>

        <DownArrow className="py-1" />

        {/* ── Output ── */}
        <p className="mb-2.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          You get
        </p>
        <div className="grid grid-cols-5 gap-3">
          <div className="asset-in col-span-2" style={{ animationDelay: "320ms" }}>
            <FlyerPreview content={content} />
            <p className="mt-1.5 text-center text-[10px] font-medium text-muted-foreground">Print flyer</p>
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

        <p className="mt-3.5 border-t border-border pt-3 text-center text-[10.5px] leading-relaxed text-muted-foreground">
          Example campaign · {DEMO_BUSINESS} is a fictional business
        </p>
      </div>
    </div>
  )
}
