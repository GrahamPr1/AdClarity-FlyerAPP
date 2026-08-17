"use client"

import { useEffect, useState } from "react"
import { OnboardingForm } from "./onboarding-form"
import { LoadingSpinner } from "./loading-spinner"
import type { IntakeSubmission, ServiceItem, SavedBrandProfile } from "@/lib/types"

function fieldBase() {
  return "w-full rounded-lg bg-white/[0.04] border border-white/12 px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-[var(--brand-teal-bright)] focus:ring-1 focus:ring-[var(--brand-teal-bright)] transition-colors"
}

type Stage = "checkingProfile" | "ask" | "scrapeForm" | "scraping" | "prefilled" | "fallback" | "manual"

interface ScrapedNormalizedIntake {
  businessName: string
  industry: string
  yearsInBusiness: number | null
  services: string[]
  targetAudience: string
  contact: { phone: string; address: string; website: string | null; social: { platform: string; handle: string }[] | null; contactName: string | null }
  brandAssets: { logoUrl: string | null; existingColors: string[] | null; existingFontsNote: string | null }
  voiceTonePreference: string
  fontStylePreference: "modern" | "classic" | "playful" | "minimal"
}

let idCounter = 0
const nextId = () => `scraped-svc-${++idCounter}-${Date.now()}`

const SCRAPE_PREFILL_NOTICE = "We pulled this from your website — please review and correct anything that's outdated or wrong."
const SAVED_PROFILE_PREFILL_NOTICE = "We pulled this from your saved business profile — please review and correct anything that's outdated or wrong, or add anything new."

// Converts the Scrape Agent's NormalizedIntake-shaped output (see
// lib/agent-pipeline/schemas/scrape.ts) into OnboardingForm's own raw-form
// initial-state shape — the SAME reshaping the guided flow's own Intake
// Agent does, just run in reverse, in plain code (no AI needed for this
// direction, it's mechanical reformatting, not extraction).
function toFormInitialData(intake: ScrapedNormalizedIntake): Partial<Omit<IntakeSubmission, "businessCategory">> {
  return {
    businessName: intake.businessName,
    industry: intake.industry,
    yearsInBusiness: intake.yearsInBusiness != null ? String(intake.yearsInBusiness) : "",
    services: intake.services.map((name): ServiceItem => ({ id: nextId(), name })),
    voiceTone: intake.voiceTonePreference,
    preferredStyle: intake.fontStylePreference,
    targetAudience: intake.targetAudience,
    brandColors: (intake.brandAssets.existingColors ?? []).join(", "),
    contact: {
      email: "", // overwritten by OnboardingForm's own fixed session email
      phone: intake.contact.phone,
      address: intake.contact.address,
      website: intake.contact.website ?? "",
      socialHandles: (intake.contact.social ?? []).map((s) => `${s.platform}: ${s.handle}`).join(", "),
      contactName: intake.contact.contactName ?? undefined,
    },
  }
}

// Converts a saved Business Profile (see SavedBrandProfile in lib/types.ts
// — the Brand Agent's own output, refreshed after every guided submission)
// into the same raw-form shape. A real, honest gap: BrandProfile only ever
// captures brand/voice/visual identity, never industry, services, or years
// in business — those live solely in each submission's own intake, not
// anywhere persisted in aggregate. Left blank and required here exactly as
// they would be on a from-scratch visit, rather than guessed from brand
// copy.
function toFormInitialDataFromSavedProfile(saved: SavedBrandProfile): Partial<Omit<IntakeSubmission, "businessCategory">> {
  return {
    businessName: saved.brandProfile.businessName,
    voiceTone: saved.brandProfile.brandVoice.join(", "),
    targetAudience: saved.brandProfile.targetAudience.join(", "),
    brandColors: saved.brandProfile.colors.map((c) => c.hex).join(", "),
    contact: {
      email: "", // overwritten by OnboardingForm's own fixed session email
      phone: saved.contact.phone,
      address: saved.contact.address,
      website: saved.contact.website ?? "",
      socialHandles: (saved.contact.social ?? []).map((s) => `${s.platform}: ${s.handle}`).join(", "),
      contactName: saved.contact.contactName ?? undefined,
    },
  }
}

