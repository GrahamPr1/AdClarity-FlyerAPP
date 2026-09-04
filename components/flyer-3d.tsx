"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { FlyerPreview, QrMock, type AssetContent } from "./asset-previews"
import { DEMO_BUSINESS, DEMO_PROMO, DEMO_TRADE } from "@/lib/marketing"

/* ---------------------------------------------------------------------------
   Flyer3D — the interactive 3D shell.

   Deliberately not a WebGL/three.js scene. The thing being shown is a sheet of
   paper: a CSS 3D transform on real DOM gives it genuine perspective, keeps the
   flyer's text as selectable, translatable, screen-readable text, costs no
   extra bytes, and still renders if JS never arrives (it just sits at its
   resting tilt). A canvas would trade all of that for nothing a flat rectangle
   needs.

   Motion is written straight to CSS custom properties inside a rAF, so the
   compositor does the work and React never re-renders on pointer move.
   --------------------------------------------------------------------------- */

type Flyer3DProps = {
  /** The front face — a flyer thumbnail, an <iframe>, a preview mock. */
  children: React.ReactNode
  /** Extra cards that float at their own Z depth and share the tilt. */
  satellites?: React.ReactNode
  className?: string
  /** Paper thickness, in px. */
  depth?: number
  /** Maximum tilt away from rest, in degrees. */
  maxTilt?: number
  /** Drift gently when untouched, so it reads as interactive before contact. */
  idle?: boolean
  /** Specular sweep. Off for busy content where it just adds haze. */
  glare?: boolean
}

export function Flyer3D({
  children,
  satellites,
  className = "",
  depth = 6,
  maxTilt = 11,
  idle = true,
  glare = true,
}: Flyer3DProps) {
  const sceneRef = useRef<HTMLDivElement>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  const frame = useRef<number | null>(null)
  const [active, setActive] = useState(false)

  // Read once on mount rather than per-event. Checked in JS as well as CSS
  // because the cheapest way to honour the preference is to never attach the
  // work at all, not to animate to a suppressed duration.
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)")
    const sync = () => setReduced(mq.matches)
    sync()
    mq.addEventListener("change", sync)
    return () => mq.removeEventListener("change", sync)
  }, [])

  useEffect(
    () => () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current)
    },
    [],
  )

  const track = useCallback(
    (clientX: number, clientY: number) => {
      const scene = sceneRef.current
      const card = cardRef.current
      if (!scene || !card) return
      const r = scene.getBoundingClientRect()
      if (r.width === 0 || r.height === 0) return
      const px = (clientX - r.left) / r.width - 0.5 // -0.5 .. 0.5
      const py = (clientY - r.top) / r.height - 0.5

      if (frame.current !== null) cancelAnimationFrame(frame.current)
      frame.current = requestAnimationFrame(() => {
        card.style.setProperty("--ry", `${(px * maxTilt * 2).toFixed(2)}deg`)
        card.style.setProperty("--rx", `${(-py * maxTilt * 2).toFixed(2)}deg`)
        // Light source stays put while the sheet turns under it.
        card.style.setProperty("--glare-angle", `${(105 + px * 110).toFixed(1)}deg`)
        card.style.setProperty("--glare-strength", `${(0.16 + Math.abs(px) * 0.34).toFixed(3)}`)
      })
    },
    [maxTilt],
  )

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    // Coarse pointers get the idle drift instead: tracking a finger means the
    // flyer spends the whole gesture hidden under it.
    if (reduced || e.pointerType === "touch") return
    if (!active) setActive(true)
    track(e.clientX, e.clientY)
  }

  const onPointerLeave = () => {
    if (!active) return
    setActive(false)
    const card = cardRef.current
    if (!card) return
    if (frame.current !== null) cancelAnimationFrame(frame.current)
    card.style.removeProperty("--rx")
    card.style.removeProperty("--ry")
    card.style.removeProperty("--glare-angle")
    card.style.removeProperty("--glare-strength")
  }

  return (
    <div
      ref={sceneRef}
      className={`flyer3d-scene ${className}`}
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
    >
      <div
        ref={cardRef}
        className={`flyer3d-card relative ${active ? "is-tracking" : ""} ${
          idle && !active && !reduced ? "flyer3d-idle" : ""
        }`}
        style={{ ["--depth" as string]: `${depth}px` }}
      >
        {/* Paper thickness: a face pushed back along Z so the sheet has an
            edge to catch the light instead of being an infinitely thin plane. */}
        <span aria-hidden="true" className="flyer3d-edge rounded-lg" />
        {children}
        {glare ? <span aria-hidden="true" className="flyer3d-glare rounded-lg" /> : null}
        {satellites}
      </div>
    </div>
  )
}

