"use client"

import { useState, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import type { BrandStyle, BusinessCategory, IntakeSubmission, PlanId, ServiceItem } from "@/lib/types"
import { BUSINESS_CATEGORIES } from "@/lib/types"
import { getPlan } from "@/lib/plans"
import { trackEvent } from "@/lib/analytics"

const STEPS = ["Category", "Business", "Services", "Brand", "Contact", "Deliverables"] as const

const STYLE_OPTIONS: BrandStyle[] = ["modern", "classic", "playful", "minimal"]
const MAX_FLYER_PHOTOS = 5

// The rest of IntakeSubmission's required fields start empty too (e.g.
// businessName: ""), but those are plain strings — an empty string isn't a
// valid BusinessCategory, so the form's own local state widens just this
// one field to allow "unselected" while it's being filled out. Narrowed
// back to a real BusinessCategory before it's ever sent to /api/intake —
// see canProceed below, which blocks past step 0 until it's set.
type OnboardingFormState = Omit<IntakeSubmission, "businessCategory"> & { businessCategory: BusinessCategory | "" }

function fieldBase() {
  return "w-full rounded-lg bg-white/[0.04] border border-white/12 px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-[var(--brand-teal-bright)] focus:ring-1 focus:ring-[var(--brand-teal-bright)] transition-colors"
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
  useEffect(() => {
    fetch("/api/deliverables")
      .then((r) => r.json())
      .then((d) => setRealPlanId(d.planId ?? null))
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
    flyerNotes: initialData?.flyerNotes ?? "",
    websitePreferences: "",
  })

  function set<K extends keyof OnboardingFormState>(key: K, value: OnboardingFormState[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }
  function setContact<K extends keyof IntakeSubmission["contact"]>(key: K, value: string) {
    setForm((f) => ({ ...f, contact: { ...f.contact, [key]: value } }))
  }

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
  const FIELD_INFO: Record<string, { label: string; step: number }> = {
    businessCategory: { label: "Business category", step: 0 },
    businessName: { label: "Business name", step: 1 },
    industry: { label: "Industry", step: 1 },
    services: { label: "At least one service", step: 2 },
    targetAudience: { label: "Target audience", step: 4 },
    email: { label: "Email", step: 4 },
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
          ? `We need a bit more detail before building this: ${questions.join(" ")} Add that to the "What should your flyers cover?" box and submit again.`
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
      <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">Let&apos;s set up your account</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {plan ? (
          <>
            You&apos;re on the <span className="text-foreground font-medium">{plan.name}</span> plan.
            Tell us about your business so we can start your build.
          </>
        ) : (
          "Tell us about your business so we can start your build."
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
                i <= step ? "bg-[var(--brand-teal-bright)] text-white" : "bg-white/[0.06] text-muted-foreground"
              }`}
            >
              {i + 1}
            </div>
            {i < STEPS.length - 1 && (
              <div className={`h-px flex-1 ${i < step ? "bg-[var(--brand-teal-bright)]" : "bg-white/10"}`} />
            )}
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs uppercase tracking-widest text-[var(--brand-teal-bright)]">
        Step {step + 1} of {STEPS.length} — {STEPS[step]}
      </p>

      <div className="mt-6 rounded-2xl border border-white/10 bg-card p-6 md:p-8">
        {/* STEP 1 — Category */}
        {step === 0 && (
          <div className="flex flex-col gap-4">
            <div>
              <Label>What type of business are you?</Label>
              <p className="text-sm text-muted-foreground">This helps us tailor templates and features to your business.</p>
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
                      : "border-white/12 bg-white/[0.04] text-foreground/80 hover:border-white/25"
                  }`}
                >
                  {category}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* STEP 2 — Business */}
        {step === 1 && (
          <div className="flex flex-col gap-5">
            <div>
              <Label htmlFor="businessName">Business name</Label>
              <input id="businessName" autoComplete="organization" className={fieldBase()} value={form.businessName}
                onChange={(e) => set("businessName", e.target.value)} placeholder="Bright Smile Dental" />
            </div>
            <div>
              <Label htmlFor="industry">Industry / category</Label>
              <input id="industry" className={fieldBase()} value={form.industry}
                onChange={(e) => set("industry", e.target.value)} placeholder="Dental practice" />
            </div>
            <div>
              <Label htmlFor="years">Years in business</Label>
              <input id="years" type="number" inputMode="numeric" min={0} max={200} className={fieldBase()} value={form.yearsInBusiness}
                onChange={(e) => set("yearsInBusiness", e.target.value)} placeholder="e.g. 7" />
            </div>
          </div>
        )}

        {/* STEP 3 — Services */}
        {step === 2 && (
          <div className="flex flex-col gap-4">
            <Label>Services offered</Label>
            <div className="flex flex-col gap-3">
              {form.services.map((s) => (
                <div key={s.id} className="flex items-center gap-2">
                  <input className={fieldBase()} value={s.name}
                    onChange={(e) => updateService(s.id, e.target.value)} placeholder="e.g. Teeth whitening" />
                  <button type="button" onClick={() => removeService(s.id)}
                    disabled={form.services.length === 1}
                    className="shrink-0 w-10 h-10 rounded-lg border border-white/12 text-muted-foreground hover:text-foreground hover:border-white/25 disabled:opacity-40 transition-colors"
                    aria-label="Remove service">
                    −
                  </button>
                </div>
              ))}
            </div>
            <button type="button" onClick={addService}
              className="self-start text-sm text-[var(--brand-teal-bright)] hover:text-[var(--brand-teal)] transition-colors">
              + Add another service
            </button>
          </div>
        )}

        {/* STEP 4 — Brand */}
        {step === 3 && (
          <div className="flex flex-col gap-5">
            <div>
              <Label htmlFor="logo">Logo upload</Label>
              <input id="logo" type="file" accept="image/*"
                onChange={(e) => set("logoFileName", e.target.files?.[0]?.name)}
                className="block w-full text-sm text-muted-foreground file:mr-4 file:rounded-lg file:border-0 file:bg-[var(--brand-teal-tint)] file:px-4 file:py-2 file:text-sm file:font-medium file:text-[var(--brand-teal-bright)] hover:file:bg-[var(--brand-teal)]/20" />
              {form.logoFileName && <p className="mt-1.5 text-xs text-muted-foreground">Selected: {form.logoFileName}</p>}
            </div>
            <div>
              <Label htmlFor="colors">Existing brand colors (optional)</Label>
              <input id="colors" className={fieldBase()} value={form.brandColors}
                onChange={(e) => set("brandColors", e.target.value)} placeholder="e.g. #0E7C7B, navy, gold" />
            </div>
            <div>
              <Label htmlFor="style">Preferred style</Label>
              <select id="style" className={fieldBase()} value={form.preferredStyle}
                onChange={(e) => set("preferredStyle", e.target.value as BrandStyle)}>
                {STYLE_OPTIONS.map((o) => (
                  <option key={o} value={o} className="bg-card capitalize">
                    {o.charAt(0).toUpperCase() + o.slice(1)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="voice">Voice / tone</Label>
              <input id="voice" className={fieldBase()} value={form.voiceTone}
                onChange={(e) => set("voiceTone", e.target.value)} placeholder="e.g. friendly, professional, high-energy" />
            </div>
          </div>
        )}

        {/* STEP 5 — Contact + audience */}
        {step === 4 && (
          <div className="flex flex-col gap-5">
            <div>
              <Label htmlFor="audience">Target audience / ideal customer</Label>
              <textarea id="audience" rows={3} className={fieldBase()} value={form.targetAudience}
                onChange={(e) => set("targetAudience", e.target.value)}
                placeholder="Describe who you want to reach…" />
            </div>
            <p className="text-sm font-medium">Contact info to display on materials</p>
            <div className="grid sm:grid-cols-2 gap-4">
              {prefillNotice && (
                <div className="sm:col-span-2">
                  <Label htmlFor="contactName">Contact person</Label>
                  <input id="contactName" className={fieldBase()} value={form.contact.contactName ?? ""}
                    onChange={(e) => setContact("contactName", e.target.value)} placeholder="Who should we reach out to?" />
                </div>
              )}
              <div className="sm:col-span-2">
                <Label htmlFor="email">Email</Label>
                <input id="email" type="email" readOnly value={form.contact.email}
                  className={`${fieldBase()} opacity-70 cursor-not-allowed`} />
                <p className="mt-1.5 text-xs text-muted-foreground">This is the email you signed in with — it's what your flyers will be saved under.</p>
              </div>
              <div>
                <Label htmlFor="phone">Phone</Label>
                <input id="phone" type="tel" inputMode="tel" autoComplete="tel" className={fieldBase()} value={form.contact.phone}
                  onChange={(e) => setContact("phone", e.target.value)} placeholder="(555) 123-4567" />
              </div>
              <div>
                <Label htmlFor="website">Website</Label>
                <input id="website" type="url" inputMode="url" autoComplete="url" className={fieldBase()} value={form.contact.website}
                  onChange={(e) => setContact("website", e.target.value)} placeholder="brightsmile.com" />
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="address">Address</Label>
                <input id="address" autoComplete="street-address" className={fieldBase()} value={form.contact.address}
                  onChange={(e) => setContact("address", e.target.value)} placeholder="123 Main St, Springfield" />
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="social">Social handles</Label>
                <input id="social" className={fieldBase()} value={form.contact.socialHandles}
                  onChange={(e) => setContact("socialHandles", e.target.value)} placeholder="@brightsmiledental" />
              </div>
            </div>
          </div>
        )}

        {/* STEP 6 — Deliverables */}
        {step === 5 && (
          <div className="flex flex-col gap-5">
            <div>
              <Label htmlFor="flyerPhotos">Photos for your flyers (optional, up to {MAX_FLYER_PHOTOS})</Label>
              <input id="flyerPhotos" type="file" accept="image/*"
                onChange={handlePhotoUpload}
                disabled={uploadingPhoto || (form.flyerPhotoUrls?.length ?? 0) >= MAX_FLYER_PHOTOS}
                className="block w-full text-sm text-muted-foreground file:mr-4 file:rounded-lg file:border-0 file:bg-[var(--brand-teal-tint)] file:px-4 file:py-2 file:text-sm file:font-medium file:text-[var(--brand-teal-bright)] hover:file:bg-[var(--brand-teal)]/20 disabled:opacity-60" />
              <p className="mt-1.5 text-xs text-muted-foreground">A real photo of your own beats a generic one — we&apos;ll use these directly in your flyers where they fit.</p>
              {uploadingPhoto && <p className="mt-1.5 text-xs text-muted-foreground">Uploading…</p>}
              {photoUploadError && <p role="alert" className="mt-1.5 text-xs text-red-400">{photoUploadError}</p>}
              {(form.flyerPhotoUrls?.length ?? 0) > 0 && (
                <div className="mt-3 flex flex-wrap gap-3">
                  {form.flyerPhotoUrls!.map((url) => (
                    <div key={url} className="relative w-20 h-20 rounded-lg overflow-hidden border border-white/10">
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
                    <a href="/#pricing" className="text-[var(--brand-teal-bright)] hover:text-[var(--brand-teal)] transition-colors">Upgrade to Pro</a> to unlock AI-generated photos.
                  </p>
                )}
              </div>
            )}

            <div>
              <Label htmlFor="existing">Existing marketing materials to reference (optional)</Label>
              <input id="existing" type="file"
                onChange={(e) => set("existingMaterialsFileName", e.target.files?.[0]?.name)}
                className="block w-full text-sm text-muted-foreground file:mr-4 file:rounded-lg file:border-0 file:bg-[var(--brand-teal-tint)] file:px-4 file:py-2 file:text-sm file:font-medium file:text-[var(--brand-teal-bright)] hover:file:bg-[var(--brand-teal)]/20" />
              {form.existingMaterialsFileName && (
                <p className="mt-1.5 text-xs text-muted-foreground">Selected: {form.existingMaterialsFileName}</p>
              )}
            </div>
            <div>
              <Label htmlFor="flyerNotes">Flyer & collateral notes</Label>
              <textarea id="flyerNotes" rows={3} className={fieldBase()} value={form.flyerNotes}
                onChange={(e) => set("flyerNotes", e.target.value)}
                placeholder="What should your flyers, sheets & one-pagers cover? e.g. front desk sheet, new patient packet, referral card" />
            </div>
            <div>
              <Label htmlFor="sitePrefs">Website / landing page preferences</Label>
              <textarea id="sitePrefs" rows={3} className={fieldBase()} value={form.websitePreferences}
                onChange={(e) => set("websitePreferences", e.target.value)}
                placeholder="Pages needed, must-have sections, examples you like…" />
            </div>
          </div>
        )}

        {error && <p className="mt-5 text-sm text-red-400">{error}</p>}

        {/* Nav buttons */}
        <div className="mt-8 flex items-center justify-between">
          <button
            type="button"
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={step === 0}
            className="px-5 py-2.5 rounded-lg border border-white/12 text-sm text-foreground/80 hover:bg-white/[0.05] disabled:opacity-40 transition-colors"
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
