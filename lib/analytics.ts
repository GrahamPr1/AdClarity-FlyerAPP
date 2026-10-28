"use client"

import { track as vercelTrack } from "@vercel/analytics"
import { BEGIN_CHECKOUT_COOKIE, type PendingBeginCheckout, type PurchaseParams } from "./checkout-tracking"

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

// ---------------------------------------------------------------------------
// Signup conversion for Google Tag Manager (the Meta Pixel tag, which fires on
// a `sign_up` Custom Event) and GA4 (loaded directly via gtag, see
// components/google-analytics.tsx). Meta itself lives entirely in GTM: no fbq
// here. GA4 is already configured: no gtag('config') here.
//
// Call it only from the success handler of a request that the server says
// created a NEW account, never from an effect or on page load. `signupId` is
// the opaque, one-time id that response carries; a sessionStorage flag keyed
// to it makes a second call for the same signup (a double handler run, a
// replayed response, a reload) a no-op. Nothing personal is sent: just the method.
//
// Before a FULL page navigation, call queueSignup() instead. GA4 holds events
// for up to about 5 seconds and sends them in a batch, and a page that unloads
// inside that window loses the hit (seen locally: signup on the way to
// /checkout, which redirects straight to Stripe, sent nothing). The queued
// signup is fired by <ConversionEvents /> (root layout) on the next OneFlyer
// page this tab loads: Stripe's success and cancel URLs, or wherever /checkout
// itself redirects. A client-side router.push keeps the page, so trackSignup
// can fire straight away.
// ---------------------------------------------------------------------------

export type SignupMethod = "email" | "email_link"

type DataLayerWindow = Window & {
  dataLayer?: unknown[]
  gtag?: (...args: unknown[]) => void
}

const sentSignups = new Set<string>()

export function trackSignup(method: SignupMethod, signupId: string): void {
  if (typeof window === "undefined" || !signupId) return
  const flag = `oneflyer:sign_up:${signupId}`
  if (sentSignups.has(flag)) return
  try {
    if (window.sessionStorage.getItem(flag)) return
    window.sessionStorage.setItem(flag, "1")
  } catch {
    // Storage blocked (private mode): the in-memory set still guards this page.
  }
  sentSignups.add(flag)
  sendGoogleEvent("sign_up", { method })
}

/**
 * ONE push, never both. gtag() itself pushes onto the shared dataLayer, and
 * GTM reads a gtag('event', name) entry as a `name` event (parameters under
 * `eventModel`), so that single call reaches GA4 AND fires GTM's Meta tags.
 * Pushing a plain { event } object as well fired the Meta tag a second time
 * (two CompleteRegistration events per signup, seen locally). The plain push
 * is the fallback for a page without GA4 (no Measurement ID set).
 */
function sendGoogleEvent(name: string, params: object): void {
  try {
    const w = window as DataLayerWindow
    w.dataLayer = w.dataLayer || []
    if (typeof w.gtag === "function") w.gtag("event", name, params)
    else w.dataLayer.push({ event: name, ...params })
  } catch {
    // Same rule as trackEvent: analytics must never break a signup or a checkout.
  }
}

const PENDING_KEY = "oneflyer:sign_up:pending"

/** Hold a signup for the next page load (sessionStorage survives the trip to Stripe and back in this tab). */
export function queueSignup(method: SignupMethod, signupId: string): void {
  if (typeof window === "undefined" || !signupId) return
  try {
    window.sessionStorage.setItem(PENDING_KEY, JSON.stringify({ method, signupId }))
  } catch {
    // No storage, so nothing would survive the navigation: fire now, best effort.
    trackSignup(method, signupId)
  }
}

/** Fire a queued signup, once. trackSignup's per-signup flag makes repeat calls no-ops. */
export function flushPendingSignup(): void {
  if (typeof window === "undefined") return
  let pending: { method?: unknown; signupId?: unknown } | null = null
  try {
    const raw = window.sessionStorage.getItem(PENDING_KEY)
    if (!raw) return
    window.sessionStorage.removeItem(PENDING_KEY)
    pending = JSON.parse(raw)
  } catch {
    return
  }
  if (!pending) return
  const { method, signupId } = pending
  if ((method === "email" || method === "email_link") && typeof signupId === "string") trackSignup(method, signupId)
}

// ---------------------------------------------------------------------------
// Checkout conversions: begin_checkout and purchase, sent the same single-call
// way as sign_up. Both are once-only per Stripe id, remembered in
// localStorage so another tab of the same browser can't repeat them; the
// server's own checks (below) are what make them once-only across devices.
// ---------------------------------------------------------------------------

/** First time for this key in this browser? Marks it. Storage blocked: the in-memory set still guards this page. */
const sentOnce = new Set<string>()
function firstTime(key: string): boolean {
  if (sentOnce.has(key)) return false
  sentOnce.add(key)
  try {
    if (window.localStorage.getItem(key)) return false
    window.localStorage.setItem(key, "1")
  } catch {
    // ignore
  }
  return true
}

/**
 * Sends the begin_checkout that /checkout queued in a cookie just before it
 * redirected to Stripe (app/checkout/route.ts), on the first OneFlyer page
 * after: Stripe's success or cancel URL. Clears the cookie either way.
 */
export function flushBeginCheckout(): void {
  if (typeof document === "undefined") return
  const m = document.cookie.match(new RegExp(`(?:^|;\\s*)${BEGIN_CHECKOUT_COOKIE}=([^;]*)`))
  if (!m) return
  document.cookie = `${BEGIN_CHECKOUT_COOKIE}=; Max-Age=0; Path=/; SameSite=Lax`
  let pending: PendingBeginCheckout
  try {
    pending = JSON.parse(decodeURIComponent(m[1]))
  } catch {
    return
  }
  if (!pending?.id || !pending.params) return
  if (firstTime(`oneflyer:begin_checkout:${pending.id}`)) sendGoogleEvent("begin_checkout", pending.params)
}

/** Sends the purchase the server confirmed. transaction_id is the Stripe subscription id. */
export function trackPurchase(params: PurchaseParams): void {
  if (typeof window === "undefined" || !params?.transaction_id) return
  if (firstTime(`oneflyer:purchase:${params.transaction_id}`)) sendGoogleEvent("purchase", params)
}

/**
 * On Stripe's success page (/dashboard?checkout=success&session_id=...), asks
 * the server whether this checkout is a confirmed new subscription that hasn't
 * been reported yet, and sends the purchase only if so. A canceled checkout
 * never lands here; a reload gets { purchase: null } from the server.
 */
const checkingSessions = new Set<string>()
export async function reportCheckoutResult(): Promise<void> {
  if (typeof window === "undefined") return
  const q = new URLSearchParams(window.location.search)
  const id = q.get("session_id")
  if (q.get("checkout") !== "success" || !id || checkingSessions.has(id)) return
  checkingSessions.add(id)
  try {
    const res = await fetch(`/api/billing/checkout-result?session_id=${encodeURIComponent(id)}`, { cache: "no-store" })
    const data = (await res.json().catch(() => ({}))) as { purchase?: PurchaseParams | null }
    if (data.purchase) trackPurchase(data.purchase)
  } catch {
    // Network failure: no conversion rather than a guessed one.
  }
}
