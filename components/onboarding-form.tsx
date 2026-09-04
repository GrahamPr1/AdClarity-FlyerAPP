"use client"

import Link from "next/link"
import { useState, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import type { BusinessCategory, CampaignDefaults, IntakeSubmission, PlanId, ServiceItem } from "@/lib/types"
import { BUSINESS_CATEGORIES } from "@/lib/types"
import { getPlan } from "@/lib/plans"
import { trackEvent } from "@/lib/analytics"
import { OUTPUT_FORMATS, FORMAT_IDS, DEFAULT_FORMAT } from "@/lib/agent-pipeline/formats"

// Three steps, not the original six.
//
// Only five fields are actually required to generate a campaign (see the
// validation block in app/api/intake/route.ts): businessCategory,
// businessName, industry, one service, and targetAudience. Those were spread
// across four of six steps, surrounded by ~15 optional inputs presented
// identically — and two entire steps ("Brand", "Deliverables") contained no
// required field at all. A brand-new signup had to page through all of it
// before seeing a single flyer.
//
// The required five now sit in steps 1-2, plus two fields that aren't
// API-required but that a usable first campaign genuinely needs:
//   - the promotion itself (flyerNotes) — it's what the flyer is FOR, and
//     the whole product positioning is "tell us what you're promoting"
//   - a phone number — it's printed on the flyer as the call-to-action, and
//     a flyer with no way to contact the business is not worth generating
//
// Everything else moved to /profile (see CampaignDefaults in lib/types.ts),
// collected after the first campaign and merged in automatically from then
// on. Per-campaign extras (photos, reference material) stay here behind a
// collapsed disclosure on the last step, so they cost nothing to skip.
const STEPS = ["Business", "Promotion", "Contact"] as const

const MAX_FLYER_PHOTOS = 5

// The rest of IntakeSubmission's required fields start empty too (e.g.
// businessName: ""), but those are plain strings — an empty string isn't a
// valid BusinessCategory, so the form's own local state widens just this
// one field to allow "unselected" while it's being filled out. Narrowed
// back to a real BusinessCategory before it's ever sent to /api/intake —
// see canProceed below, which blocks past step 0 until it's set.
type OnboardingFormState = Omit<IntakeSubmission, "businessCategory"> & { businessCategory: BusinessCategory | "" }

function fieldBase() {
  return "w-full rounded-lg bg-[var(--surface-soft)] border border-border px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-[var(--brand-teal-bright)] focus:ring-1 focus:ring-[var(--brand-teal-bright)] transition-colors"
}

function Label({ children, htmlFor }: { children: React.ReactNode; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className="block text-sm font-medium mb-1.5">
      {children}
    </label>
  )
}

let idCounter = 0
const nextId = () => `svc-${++idCounter}-${Date.now()}`

export function OnboardingForm({
  email,
  initialData,
  prefillNotice,
}: {
  email: string
  /** Pre-fill from a website scrape or a saved Business Profile (see components/guided-setup-flow.tsx) — merged into the default blank state below. Any field it doesn't provide stays blank and required, exactly as today. */
  initialData?: Partial<Omit<IntakeSubmission, "businessCategory">> & { businessCategory?: BusinessCategory }
  /** Set (to a source-specific message) whenever initialData came from something other than a blank form — shows a review banner with this exact text (section 4 of the auto-fill spec) so pre-filled data is never silently submitted without the client seeing it first, and reveals the "contact person" field. */
  prefillNotice?: string
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const planId = (searchParams.get("plan") as PlanId | null) ?? null
  const plan = getPlan(planId)

  const [step, setStep] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const [photoUploadError, setPhotoUploadError] = useState("")

  // The AI-photo opt-in is Pro-only — real enforcement lives server-side in
  // the pipeline (see getPlanFeatures in lib/agent-pipeline/pipeline.ts);
  // this fetch is only so the checkbox reflects reality instead of offering
  // something that would silently no-op. `planId` from the query string
  // (used above for onboarding's own display copy) is cosmetic only, never
  // real enforcement — see the note on PlanId in lib/types.ts.
  const [realPlanId, setRealPlanId] = useState<PlanId | null>(null)
  // Whether this is genuinely their FIRST campaign. /onboarding doubles as the
  // "create another" route, so the heading has to know — it was telling a
  // returning client with campaigns already made that this was their first.
  // Read from the same response as the plan rather than a second request.
  const [isFirstCampaign, setIsFirstCampaign] = useState(true)
  useEffect(() => {
    fetch("/api/deliverables")
      .then((r) => r.json())
      .then((d) => {
        setRealPlanId(d.planId ?? null)
        setIsFirstCampaign((d.flyers?.length ?? 0) === 0)
      })
      .catch(() => {})
  }, [])

  // contact.email is fixed to the authenticated session's email — signing
  // in now happens BEFORE onboarding (see app/onboarding/page.tsx), so
  // this is never a free-text field someone could type any address into.
  const [form, setForm] = useState<OnboardingFormState>({
    planId,
    businessCategory: initialData?.businessCategory ?? "",
    businessName: initialData?.businessName ?? "",
    industry: initialData?.industry ?? "",
    yearsInBusiness: initialData?.yearsInBusiness ?? "",
    services: initialData?.services?.length ? initialData.services : [{ id: nextId(), name: "" }],
    logoFileName: initialData?.logoFileName,
    brandColors: initialData?.brandColors ?? "",
    preferredStyle: initialData?.preferredStyle ?? "modern",
    voiceTone: initialData?.voiceTone ?? "",
    targetAudience: initialData?.targetAudience ?? "",
    contact: {
      email,
      phone: initialData?.contact?.phone ?? "",
      address: initialData?.contact?.address ?? "",
      website: initialData?.contact?.website ?? "",
      socialHandles: initialData?.contact?.socialHandles ?? "",
      contactName: initialData?.contact?.contactName,
    },
    existingMaterialsFileName: undefined,
    flyerPhotoUrls: [],
    wantsAiPhotos: false,
    wantsQrCode: initialData?.wantsQrCode ?? true,
    formatId: initialData?.formatId ?? DEFAULT_FORMAT,
    flyerNotes: initialData?.flyerNotes ?? "",
    websitePreferences: "",
  })

  function set<K extends keyof OnboardingFormState>(key: K, value: OnboardingFormState[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }
  function setContact<K extends keyof IntakeSubmission["contact"]>(key: K, value: string) {
    setForm((f) => ({ ...f, contact: { ...f.contact, [key]: value } }))
  }

  // The other half of moving the optional fields to /profile: once saved,
  // they have to actually reach the pipeline, since they're no longer typed
  // here. Merged in as defaults rather than shown — the point of moving them
  // out was that they don't belong in this flow. Anything explicitly passed
  // via initialData (a website scrape, a saved brand profile) still wins,
  // because that's fresher and the user is about to review it on screen.
  const [defaultsApplied, setDefaultsApplied] = useState(false)
  useEffect(() => {
    let cancelled = false
    fetch("/api/campaign-defaults")
      .then((r) => r.json())
      .then((d: { defaults?: CampaignDefaults | null }) => {
        if (cancelled || !d.defaults) return
        const saved = d.defaults
        setForm((f) => ({
          ...f,
          yearsInBusiness: f.yearsInBusiness || saved.yearsInBusiness,
          brandColors: f.brandColors || saved.brandColors,
          voiceTone: f.voiceTone || saved.voiceTone,
          preferredStyle: initialData?.preferredStyle ?? saved.preferredStyle,
          contact: {
            ...f.contact,
            contactName: f.contact.contactName || saved.contactName || undefined,
            website: f.contact.website || saved.website,
            address: f.contact.address || saved.address,
            socialHandles: f.contact.socialHandles || saved.socialHandles,
          },
        }))
        setDefaultsApplied(true)
      })
      .catch(() => {
        // Silent: these are optional defaults. Failing to load them makes the
        // campaign slightly less tailored, never blocked.
      })
    return () => {
      cancelled = true
    }
    // initialData is set once when the form mounts and never mutated.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])


  function updateService(id: string, name: string) {
    setForm((f) => ({ ...f, services: f.services.map((s) => (s.id === id ? { ...s, name } : s)) }))
  }
  function addService() {
    setForm((f) => ({ ...f, services: [...f.services, { id: nextId(), name: "" }] }))
  }
  function removeService(id: string) {
    setForm((f) => ({
      ...f,
      services: f.services.length > 1 ? f.services.filter((s) => s.id !== id) : f.services,
    }))
  }

  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = "" // allow re-selecting the same file later
    if (!file) return

    if ((form.flyerPhotoUrls?.length ?? 0) >= MAX_FLYER_PHOTOS) {
      setPhotoUploadError(`You can upload up to ${MAX_FLYER_PHOTOS} photos.`)
      return
    }

    setUploadingPhoto(true)
    setPhotoUploadError("")
    const body = new FormData()
    body.append("file", file)

    try {
      const res = await fetch("/api/onboarding/upload-photo", { method: "POST", body })
      const data = await res.json().catch(() => ({}) as { url?: string; error?: string })
      if (!res.ok || !data.url) throw new Error(data.error ?? "Upload failed — please try again.")
      set("flyerPhotoUrls", [...(form.flyerPhotoUrls ?? []), data.url])
    } catch (err) {
      setPhotoUploadError(err instanceof Error ? err.message : "Upload failed — please try again.")
    } finally {
      setUploadingPhoto(false)
    }
  }

  function removePhoto(url: string) {
    set("flyerPhotoUrls", (form.flyerPhotoUrls ?? []).filter((u) => u !== url))
  }

  const isLast = step === STEPS.length - 1
  // Category is step 0 and required before advancing — every later step is
  // reachable only once it's set, so nothing past step 0 needs its own
  // guard (including Submit, which can't be reached without passing it).
  const canProceed = step !== 0 || form.businessCategory !== ""

  // Maps /api/intake's required-field names to the human label and the step
  // that field lives on, so a validation failure can say what's missing AND
  // send them to it. Previously the raw `missing` array was discarded and the
  // user got "Missing required fields" on the last step, with no indication
  // which of ~20 inputs across 6 steps was the problem.
  // Step numbers must track the STEPS array above — these were all on
  // different steps before the six-step form was collapsed to three.
  const FIELD_INFO: Record<string, { label: string; step: number }> = {
    businessCategory: { label: "Business type", step: 0 },
    businessName: { label: "Business name", step: 0 },
    industry: { label: "What you do", step: 0 },
    services: { label: "At least one service", step: 0 },
    targetAudience: { label: "Who you're trying to reach", step: 1 },
    email: { label: "Email", step: 2 },
  }

  async function handleSubmit() {
    setSubmitting(true)
    setError(null)
    trackEvent("campaign_creation_started", { method: "guided" })
    // Clean empty service rows before submitting. businessCategory is
    // guaranteed set here — canProceed blocks past step 0 until it is.
    const cleaned: IntakeSubmission = {
      ...form,
      businessCategory: form.businessCategory as BusinessCategory,
      services: form.services.filter((s) => s.name.trim()) as ServiceItem[],
    }

    let res: Response
    try {
      res = await fetch("/api/intake", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(cleaned),
      })
    } catch {
      setError("Couldn't reach the server — your answers are still here. Check your connection and press Submit again.")
      setSubmitting(false)
      return
    }

    if (res.ok) {
      trackEvent("campaign_created", { method: "guided" })
      router.push("/dashboard?onboarded=1")
      return
    }

    // Every branch below used to surface a raw machine code — a client at
    // their plan limit literally saw the string "limit_reached".
    const data = await res.json().catch(() => ({}) as Record<string, unknown>)
    const code = typeof data.error === "string" ? data.error : ""
    trackEvent("campaign_failed", { method: "guided", reason: code.slice(0, 40) || String(res.status) })

    if (Array.isArray(data.missing) && data.missing.length > 0) {
      const fields = (data.missing as string[]).map((f) => FIELD_INFO[f] ?? { label: f, step })
      const names = fields.map((f) => f.label).join(", ")
      // Jump back to the earliest step that's actually missing something.
      const target = Math.min(...fields.map((f) => f.step))
      setError(`Still needed before we can build your campaign: ${names}. We've taken you back to fill that in.`)
      setStep(target)
      setSubmitting(false)
      return
    }

    if (code === "limit_reached") {
      setError(
        typeof data.message === "string"
          ? data.message
          : "You've used all the campaigns included on your current plan. Upgrade at /#pricing to keep creating.",
      )
      setSubmitting(false)
      return
    }

    if (code === "needs_clarification") {
      // The agent tells us exactly what it couldn't work out — showing those
      // questions is far more actionable than the bare code.
      const questions = Array.isArray(data.clarifyingQuestions) ? (data.clarifyingQuestions as string[]) : []
      setError(
        questions.length > 0
          ? `We need a bit more detail before building this: ${questions.join(" ")} Add it to "What are you promoting?" on step 2 and submit again.`
          : "We couldn't quite tell what this campaign should promote. Add a bit more detail about your offer and submit again.",
      )
      setSubmitting(false)
      return
    }

    setError(
      typeof data.message === "string" && data.message
        ? data.message
        : "We couldn't build your campaign just now. Your answers are saved — please press Submit again in a moment.",
    )
    setSubmitting(false)
  }

  return (
    <div>
      <h1 className="text-2xl md:text-3xl tracking-tight">
        {isFirstCampaign ? "Let's create your first campaign" : "Create a new campaign"}
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {plan && isFirstCampaign ? (
          <>
            {/* Explicit {" "} — JSX trims the newline-led whitespace after the
                span, which rendered as "Free Trialplan." */}
            You&apos;re on the <span className="text-foreground font-medium">{plan.name}</span>{" "}
            plan. Three short steps — then we&apos;ll build it.
          </>
        ) : (
          "Three short steps — tell us about your business and what you're promoting, then we'll build it."
        )}
      </p>

      {prefillNotice && (
        <div className="mt-4 rounded-xl border border-[var(--brand-teal)]/40 bg-[var(--brand-teal-tint)] p-4 text-sm">
          {prefillNotice}
        </div>
      )}

      {/* Stepper */}
      <div className="mt-8 flex items-center gap-2">
        {STEPS.map((label, i) => (
          <div key={label} className="flex items-center gap-2 flex-1">
            <div
              className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold shrink-0 ${
                i <= step ? "bg-[var(--brand-teal-bright)] text-white" : "bg-[var(--surface-soft)] text-muted-foreground"
              }`}
            >
              {i + 1}
            </div>
            {i < STEPS.length - 1 && (
              <div className={`h-px flex-1 ${i < step ? "bg-[var(--brand-teal-bright)]" : "bg-[var(--surface-soft)]"}`} />
            )}
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs uppercase tracking-widest text-[var(--brand-teal-bright)]">
        Step {step + 1} of {STEPS.length} — {STEPS[step]}
      </p>

      <div className="mt-6 rounded-2xl border border-border bg-card p-6 md:p-8">
        {/* STEP 1 — Business: every field here is required by /api/intake. */}
        {step === 0 && (
          <div className="flex flex-col gap-5">
            <div>
              <Label>What type of business are you?</Label>
              <p className="text-sm text-muted-foreground">This helps us tailor the design and wording to your industry.</p>
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              {BUSINESS_CATEGORIES.map((category) => (
                <button
                  key={category}
                  type="button"
                  onClick={() => set("businessCategory", category)}
                  aria-pressed={form.businessCategory === category}
                  className={`text-left rounded-lg border px-4 py-3 text-sm font-medium transition-colors ${
                    form.businessCategory === category
                      ? "border-[var(--brand-teal-bright)] bg-[var(--brand-teal-tint)] text-[var(--brand-teal-bright)]"
                      : "border-border bg-[var(--surface-soft)] text-foreground/80 hover:border-[var(--brand-slate)]"
                  }`}
                >
                  {category}
                </button>
              ))}
            </div>

            <div className="border-t border-border pt-5">
              <Label htmlFor="businessName">Business name</Label>
              <input id="businessName" autoComplete="organization" className={fieldBase()} value={form.businessName}
                onChange={(e) => set("businessName", e.target.value)} placeholder="Bluegrass Roofing" />
            </div>
            <div>
              <Label htmlFor="industry">What do you do?</Label>
              <input id="industry" className={fieldBase()} value={form.industry}
                onChange={(e) => set("industry", e.target.value)} placeholder="Residential roofing" />
            </div>
            <div>
              <Label htmlFor="service-0">Main services</Label>
              <div className="flex flex-col gap-3">
                {form.services.map((s, i) => (
                  <div key={s.id} className="flex items-center gap-2">
                    <input id={i === 0 ? "service-0" : undefined} className={fieldBase()} value={s.name}
                      onChange={(e) => updateService(s.id, e.target.value)}
                      aria-label={`Service ${i + 1}`}
                      placeholder={i === 0 ? "Roof replacement" : "Another service"} />
                    <button type="button" onClick={() => removeService(s.id)}
                      disabled={form.services.length === 1}
                      className="shrink-0 w-10 h-10 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:border-[var(--brand-slate)] disabled:opacity-40 transition-colors"
                      aria-label={`Remove service ${i + 1}`}>
                      −
                    </button>
                  </div>
                ))}
              </div>
              <button type="button" onClick={addService}
                className="mt-3 self-start text-sm text-[var(--brand-teal-bright)] hover:text-[var(--brand-teal)] transition-colors">
                + Add another service
              </button>
            </div>
          </div>
        )}

        {/* STEP 2 — Promotion. flyerNotes isn't API-required, but it's what
            the campaign is actually FOR, so it leads here rather than sitting
            on a sixth step most people never reached. */}
        {step === 1 && (
          <div className="flex flex-col gap-5">
            <div>
              <Label htmlFor="flyerNotes">What are you promoting?</Label>
              <textarea id="flyerNotes" rows={3} className={fieldBase()} value={form.flyerNotes}
                onChange={(e) => set("flyerNotes", e.target.value)}
                placeholder="$500 off a new roof this month — free inspection, financing available" />
              <p className="mt-1.5 text-xs text-muted-foreground">
                Your offer in plain words. This becomes the headline on your flyer and the
                matching social, text, and Nextdoor versions.
              </p>
            </div>
            <div>
              <Label htmlFor="audience">Who are you trying to reach?</Label>
              <textarea id="audience" rows={3} className={fieldBase()} value={form.targetAudience}
                onChange={(e) => set("targetAudience", e.target.value)}
                placeholder="Homeowners in the area with roofs 15+ years old" />
            </div>

            {/* Format decides the physical canvas and how much text belongs
                on the piece, so it sits with the offer rather than in styling
                extras — picking "door hanger" after writing three paragraphs
                would be the wrong order. */}
            <div>
              <Label htmlFor="formatId">What are we making?</Label>
              <div className="mt-1.5 grid gap-2 sm:grid-cols-2">
                {FORMAT_IDS.map((id) => {
                  const f = OUTPUT_FORMATS[id]
                  const active = (form.formatId ?? DEFAULT_FORMAT) === id
                  return (
                    <div key={id} className="contents">
                      <button
                        type="button"
                        onClick={() => set("formatId", id)}
                        aria-pressed={active}
                        className={`rounded-lg border px-3.5 py-2.5 text-left transition-colors ${
                          active
                            ? "border-[var(--brand-teal-bright)] bg-[var(--brand-teal-tint)]"
                            : "border-border hover:border-[var(--brand-slate)]"
                        }`}
                      >
                        <span className="block text-sm font-medium">{f.label}</span>
                        <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">{f.chooseWhen}</span>
                      </button>

                      {/* Sits directly after Proposal, so it reads with the
                          other single-sheet printables rather than trailing
                          the list.

                          It is a LINK, not a format button: the questions
                          around it (trade, services, who you're targeting,
                          your offer) mean nothing for a drawing, and the
                          coloring agent takes a different input entirely —
                          subject, age band, theme, caption. Selecting it
                          leaves this form rather than pretending to be one of
                          its options. Available on every plan. */}
                      {id === "proposal" && (
                        <Link
                          href="/coloring-page"
                          className="rounded-lg border border-border px-3.5 py-2.5 text-left transition-colors hover:border-[var(--brand-slate)]"
                        >
                          <span className="block text-sm font-medium">Coloring page</span>
                          <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">
                            Printable line art. Asks different questions — we&apos;ll take you there.
                          </span>
                        </Link>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Asked here rather than buried in the optional extras: it changes
                what gets printed on the flyer, so it belongs with the offer.
                Defaults to on — it was always-on before this question existed. */}
            <div>
              <Label htmlFor="wantsQrCode">Add a QR code to your flyer?</Label>
              <label htmlFor="wantsQrCode" className="mt-1.5 flex items-start gap-2.5 text-sm cursor-pointer">
                <input id="wantsQrCode" type="checkbox"
                  checked={(form.wantsQrCode ?? true) && realPlanId !== "trial"}
                  disabled={realPlanId === "trial"}
                  onChange={(e) => set("wantsQrCode", e.target.checked)}
                  className="mt-0.5 w-4 h-4 shrink-0 accent-[var(--brand-teal-bright)] disabled:opacity-50" />
                <span>Print a scannable QR code on the flyer</span>
              </label>
              <p className="mt-1.5 text-xs text-muted-foreground">
                {realPlanId === "trial" ? (
                  <>
                    <Link href="/#pricing" className="text-[var(--brand-teal-bright)] hover:text-[var(--brand-teal)] transition-colors">Upgrade to Basic</Link>
                    {" "}to add scannable QR codes and see how many people scan them.
                  </>
                ) : (
                  <>Scanning it opens your offer, and you&apos;ll see the scan count on your dashboard.</>
                )}
              </p>
            </div>
          </div>
        )}

        {/* STEP 3 — Contact. Phone is here because it's printed on the flyer
            as the call-to-action. The per-campaign extras below are collapsed
            so they cost nothing to skip. */}
        {step === 2 && (
          <div className="flex flex-col gap-5">
            <div>
              <Label htmlFor="phone">Phone number</Label>
              <input id="phone" type="tel" inputMode="tel" autoComplete="tel" className={fieldBase()} value={form.contact.phone}
                onChange={(e) => setContact("phone", e.target.value)} placeholder="(555) 123-4567" />
              <p className="mt-1.5 text-xs text-muted-foreground">Printed on your flyer as the call-to-action.</p>
            </div>
            <div>
              <Label htmlFor="email">Email</Label>
              <input id="email" type="email" readOnly value={form.contact.email}
                className={`${fieldBase()} opacity-70 cursor-not-allowed`} />
              <p className="mt-1.5 text-xs text-muted-foreground">The email you signed in with — your campaigns are saved under it.</p>
            </div>

            {defaultsApplied && (
              <p className="rounded-lg border border-[var(--brand-teal)]/30 bg-[var(--brand-teal-tint)] px-3.5 py-2.5 text-xs">
                Your saved brand details are being applied to this campaign.{" "}
                <Link href="/profile" className="underline">Edit them</Link>
              </p>
            )}

            <details className="rounded-lg border border-border bg-[var(--surface-soft)]">
              <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-foreground/80 hover:text-foreground">
                Add photos or reference material (optional)
              </summary>
              <div className="flex flex-col gap-5 border-t border-border px-4 py-5">
                <div>
                  <Label htmlFor="flyerPhotos">Your own photos (up to {MAX_FLYER_PHOTOS})</Label>
                  <input id="flyerPhotos" type="file" accept="image/*"
                    onChange={handlePhotoUpload}
                    disabled={uploadingPhoto || (form.flyerPhotoUrls?.length ?? 0) >= MAX_FLYER_PHOTOS}
                    className="block w-full text-sm text-muted-foreground file:mr-4 file:rounded-lg file:border-0 file:bg-[var(--brand-teal-tint)] file:px-4 file:py-2 file:text-sm file:font-medium file:text-[var(--brand-teal-bright)] hover:file:bg-[var(--brand-teal)]/20 disabled:opacity-60" />
                  <p className="mt-1.5 text-xs text-muted-foreground">A real photo of your own work beats a generic one.</p>
                  {uploadingPhoto && <p className="mt-1.5 text-xs text-muted-foreground">Uploading…</p>}
                  {photoUploadError && <p role="alert" className="mt-1.5 text-xs text-red-400">{photoUploadError}</p>}
                  {(form.flyerPhotoUrls?.length ?? 0) > 0 && (
                    <div className="mt-3 flex flex-wrap gap-3">
                      {form.flyerPhotoUrls!.map((url) => (
                        <div key={url} className="relative w-20 h-20 rounded-lg overflow-hidden border border-border">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={url} alt="Uploaded flyer photo" className="w-full h-full object-cover" />
                          <button type="button" onClick={() => removePhoto(url)}
                            className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/60 text-white text-xs leading-none flex items-center justify-center hover:bg-black/80"
                            aria-label="Remove photo">
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {(form.flyerPhotoUrls?.length ?? 0) === 0 && (
                  <div>
                    <label className="flex items-center gap-2.5 text-sm cursor-pointer">
                      <input type="checkbox" checked={form.wantsAiPhotos ?? false}
                        disabled={realPlanId !== "pro"}
                        onChange={(e) => set("wantsAiPhotos", e.target.checked)}
                        className="w-4 h-4 accent-[var(--brand-teal-bright)] disabled:opacity-50" />
                      Let AI generate photos for flyers that don&apos;t have one of your own
                    </label>
                    {realPlanId !== null && realPlanId !== "pro" && (
                      <p className="mt-1.5 text-xs text-muted-foreground">
                        <Link href="/#pricing" className="text-[var(--brand-teal-bright)] hover:text-[var(--brand-teal)] transition-colors">Upgrade to Pro</Link> to unlock AI-generated photos.
                      </p>
                    )}
                  </div>
                )}

                <div>
                  <Label htmlFor="logo">Logo</Label>
                  <input id="logo" type="file" accept="image/*"
                    onChange={(e) => set("logoFileName", e.target.files?.[0]?.name)}
                    className="block w-full text-sm text-muted-foreground file:mr-4 file:rounded-lg file:border-0 file:bg-[var(--brand-teal-tint)] file:px-4 file:py-2 file:text-sm file:font-medium file:text-[var(--brand-teal-bright)] hover:file:bg-[var(--brand-teal)]/20" />
                  {form.logoFileName && <p className="mt-1.5 text-xs text-muted-foreground">Selected: {form.logoFileName}</p>}
                </div>

                <div>
                  <Label htmlFor="existing">Existing marketing materials to reference</Label>
                  <input id="existing" type="file"
                    onChange={(e) => set("existingMaterialsFileName", e.target.files?.[0]?.name)}
                    className="block w-full text-sm text-muted-foreground file:mr-4 file:rounded-lg file:border-0 file:bg-[var(--brand-teal-tint)] file:px-4 file:py-2 file:text-sm file:font-medium file:text-[var(--brand-teal-bright)] hover:file:bg-[var(--brand-teal)]/20" />
                  {form.existingMaterialsFileName && (
                    <p className="mt-1.5 text-xs text-muted-foreground">Selected: {form.existingMaterialsFileName}</p>
                  )}
                </div>

                <div>
                  <Label htmlFor="sitePrefs">Website / landing page preferences</Label>
                  <textarea id="sitePrefs" rows={2} className={fieldBase()} value={form.websitePreferences}
                    onChange={(e) => set("websitePreferences", e.target.value)}
                    placeholder="Pages needed, must-have sections, examples you like…" />
                </div>
              </div>
            </details>
          </div>
        )}

        {error && <p className="mt-5 text-sm text-red-400">{error}</p>}

        {/* Nav buttons */}
        <div className="mt-8 flex items-center justify-between">
          <button
            type="button"
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={step === 0}
            className="px-5 py-2.5 rounded-lg border border-border text-sm text-foreground/80 hover:bg-[var(--surface-sunken)] disabled:opacity-40 transition-colors"
          >
            Back
          </button>
          {isLast ? (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting}
              className="px-6 py-2.5 rounded-lg bg-[var(--brand-teal-bright)] text-white text-sm font-semibold hover:bg-[var(--brand-teal)] disabled:opacity-60 transition-colors"
            >
              {submitting ? "Submitting…" : "Submit & go to dashboard"}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))}
              disabled={!canProceed}
              className="px-6 py-2.5 rounded-lg bg-[var(--brand-teal-bright)] text-white text-sm font-semibold hover:bg-[var(--brand-teal)] disabled:opacity-40 transition-colors"
            >
              Continue
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