export function GuidedSetupFlow({ email }: { email: string }) {
  const [stage, setStage] = useState<Stage>("checkingProfile")
  const [url, setUrl] = useState("")
  const [fullName, setFullName] = useState("")
  const [phone, setPhone] = useState("")
  const [error, setError] = useState("")
  const [fallbackMessage, setFallbackMessage] = useState("")
  const [prefillNotice, setPrefillNotice] = useState(SCRAPE_PREFILL_NOTICE)
  const [initialData, setInitialData] = useState<Partial<Omit<IntakeSubmission, "businessCategory">> & { businessCategory?: IntakeSubmission["businessCategory"] } | undefined>(undefined)

  // Skip straight to a pre-filled form for a returning user with a saved
  // profile — re-asking "Do you have a website?" from scratch every time
  // they revisit Guided Setup (e.g. to update their info) is exactly the
  // re-typing friction this flow already exists to avoid. They can still
  // re-scan their site from here if they want a refresh (see the
  // "prefilled" stage below). Trial/first-time users with no saved profile
  // fall through to the normal "ask" stage unchanged.
  useEffect(() => {
    let cancelled = false
    fetch("/api/brand-profile")
      .then((r) => r.json())
      .then((d: { profile?: SavedBrandProfile | null }) => {
        if (cancelled) return
        if (d.profile) {
          setInitialData(toFormInitialDataFromSavedProfile(d.profile))
          setPrefillNotice(SAVED_PROFILE_PREFILL_NOTICE)
          setStage("prefilled")
        } else {
          setStage("ask")
        }
      })
      .catch(() => {
        if (!cancelled) setStage("ask")
      })
    return () => {
      cancelled = true
    }
  }, [])

  async function handleScrapeSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    setStage("scraping")

    let res: Response
    try {
      res = await fetch("/api/scrape-website", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, fullName, phone }),
      })
    } catch {
      setFallbackMessage("We couldn't automatically read your website — no problem, let's fill this in together.")
      setStage("fallback")
      return
    }

    const data = await res.json().catch(() => ({}) as { scraped?: boolean; message?: string; normalizedIntake?: ScrapedNormalizedIntake; businessCategoryGuess?: IntakeSubmission["businessCategory"] | null })

    if (!res.ok || !data.scraped || !data.normalizedIntake) {
      // The API already distinguishes "that isn't a valid address" from
      // "we couldn't reach it" from "that site blocks automated reading"
      // (see FAILURE_MESSAGES in app/api/scrape-website/route.ts). Those were
      // being discarded in favour of one generic line, so someone who simply
      // typo'd their domain had no idea that's what happened.
      setFallbackMessage(
        data.message
          ? `${data.message} No problem — let's fill this in together.`
          : "We couldn't automatically read your website — no problem, let's fill this in together.",
      )
      setStage("fallback")
      return
    }

    const converted = toFormInitialData(data.normalizedIntake)
    setInitialData({ ...converted, businessCategory: data.businessCategoryGuess ?? undefined, contact: { ...converted.contact!, phone: phone || converted.contact!.phone } })
    setPrefillNotice(SCRAPE_PREFILL_NOTICE)
    setStage("prefilled")
  }

  if (stage === "checkingProfile") {
    return <LoadingSpinner message="Loading…" />
  }

  if (stage === "prefilled") {
    return (
      <div>
        {prefillNotice === SAVED_PROFILE_PREFILL_NOTICE && (
          <div className="flex justify-end">
            <button type="button" onClick={() => setStage("scrapeForm")}
              className="text-xs text-muted-foreground hover:text-foreground underline transition-colors">
              Re-scan my website instead
            </button>
          </div>
        )}
        <OnboardingForm email={email} initialData={initialData} prefillNotice={prefillNotice} />
      </div>
    )
  }
  if (stage === "fallback") {
    return (
      <div>
        <div className="rounded-xl border border-white/10 bg-card p-4 text-sm text-muted-foreground mb-2">{fallbackMessage}</div>
        <OnboardingForm email={email} />
      </div>
    )
  }
  if (stage === "manual") {
    return <OnboardingForm email={email} />
  }

  if (stage === "scraping") {
    return <LoadingSpinner message="Reading your website… this takes about 15–20 seconds." />
  }

  if (stage === "scrapeForm") {
    return (
      <div>
        <button type="button" onClick={() => setStage("ask")} className="text-sm text-muted-foreground hover:text-foreground transition-colors">← Back</button>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight">Let's scan your website</h1>
        <p className="mt-2 text-sm text-muted-foreground">We'll pull your business details automatically — you'll review everything before it's final.</p>
        <form onSubmit={handleScrapeSubmit} className="mt-6 flex flex-col gap-4 max-w-md">
          <div>
            <label htmlFor="url" className="block text-sm font-medium mb-1.5">Website URL</label>
            <input id="url" type="url" inputMode="url" autoComplete="url" required className={fieldBase()} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="yourbusiness.com" />
          </div>
          <div>
            <label htmlFor="fullName" className="block text-sm font-medium mb-1.5">Full name</label>
            <input id="fullName" autoComplete="name" required className={fieldBase()} value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Jane Smith" />
          </div>
          <div>
            <label htmlFor="phone" className="block text-sm font-medium mb-1.5">Phone number</label>
            <input id="phone" type="tel" inputMode="tel" autoComplete="tel" required className={fieldBase()} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(555) 123-4567" />
          </div>
          {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
          <button type="submit" disabled={!url.trim() || !fullName.trim() || !phone.trim()}
            className="self-start px-6 py-2.5 rounded-lg bg-[var(--brand-teal-bright)] text-white text-sm font-semibold hover:bg-[var(--brand-teal)] disabled:opacity-60 transition-colors">
            Scan my site
          </button>
        </form>
      </div>
    )
  }

  // stage === "ask"
  return (
    <div>
      <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">Do you have a website?</h1>
      <p className="mt-2 text-sm text-muted-foreground">We can read it automatically and pre-fill everything below.</p>
      <div className="mt-6 grid sm:grid-cols-2 gap-4">
        <button type="button" onClick={() => setStage("scrapeForm")}
          className="text-left rounded-2xl border-2 border-[var(--brand-teal-bright)] bg-card p-6 hover:bg-white/[0.03] transition-colors">
          <p className="text-lg font-semibold">Yes, scan my site</p>
          <p className="mt-1.5 text-sm text-muted-foreground">We'll pull your business info automatically — you review and confirm it after.</p>
        </button>
        <button type="button" onClick={() => setStage("manual")}
          className="text-left rounded-2xl border border-white/10 bg-card p-6 hover:bg-white/[0.03] transition-colors">
          <p className="text-lg font-semibold">No, I'll answer a few questions</p>
          <p className="mt-1.5 text-sm text-muted-foreground">A short guided setup — just as thorough, no website needed.</p>
        </button>
      </div>
    </div>
  )
}
