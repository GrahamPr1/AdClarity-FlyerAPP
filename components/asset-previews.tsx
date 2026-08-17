// Visual mockups of what one OneFlyer submission actually produces — the
// flyer, the square Instagram post, the text-blast message, the Nextdoor
// post, and the QR code that goes on the flyer. Exactly that set, because
// that's exactly what the pipeline returns (see CAMPAIGN_ASSETS and the
// honesty note in lib/marketing.ts).
//
// These are CSS/SVG mockups, not real generated output — they illustrate the
// shape and quality of the result using a clearly fictional example business.
// Every place they're used labels them as an example. They deliberately
// render as pure markup (no images, no canvas) so they cost nothing to load
// and stay crisp at any size.

export interface AssetContent {
  business: string
  promo: string
  trade: string
  phone?: string
}

/* --------------------------------- QR mock -------------------------------- */

// Deterministic from the seed so server and client render identically (no
// hydration mismatch) and the "code" doesn't change on every re-render the
// way Math.random() would.
function seededModules(seed: string, size: number): boolean[][] {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  const next = () => {
    h ^= h << 13
    h ^= h >>> 17
    h ^= h << 5
    return ((h >>> 0) % 1000) / 1000
  }

  const grid: boolean[][] = Array.from({ length: size }, () => Array(size).fill(false))
  const inFinder = (r: number, c: number) =>
    (r < 8 && c < 8) || (r < 8 && c >= size - 8) || (r >= size - 8 && c < 8)

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (inFinder(r, c)) continue
      grid[r][c] = next() > 0.5
    }
  }

  // The three finder squares — a 7x7 ring with a 3x3 solid center. These are
  // what make a QR read as a QR at a glance.
  const finder = (top: number, left: number) => {
    for (let r = 0; r < 7; r++) {
      for (let c = 0; c < 7; c++) {
        const edge = r === 0 || r === 6 || c === 0 || c === 6
        const center = r >= 2 && r <= 4 && c >= 2 && c <= 4
        grid[top + r][left + c] = edge || center
      }
    }
  }
  finder(0, 0)
  finder(0, size - 7)
  finder(size - 7, 0)

  return grid
}

export function QrMock({ seed = "oneflyer", className = "" }: { seed?: string; className?: string }) {
  const size = 21
  const grid = seededModules(seed, size)
  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      className={className}
      shapeRendering="crispEdges"
      role="img"
      aria-label="Example QR code"
    >
      <rect width={size} height={size} fill="#ffffff" />
      {grid.map((row, r) =>
        row.map((on, c) =>
          on ? <rect key={`${r}-${c}`} x={c} y={r} width={1} height={1} fill="#12141a" /> : null,
        ),
      )}
    </svg>
  )
}

/* ------------------------------ Flyer preview ----------------------------- */

/**
 * Letter-proportioned (17/22 ≈ 850x1100, the same shape the real flyer
 * thumbnails use in the dashboard) so this reads as an actual print piece
 * rather than a generic card.
 */
export function FlyerPreview({ content, className = "" }: { content: AssetContent; className?: string }) {
  const { business, promo, trade, phone = "(555) 014-2200" } = content
  return (
    <div
      className={`@container aspect-[17/22] w-full overflow-hidden rounded-lg bg-white text-[#12141a] shadow-2xl shadow-black/40 ring-1 ring-black/5 ${className}`}
    >
      <div className="flex h-full flex-col">
        {/* Masthead */}
        <div className="flex items-center gap-[3%] bg-[#1b3a5c] px-[7%] py-[4%] text-white">
          <span className="aspect-square w-[7%] shrink-0 rounded-full bg-[#5eb8f0]" />
          <span className="truncate text-[4.2cqw] font-semibold tracking-tight">{business}</span>
        </div>

        {/* Offer. The headline is clamped because the interactive demo lets a
            visitor type an arbitrary offer — an unusually long one would
            otherwise push the footer out of the fixed-ratio page. */}
        <div className="px-[7%] pt-[5%]">
          <p className="text-[2.6cqw] font-semibold uppercase tracking-[0.18em] text-[#1b3a5c]/60">
            Limited Time Offer
          </p>
          <p className="mt-[2%] line-clamp-3 text-[7.6cqw] font-extrabold leading-[0.98] tracking-tight text-[#1b3a5c]">
            {promo}
          </p>
          <div className="mt-[3.5%] h-[0.6cqw] w-[22%] rounded-full bg-[#5eb8f0]" />
        </div>

        {/* "Photo" band — a stand-in for the client's own photo or an AI image */}
        <div
          className="mx-[7%] mt-[4%] aspect-[16/6] shrink-0 rounded-md"
          style={{
            background:
              "linear-gradient(135deg,#2c5f8f 0%,#1b3a5c 55%,#12263c 100%)",
          }}
        >
          <div className="flex h-full items-end p-[3.5%]">
            <span className="rounded bg-white/15 px-[3%] py-[1.5%] text-[2.4cqw] font-medium text-white backdrop-blur-sm">
              {trade}
            </span>
          </div>
        </div>

        {/* Bullets. min-h-0 lets this be the part that gives way if anything
            has to, rather than the footer getting pushed off the page. */}
        <div className="mt-[4%] min-h-0 flex-1 space-y-[2.5%] overflow-hidden px-[7%]">
          {["Free written estimate", "Licensed & insured crews"].map((b) => (
            <div key={b} className="flex items-center gap-[3%]">
              <svg viewBox="0 0 24 24" className="w-[4%] shrink-0" fill="none" stroke="#5eb8f0" strokeWidth="3.5" aria-hidden="true">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              <span className="truncate text-[3.1cqw] font-medium text-[#12141a]/75">{b}</span>
            </div>
          ))}
        </div>

        {/* Footer: CTA + the QR that really does get printed on it */}
        <div className="mt-[3%] flex shrink-0 items-center justify-between gap-[4%] bg-[#f3f5f7] px-[7%] py-[3.5%]">
          <div className="min-w-0">
            <p className="text-[2.4cqw] font-semibold uppercase tracking-[0.14em] text-[#12141a]/45">
              Call today
            </p>
            <p className="truncate text-[4.4cqw] font-bold tracking-tight text-[#1b3a5c]">{phone}</p>
          </div>
          <QrMock seed={business + promo} className="w-[17%] shrink-0 rounded-sm" />
        </div>
      </div>
    </div>
  )
}

