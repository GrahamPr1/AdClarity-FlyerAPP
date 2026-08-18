"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import type { BrandStyle, CampaignDefaults } from "@/lib/types"
import { LoadingSpinner } from "./loading-spinner"

// The optional half of onboarding, moved out of the first-campaign path.
//
// These fields used to be steps 4 and 6 of the six-step onboarding form,
// where they sat between a brand-new signup and their first flyer despite
// none of them being required to generate one. Collected here instead —
// after the first campaign exists — and applied automatically to every
// campaign created afterwards.
//
// Nothing here is required. Saving an empty form is valid.

const STYLE_OPTIONS: BrandStyle[] = ["modern", "classic", "playful", "minimal"]

function fieldBase() {
  return "w-full rounded-lg bg-white/[0.04] border border-white/12 px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-[var(--brand-teal-bright)] focus:ring-1 focus:ring-[var(--brand-teal-bright)] transition-colors"
}

function Label({ children, htmlFor }: { children: React.ReactNode; htmlFor: string }) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-medium">
      {children}
    </label>
  )
}

type FormState = Omit<CampaignDefaults, "savedAt">

const EMPTY: FormState = {
  yearsInBusiness: "",
  brandColors: "",
  preferredStyle: "modern",
  voiceTone: "",
  contactName: "",
  website: "",
  address: "",
  socialHandles: "",
}

export function CampaignDefaultsForm() {
  const router = useRouter()
  const [form, setForm] = useState<FormState>(EMPTY)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [savedAt, setSavedAt] = useState<string | null>(null)
  const [justSaved, setJustSaved] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch("/api/campaign-defaults")
      .then((r) => r.json())
      .then((d: { defaults?: CampaignDefaults | null }) => {
        if (cancelled) return
        if (d.defaults) {
          const { savedAt: at, ...rest } = d.defaults
          setForm({ ...EMPTY, ...rest })
          setSavedAt(at)
        }
        setLoading(false)
      })
      .catch(() => {
        if (cancelled) return
        // Non-fatal: an empty form is a valid starting point, so a failed
        // load shouldn't block someone from filling it in.
        setError("We couldn't load your saved details — you can still fill them in and save.")
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }))
    setJustSaved(false)
  }

  async function handleSave() {
    setSaving(true)
    setError("")
    let res: Response
    try {
      res = await fetch("/api/campaign-defaults", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      })
    } catch {
      setError("Couldn't reach the server — your answers are still here. Check your connection and press Save again.")
      setSaving(false)
      return
    }
    if (!res.ok) {
      const data = await res.json().catch(() => ({}) as { error?: string })
      setError(data.error ?? "We couldn't save these just now — please press Save again in a moment.")
      setSaving(false)
      return
    }
    const data = await res.json().catch(() => ({}) as { defaults?: CampaignDefaults })
    setSavedAt(data.defaults?.savedAt ?? new Date().toISOString())
    setSaving(false)
    setJustSaved(true)
  }

  if (loading) return <LoadingSpinner message="Loading your details…" />

  return (
    <div>
      <div className="rounded-2xl border border-white/10 bg-card p-6 md:p-8">
        <div className="flex flex-col gap-5">
          <div>
            <Label htmlFor="years">Years in business</Label>
            <input id="years" type="number" inputMode="numeric" min={0} max={200} className={fieldBase()}
              value={form.yearsInBusiness} onChange={(e) => set("yearsInBusiness", e.target.value)} placeholder="e.g. 7" />
          </div>
          <div>
            <Label htmlFor="colors">Brand colors</Label>
            <input id="colors" className={fieldBase()} value={form.brandColors}
              onChange={(e) => set("brandColors", e.target.value)} placeholder="e.g. #0E7C7B, navy, gold" />
            <p className="mt-1.5 text-xs text-muted-foreground">
              Leave blank and we&apos;ll pick a palette that suits your industry.
            </p>
          </div>
          <div>
            <Label htmlFor="style">Preferred style</Label>
            <select id="style" className={fieldBase()} value={form.preferredStyle}
              onChange={(e) => set("preferredStyle", e.target.value as BrandStyle)}>
              {STYLE_OPTIONS.map((o) => (
                <option key={o} value={o} className="bg-card">
                  {o.charAt(0).toUpperCase() + o.slice(1)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="voice">Voice / tone</Label>
            <input id="voice" className={fieldBase()} value={form.voiceTone}
              onChange={(e) => set("voiceTone", e.target.value)} placeholder="e.g. friendly, professional, no-nonsense" />
          </div>

          <div className="border-t border-white/[0.07] pt-5">
            <p className="text-sm font-medium">Contact details printed on your materials</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Your phone number is asked for on every campaign. These extras are added when you provide them.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label htmlFor="contactName">Contact person</Label>
              <input id="contactName" autoComplete="name" className={fieldBase()} value={form.contactName}
                onChange={(e) => set("contactName", e.target.value)} placeholder="Jane Smith" />
            </div>
            <div>
              <Label htmlFor="website">Website</Label>
              <input id="website" type="url" inputMode="url" autoComplete="url" className={fieldBase()}
                value={form.website} onChange={(e) => set("website", e.target.value)} placeholder="brightsmile.com" />
            </div>
            <div>
              <Label htmlFor="social">Social handles</Label>
              <input id="social" className={fieldBase()} value={form.socialHandles}
                onChange={(e) => set("socialHandles", e.target.value)} placeholder="@brightsmiledental" />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="address">Address</Label>
              <input id="address" autoComplete="street-address" className={fieldBase()} value={form.address}
                onChange={(e) => set("address", e.target.value)} placeholder="123 Main St, Springfield" />
            </div>
          </div>
        </div>

        {error && <p role="alert" className="mt-5 text-sm text-red-400">{error}</p>}
        {justSaved && (
          <p className="mt-5 text-sm text-[var(--brand-teal-bright)]">
            Saved. Your next campaign will use these automatically.
          </p>
        )}

        <div className="mt-7 flex flex-wrap items-center gap-3">
          <button type="button" onClick={handleSave} disabled={saving}
            className="rounded-lg bg-[var(--brand-teal-bright)] px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[var(--brand-teal)] disabled:opacity-60">
            {saving ? "Saving…" : "Save details"}
          </button>
          <button type="button" onClick={() => router.push("/dashboard")}
            className="rounded-lg border border-white/12 px-5 py-2.5 text-sm text-foreground/80 transition-colors hover:bg-white/[0.05]">
            Back to dashboard
          </button>
          {savedAt && !justSaved && (
            <span className="text-xs text-muted-foreground">
              Last saved {new Date(savedAt).toLocaleDateString()}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
