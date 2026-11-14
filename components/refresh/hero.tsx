import { PLAN_LIMITS } from "@/lib/types"
import { PRIMARY_CTA_HREF } from "@/lib/marketing"
import { FOR_AGENTS_HREF } from "./site-header"

// Homepage hero (Main mockup). Copy from the mockup; numbers from config
// (PLAN_LIMITS.trial). The right column is the B2C video slot: until a video
// is configured (step F) it shows a clean placeholder, never a play button
// that plays nothing. On phones the slot sits below the headline and CTAs.

export function RefreshHero() {
  return (
    <section style={{ padding: "56px 24px 72px", display: "flex", justifyContent: "center" }}>
      <div style={{ width: "100%", maxWidth: 1200, display: "flex", flexWrap: "wrap", gap: 56, alignItems: "center" }}>
        <div style={{ flex: "1 1 480px", minWidth: 0, display: "flex", flexDirection: "column", gap: 24 }}>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 700, letterSpacing: "0.18em", color: "var(--rf-link)" }}>MARKETING FOR LOCAL BUSINESS</p>
          <h1 className="rf-serif" style={{ margin: 0, fontSize: "clamp(40px, 6vw, 64px)", lineHeight: 1.02, color: "var(--rf-text)" }}>
            Turn one promotion into an <span style={{ fontStyle: "italic", color: "var(--rf-link)" }}>entire marketing campaign.</span>
          </h1>
          <p style={{ margin: 0, fontSize: 19, lineHeight: 1.55, color: "var(--rf-text-2)", maxWidth: 520 }}>
            A print-ready flyer, an Instagram post, a text message, a Nextdoor post and a trackable QR code, all from one simple promotion.
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
            <a href={PRIMARY_CTA_HREF} className="rf-btn-primary" style={{ fontSize: 17, padding: "16px 26px", boxShadow: "var(--rf-cta-shadow)" }} data-ga="hero_cta">Create my first campaign — free</a>
            <a href="#how" className="rf-btn-outline" style={{ fontSize: 17, padding: "15px 24px" }}>See how it works</a>
          </div>
          <p style={{ margin: 0, fontSize: 14, color: "var(--rf-muted)" }}>{PLAN_LIMITS.trial} flyers free · No credit card required</p>
          <a href={FOR_AGENTS_HREF} data-ga="hero_agents_card" style={{ display: "flex", alignItems: "center", gap: 12, textDecoration: "none", background: "var(--rf-surface)", border: "1px solid var(--rf-border)", borderRadius: 16, padding: "14px 18px", maxWidth: 470 }}>
            <span aria-hidden="true" style={{ flex: "none", width: 36, height: 36, borderRadius: 10, background: "var(--rf-amber)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0E1B2E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="8" r="3.5" /><circle cx="17" cy="9.5" r="2.5" /><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" /><path d="M15 15.2c.6-.2 1.3-.2 2-.2 2.2 0 4 1.8 4 4" /></svg>
            </span>
            <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <span style={{ color: "var(--rf-text)", fontWeight: 600, fontSize: 15 }}>Run a team of agents?</span>
              <span style={{ color: "var(--rf-link)", fontSize: 14 }}>Explore OneFlyer for Agents →</span>
            </span>
          </a>
        </div>

        <div style={{ flex: "1 1 520px", minWidth: 0 }}>
          <figure style={{ margin: 0, position: "relative", borderRadius: 24, background: "var(--rf-video-frame)", padding: 14, boxShadow: "0 24px 60px rgba(19,41,75,0.28)" }} data-video-slot="b2c" data-video-configured="false">
            <div style={{ position: "relative", aspectRatio: "16 / 10", borderRadius: 14, overflow: "hidden", background: "var(--rf-video-stage)" }} aria-hidden="true">
              <div style={{ position: "absolute", left: "8%", top: "12%", width: "38%", height: "76%", background: "#FFFFFF", borderRadius: 6, transform: "rotate(-5deg)", boxShadow: "0 10px 30px rgba(0,0,0,0.3)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
                <div style={{ height: "30%", background: "#2C5F8A" }} />
                <div style={{ padding: 10, display: "flex", flexDirection: "column", gap: 6 }}>
                  <div style={{ height: 8, width: "70%", background: "#13294B", borderRadius: 2 }} />
                  <div style={{ height: 6, width: "90%", background: "#D9DEE6", borderRadius: 2 }} />
                  <div style={{ height: 6, width: "80%", background: "#D9DEE6", borderRadius: 2 }} />
                  <div style={{ height: 22, width: "50%", background: "#F0A13B", borderRadius: 4, marginTop: 6 }} />
                </div>
              </div>
              <div style={{ position: "absolute", right: "9%", top: "18%", width: "30%", aspectRatio: "1 / 1", background: "#E3EEF8", borderRadius: 10, transform: "rotate(4deg)", boxShadow: "0 10px 30px rgba(0,0,0,0.3)" }} />
              <div style={{ position: "absolute", right: "14%", bottom: "10%", width: "22%", height: "22%", background: "#FFFFFF", borderRadius: 12, transform: "rotate(-2deg)", boxShadow: "0 10px 30px rgba(0,0,0,0.3)" }} />
            </div>
            <figcaption style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", padding: "14px 6px 4px", color: "var(--rf-on-navy)", fontSize: 14 }}>
              <span style={{ fontWeight: 600 }}>OneFlyer in 90 seconds</span>
              <span style={{ color: "var(--rf-on-navy-3)" }}>Video coming soon</span>
            </figcaption>
          </figure>
        </div>
      </div>
    </section>
  )
}