/* ---------------------------- Instagram preview --------------------------- */

export function InstagramPreview({ content, className = "" }: { content: AssetContent; className?: string }) {
  const { business, promo } = content
  // Strips everything a real handle can't contain, not just whitespace — an
  // ampersand in the business name was rendering as "millerheating&air".
  const handle = business.toLowerCase().replace(/[^a-z0-9]+/g, "") || "yourbusiness"
  return (
    <div className={`overflow-hidden rounded-xl border border-white/10 bg-[#1b1e26] ${className}`}>
      {/* Post chrome */}
      <div className="flex items-center gap-2 px-3 py-2.5">
        <span className="h-6 w-6 shrink-0 rounded-full bg-gradient-to-br from-[#5eb8f0] to-[#1b3a5c]" />
        <span className="truncate text-[11px] font-semibold text-white/90">{handle}</span>
      </div>

      {/* The square creative — genuinely a different layout from the flyer,
          which is what the pipeline actually does (it redesigns for a square,
          rather than cropping the print piece). */}
      <div
        className="@container relative aspect-square w-full"
        style={{ background: "linear-gradient(150deg,#1b3a5c 0%,#2c5f8f 60%,#5eb8f0 140%)" }}
      >
        <div className="absolute inset-0 flex flex-col items-center justify-center px-5 text-center">
          <p className="text-[8px] font-semibold uppercase tracking-[0.22em] text-white/60">
            {business}
          </p>
          <p className="mt-2 text-[clamp(0.95rem,4.4cqw,1.6rem)] font-extrabold leading-[1.05] tracking-tight text-white">
            {promo}
          </p>
          <span className="mt-3 rounded-full bg-white px-3 py-1 text-[9px] font-bold text-[#1b3a5c]">
            Book a free estimate
          </span>
        </div>
      </div>

      {/* Caption — the real output includes one. Worded so it reads correctly
          for ANY offer the demo lets a visitor type: the promo is quoted as its
          own clause rather than dropped mid-sentence, which previously produced
          "$500 Off Your New Roof off new roofs this month". */}
      <div className="px-3 py-2.5">
        <p className="text-[10px] leading-relaxed text-white/55">
          <span className="font-semibold text-white/80">{handle}</span>{" "}
          Local and family-run — this month we&apos;re running {promo}. Free estimates, no
          pressure. Tap the link to book. ✨
        </p>
      </div>
    </div>
  )
}

/* ------------------------------ Text preview ------------------------------ */

export function TextPreview({ content, className = "" }: { content: AssetContent; className?: string }) {
  const { business, promo } = content
  return (
    <div className={`rounded-xl border border-white/10 bg-[#1b1e26] p-4 ${className}`}>
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/35">
        Text blast
      </p>
      <div className="mt-3 max-w-[15rem] rounded-2xl rounded-bl-md bg-[#2c5f8f] px-3.5 py-2.5">
        <p className="text-[11.5px] leading-relaxed text-white">
          {business}: {promo} this month only. Free estimate, no pressure — reply or call
          (555) 014-2200. Reply STOP to opt out.
        </p>
      </div>
      <p className="mt-3 text-[10px] text-white/35">Ready to copy and paste.</p>
    </div>
  )
}

/* ---------------------------- Nextdoor preview ---------------------------- */

export function NextdoorPreview({ content, className = "" }: { content: AssetContent; className?: string }) {
  const { business, promo } = content
  return (
    <div className={`rounded-xl border border-white/10 bg-[#1b1e26] p-4 ${className}`}>
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/35">
        Neighborhood post
      </p>
      <div className="mt-3 flex items-start gap-2.5">
        <span className="mt-0.5 h-7 w-7 shrink-0 rounded-full bg-gradient-to-br from-[#5eb8f0] to-[#1b3a5c]" />
        <div className="min-w-0">
          <p className="text-[11px] font-semibold text-white/85">{business}</p>
          {/* Trade-agnostic on purpose — the interactive demo lets a visitor
              pick any business type, and this used to end with "even if the
              roof has a few years left" regardless of what they chose. */}
          <p className="mt-1 text-[11px] leading-relaxed text-white/55">
            Hi neighbors — we&apos;re local and we&apos;re running {promo} through the end of the
            month. Happy to take a look and give you an honest answer either way.
          </p>
        </div>
      </div>
    </div>
  )
}
