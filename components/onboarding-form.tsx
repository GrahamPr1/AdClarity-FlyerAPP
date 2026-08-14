"use client"

import { useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import type { BrandStyle, IntakeSubmission, PlanId, ServiceItem } from "@/lib/types"
import { getPlan } from "@/lib/plans"

const STEPS = ["Business", "Services", "Brand", "Contact", "Deliverables"] as const

const STYLE_OPTIONS: BrandStyle[] = ["modern", "classic", "playful", "minimal"]

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

export function OnboardingForm({ email }: { email: string }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const planId = (searchParams.get("plan") as PlanId | null) ?? null
  const plan = getPlan(planId)

  const [step, setStep] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // contact.email is fixed to the authenticated session's email — signing
  // in now happens BEFORE onboarding (see app/onboarding/page.tsx), so
  // this is never a free-text field someone could type any address into.
  const [form, setForm] = useState<IntakeSubmission>({
    planId,
    businessName: "",
    industry: "",
    yearsInBusiness: "",
    services: [{ id: nextId(), name: "" }],
    logoFileName: undefined,
    brandColors: "",
    preferredStyle: "modern",
    voiceTone: "",
    targetAudience: "",
    contact: { email, phone: "", address: "", website: "", socialHandles: "" },
    existingMaterialsFileName: undefined,
    flyerNotes: "",
    websitePreferences: "",
  })

  function set<K extends keyof IntakeSubmission>(key: K, value: IntakeSubmission[K]) {
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

  const isLast = step === STEPS.length - 1

  async function handleSubmit() {
    setSubmitting(true)
    setError(null)
    // Clean empty service rows before submitting.
    const cleaned: IntakeSubmission = {
      ...form,
      services: form.services.filter((s) => s.name.trim()) as ServiceItem[],
    }
    try {
      const res = await fetch("/api/intake", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(cleaned),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? "Something went wrong")
      }
      router.push("/dashboard?onboarded=1")
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong")
      setSubmitting(false)
    }
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
        {/* STEP 1 — Business */}
        {step === 0 && (
          <div className="flex flex-col gap-5">
            <div>
              <Label htmlFor="businessName">Business name</Label>
              <input id="businessName" className={fieldBase()} value={form.businessName}
                onChange={(e) => set("businessName", e.target.value)} placeholder="Bright Smile Dental" />
            </div>
            <div>
              <Label htmlFor="industry">Industry / category</Label>
              <input id="industry" className={fieldBase()} value={form.industry}
                onChange={(e) => set("industry", e.target.value)} placeholder="Dental practice" />
            </div>
            <div>
              <Label htmlFor="years">Years in business</Label>
              <input id="years" className={fieldBase()} value={form.yearsInBusiness}
                onChange={(e) => set("yearsInBusiness", e.target.value)} placeholder="e.g. 7" />
            </div>
          </div>
        )}

        {/* STEP 2 — Services */}
        {step === 1 && (
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

        {/* STEP 3 — Brand */}
        {step === 2 && (
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

        {/* STEP 4 — Contact + audience */}
        {step === 3 && (
          <div className="flex flex-col gap-5">
            <div>
              <Label htmlFor="audience">Target audience / ideal customer</Label>
              <textarea id="audience" rows={3} className={fieldBase()} value={form.targetAudience}
                onChange={(e) => set("targetAudience", e.target.value)}
                placeholder="Describe who you want to reach…" />
            </div>
            <p className="text-sm font-medium">Contact info to display on materials</p>
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <Label htmlFor="email">Email</Label>
                <input id="email" type="email" readOnly value={form.contact.email}
                  className={`${fieldBase()} opacity-70 cursor-not-allowed`} />
                <p className="mt-1.5 text-xs text-muted-foreground">This is the email you signed in with — it's what your flyers will be saved under.</p>
              </div>
              <div>
                <Label htmlFor="phone">Phone</Label>
                <input id="phone" className={fieldBase()} value={form.contact.phone}
                  onChange={(e) => setContact("phone", e.target.value)} placeholder="(555) 123-4567" />
              </div>
              <div>
                <Label htmlFor="website">Website</Label>
                <input id="website" className={fieldBase()} value={form.contact.website}
                  onChange={(e) => setContact("website", e.target.value)} placeholder="brightsmile.com" />
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="address">Address</Label>
                <input id="address" className={fieldBase()} value={form.contact.address}
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

        {/* STEP 5 — Deliverables */}
        {step === 4 && (
          <div className="flex flex-col gap-5">
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
              className="px-6 py-2.5 rounded-lg bg-[var(--brand-teal-bright)] text-white text-sm font-semibold hover:bg-[var(--brand-teal)] transition-colors"
            >
              Continue
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
