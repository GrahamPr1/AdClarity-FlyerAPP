"use client"

import { track as vercelTrack } from "@vercel/analytics"

// ---------------------------------------------------------------------------
// Funnel event tracking.
//
// Built on @vercel/analytics, which is ALREADY installed and mounted in
// app/layout.tsx — no new dependency, no extra script, no cookie banner
// obligation (Vercel Web Analytics is cookieless). This module exists so
// that swapping in PostHog/Segment later is a one-file change instead of a
// hunt through components, and so the event names stay a closed set rather
// than free-form strings typed at each call site.
//
// PRIVACY: event properties are a deliberately narrow allowlist of
// non-identifying values (see EventProps). Never pass an email, password,
// phone number, address, business name, prompt text, or generated campaign
// copy through here. Vercel Analytics is not a data processor we've told
// users about, and none of those values would make the funnel any more
// legible anyway — "which step did people drop at" needs counts, not
// identities. sanitizeProps below drops anything that isn't allowlisted, so
// a careless future call site fails closed rather than leaking.
// ---------------------------------------------------------------------------

/** The complete set of funnel events. Adding one here is intentional; typos can't create a new event. */
export type AnalyticsEvent =
  // Landing
  | "landing_cta_clicked"
  // Signup
  | "signup_started"
  | "signup_completed"
  // Activation
  | "onboarding_started"
  | "campaign_creation_started"
  | "campaign_created"
  | "campaign_failed"
  // Monetization — the last two stay unused until Stripe exists, and are
  // declared now so the call sites are obvious when it's wired up.
  | "pricing_viewed"
  | "upgrade_clicked"
  | "checkout_started"
  | "subscription_created"
  // Retention
  | "repeat_campaign_started"

/**
 * Allowlisted, non-identifying properties. Everything here is either a
 * closed enum (plan, path) or a small integer — nothing free-form, so no
 * user-authored text can ride along by accident.
 */
export interface EventProps {
  /** "trial" | "basic" | "pro" — plan tier, not a customer identifier. */
  plan?: string
  /** Which creation path: "guided" | "quick" | "scrape". */
  method?: string
  /** Where a CTA was clicked, e.g. "hero" | "pricing" | "final". */
  location?: string
  /** Nth campaign for this account — the retention signal, an integer, not an id. */
  campaignNumber?: number
  /** Coarse failure reason from a closed set, never a raw error message. */
  reason?: string
}

const ALLOWED_KEYS: (keyof EventProps)[] = ["plan", "method", "location", "campaignNumber", "reason"]

function sanitizeProps(props?: EventProps): Record<string, string | number> | undefined {
  if (!props) return undefined
  const out: Record<string, string | number> = {}
  for (const key of ALLOWED_KEYS) {
    const value = props[key]
    if (value === undefined || value === null) continue
    // Strings are truncated as a second line of defence: even an allowlisted
    // key shouldn't be able to carry a paragraph of user content.
    out[key] = typeof value === "number" ? value : String(value).slice(0, 64)
  }
  return Object.keys(out).length > 0 ? out : undefined
}

/**
 * Fire a funnel event. Safe to call from anywhere client-side: it never
 * throws (analytics failing must never break a signup) and is a no-op
 * server-side.
 */
export function trackEvent(event: AnalyticsEvent, props?: EventProps): void {
  if (typeof window === "undefined") return
  try {
    vercelTrack(event, sanitizeProps(props))
  } catch {
    // Deliberately swallowed — a blocked analytics script or an ad blocker
    // must not surface as an error in the middle of someone's signup.
  }
}