/* ---------------------------------------------------------------------------
   Satellite cards — the other pieces of the campaign, floating in front of the
   flyer at their own depths. They exist because the product's whole claim is
   "one promotion becomes a campaign"; a lone flyer in the hero shows half of it.
   --------------------------------------------------------------------------- */

function Satellite({
  z,
  className = "",
  delay,
  children,
}: {
  z: number
  className?: string
  delay: number
  children: React.ReactNode
}) {
  return (
    <div
      className={`asset-in absolute rounded-xl border border-border bg-card shadow-[var(--shadow-lift)] ${className}`}
      style={{ transform: `translateZ(${z}px)`, animationDelay: `${delay}ms` }}
      aria-hidden="true"
    >
      {children}
    </div>
  )
}

/**
 * The homepage hero showpiece: the printed flyer, with the Instagram post,
 * the text blast and the trackable QR lifted off its surface.
 */
export function HeroFlyer3D({ className = "" }: { className?: string }) {
  const content: AssetContent = {
    business: DEMO_BUSINESS,
    promo: DEMO_PROMO,
    trade: DEMO_TRADE,
  }

  return (
    <figure className={`relative ${className}`}>
      {/* Ambient bloom, sized to the composition rather than the card, so the
          satellites don't hang off an unlit edge. */}
      <div
        aria-hidden="true"
        className="absolute -inset-10 -z-10 rounded-[3rem] opacity-70 blur-3xl"
        style={{
          background:
            "radial-gradient(circle at 62% 30%, rgba(47,109,149,0.20), transparent 64%)",
        }}
      />

      <Flyer3D
        className="mx-auto w-full max-w-[16.5rem] sm:max-w-[19rem] lg:max-w-[21rem]"
        depth={7}
        maxTilt={12}
        satellites={
          <>
            {/* Satellites are hidden on phones. There is no offset that keeps
                a 136px card clear of a 264px flyer inside a viewport that
                narrow — it either covers the offer headline (the one thing
                the mock exists to show) or gets clipped by the stage. The
                flyer alone reads better there, and they're decorative. */}

            {/* Instagram square — clears the masthead, sits off the right edge. */}
            <Satellite z={78} delay={520} className="hidden sm:block sm:-right-24 sm:top-2 sm:w-[8.5rem] lg:-right-32 overflow-hidden p-1.5">
              <div
                className="aspect-square w-full rounded-lg"
                style={{ background: "linear-gradient(150deg,#1b3a5c,#5eb8f0)" }}
              />
              <p className="px-1 pb-0.5 pt-1.5 text-[9.5px] font-medium leading-tight text-muted-foreground">
                Instagram post
              </p>
            </Satellite>

            {/* Trackable QR */}
            <Satellite z={112} delay={640} className="hidden sm:flex sm:-left-24 sm:bottom-20 sm:w-[7.75rem] lg:-left-28 items-center gap-2 p-2">
              <QrMock seed={DEMO_BUSINESS} className="h-9 w-9 shrink-0 rounded" />
              <div className="min-w-0">
                <p className="text-[10px] font-medium leading-tight text-foreground">QR code</p>
                <p className="text-[9px] leading-tight text-muted-foreground">Scans counted</p>
              </div>
            </Satellite>

            {/* Text blast */}
            <Satellite z={52} delay={740} className="hidden sm:block sm:-bottom-8 sm:-right-16 sm:w-[9.5rem] lg:-right-24 p-2.5">
              <p className="text-[9px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                Text blast
              </p>
              <p className="mt-1 line-clamp-2 text-[10.5px] leading-snug text-foreground">
                {DEMO_PROMO} — reply STOP to opt out.
              </p>
            </Satellite>
          </>
        }
      >
        <FlyerPreview content={content} className="shadow-[var(--shadow-pop)]" />
      </Flyer3D>

      {/* Says "example", not "five pieces": the satellites are hidden on
          phones, so a count would be captioning three cards that aren't
          there. The hero paragraph already names all five. */}
      <figcaption className="mt-12 text-center text-[11px] text-muted-foreground">
        Example campaign · {DEMO_BUSINESS} is a fictional business
      </figcaption>
    </figure>
  )
}
