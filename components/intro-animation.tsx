"use client"

import { useEffect, useState } from "react"

const LETTERS = ["O", "N", "E", "F", "L", "Y", "E", "R"]

const LETTER_IN_STAGGER = 85 // ms between each letter appearing
const LETTER_IN_DUR = 700 // duration of each letter appear transition
const HOLD_DURATION = 450 // hold fully visible before the panel wipes up
const LETTERS_IN_TOTAL = LETTER_IN_STAGGER * (LETTERS.length - 1) + LETTER_IN_DUR + HOLD_DURATION

const WIPE_DURATION = 1100 // panel slide-up duration (matches CSS transition)
const WIPE_DELAY = LETTERS_IN_TOTAL // when the panel begins wiping upward

// Exported: moment the panel has fully cleared — when the page is fully visible
export const INTRO_DURATION_MS = WIPE_DELAY + WIPE_DURATION
// Exported: ms before the wipe finishes to begin hero animations (overlap for smoothness)
export const HERO_REVEAL_MS = WIPE_DELAY + WIPE_DURATION - 350

type Phase = "idle" | "in" | "wipe" | "done"

export function IntroAnimation({ onDone }: { onDone: () => void }) {
  const [phase, setPhase] = useState<Phase>("idle")

  useEffect(() => {
    // Tiny delay so the browser has painted before we start transitioning
    const t0 = setTimeout(() => setPhase("in"), 80)
    const t1 = setTimeout(() => setPhase("wipe"), WIPE_DELAY)
    const t2 = setTimeout(() => onDone(), HERO_REVEAL_MS)
    const t3 = setTimeout(() => setPhase("done"), INTRO_DURATION_MS + 100)

    return () => {
      clearTimeout(t0)
      clearTimeout(t1)
      clearTimeout(t2)
      clearTimeout(t3)
    }
  }, [onDone])

  if (phase === "done") return null

  const wiping = phase === "wipe"

  return (
    <div className="fixed inset-0 z-[100] pointer-events-none" aria-hidden="true">
      {/* Full-screen brand panel — the ONEFLYER wordmark rides ON the panel and
          wipes upward together, revealing the page (and nav) in one motion.
          This is the single brand reveal — the title appears exactly once. */}
      <div
        className="absolute inset-0 flex items-center justify-center overflow-hidden"
        style={{
          transform: wiping ? "translateY(-100%)" : "translateY(0%)",
          transition: wiping ? `transform ${WIPE_DURATION}ms cubic-bezier(0.76, 0, 0.24, 1)` : "none",
          background: "linear-gradient(160deg, #1f232c 0%, #12141a 55%, #090a0d 100%)",
        }}
      >
        {/* soft teal glow behind the wordmark */}
        <div
          className="absolute w-[70vw] h-[70vw] rounded-full blur-[100px] opacity-60"
          style={{ background: "radial-gradient(circle, rgba(94,184,240,0.28), transparent 65%)" }}
        />

        <div className="relative flex" style={{ gap: "0.06em" }}>
          {LETTERS.map((letter, i) => {
            const inDelay = i * LETTER_IN_STAGGER
            const isIdle = phase === "idle"
            const isIn = phase === "in" || wiping

            const opacity = isIdle ? 0 : 1
            const blur = isIdle ? 32 : 0
            const translateY = isIdle ? 44 : 0

            const transition = isIn
              ? `opacity ${LETTER_IN_DUR}ms cubic-bezier(0.16,1,0.3,1) ${inDelay}ms,
                 filter  ${LETTER_IN_DUR}ms cubic-bezier(0.16,1,0.3,1) ${inDelay}ms,
                 transform ${LETTER_IN_DUR}ms cubic-bezier(0.16,1,0.3,1) ${inDelay}ms`
              : "none"

            return (
              <span
                key={i}
                className="font-sans font-bold text-[#eef1f5] leading-none select-none"
                style={{
                  fontSize: `calc((100vw - 64px) / ${LETTERS.length})`,
                  letterSpacing: "0.05em",
                  opacity,
                  filter: `blur(${blur}px)`,
                  transform: `translateY(${translateY}px)`,
                  transition,
                  willChange: "opacity, filter, transform",
                }}
              >
                {letter}
              </span>
            )
          })}
        </div>
      </div>
    </div>
  )
}
