"use client"

import { useState } from "react"
import useSWR from "swr"
import { fetcher } from "@/lib/swr-fetcher"
import { normalizeWebsiteUrl } from "@/lib/url-normalize"
import type { BusinessProfile } from "@/lib/business-profile"

/**
 * Edits the CANONICAL business profile (client:<email>:profile).
 *
 * Lives on /profile because that page is already "Your brand details" — a
 * second standalone page for the same subject would be the duplicate surface
 * the brief warns against.
 *
 * NOTE ON THE OVERLAP, which is real and not resolved here: the
 * CampaignDefaultsForm below this on the same page still writes the LEGACY
 * campaignDefaults record, and a few of its fields (website, address, tone)
 * describe the same facts as this form. Phase 2's storage decision made the
 * legacy stores read-only FALLBACKS for reads, but that form is still a live
 * writer. Consolidating the two editors is a deliberate follow-up, not
 * something to do silently in a bug fix — see the Phase 2 report.
 */
export function BusinessProfileForm() {
  const { data, isLoading, mutate } = useSWR<{
    profile: BusinessProfile | null
    completeness: { score: number; missing: string[] } | null
  }>("/api/profile", fetcher)

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading your business details…</p>

  /**
   * Remounted whenever the underlying record changes, via the key.
   *
   * The alternative — seeding form state from SWR inside an effect — is what
   * this project's react-hooks/set-state-in-effect rule exists to stop, and
   * it is the wrong shape anyway: a refetch mid-edit would silently overwrite
   * what the client was typing. Keying on savedAt means a genuinely NEW
   * record (a re-scan in another tab) reseeds the fields, while a refetch of
   * the same record leaves an in-progress edit alone.
   */
  return (
    <Editor
      key={data?.profile?.savedAt ?? "empty"}
      profile={data?.profile ?? null}
      completeness={data?.completeness ?? null}
      onSaved={mutate}
    />
  )
}

function Editor({
  profile,
  completeness,
  onSaved,
}: {
  profile: BusinessProfile | null
  completeness: { score: number; missing: string[] } | null
  onSaved: () => void
}) {
  // Lazy initialiser: runs once per mount, which is exactly the seeding
  // moment now that the key controls when a mount happens.
  const [form, setForm] = useState(() => ({
    businessName: profile?.businessName ?? "",
    website: profile?.website ?? "",
    description: profile?.description ?? "",
    industry: profile?.industry ?? "",
    phone: profile?.contact.phone ?? "",
    email: profile?.contact.email ?? "",
    address: profile?.contact.address ?? "",
    services: profile?.services.join(", ") ?? "",
  }))
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const websiteCheck = form.website.trim() ? normalizeWebsiteUrl(form.website) : null
  const websiteInvalid = websiteCheck !== null && !websiteCheck.ok

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (websiteInvalid) return
    setSaving(true); setError(null); setSaved(false)
    try {
      const res = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessName: form.businessName,
          website: form.website,
          description: form.description,
          industry: form.industry,
          services: form.services.split(",").map((s) => s.trim()).filter(Boolean),
          contact: { phone: form.phone, email: form.email, address: form.address },
        }),
      })
      const body = await res.json().catch(() => null)
      if (!res.ok) { setError(body?.error ?? "Couldn't save — please try again."); return }
      onSaved()
      setSaved(true)
    } catch {
      setError("We couldn't reach the server. Check your connection and try again.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={save} className="rounded-2xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg">Business details</h2>
        {completeness && (
          <span className="text-xs text-muted-foreground">
            {Math.round(completeness.score * 100)}% complete
          </span>
        )}
      </div>
      <p className="mt-1.5 text-sm text-muted-foreground">
        Used on every campaign, so you never re-type it.
        {profile?.source === "website_scan" && " Read from your website — correct anything that's wrong."}
      </p>

      {!profile && (
        <p className="mt-4 rounded-xl border border-border bg-[var(--surface-soft)] p-3 text-sm text-muted-foreground">
          Nothing saved yet. Fill this in, or scan your website from{" "}
          <a href="/onboarding" className="text-[var(--brand-teal-bright)] hover:underline">Create a campaign</a>.
        </p>
      )}

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <Field id="bp-name" label="Business name" value={form.businessName} onChange={(v) => setForm({ ...form, businessName: v })} />
        <Field
          id="bp-website" label="Website" value={form.website} placeholder="yourbusiness.com"
          onChange={(v) => setForm({ ...form, website: v })}
          error={websiteInvalid && websiteCheck && !websiteCheck.ok ? websiteCheck.message : undefined}
        />
        <Field id="bp-phone" label="Phone" value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} />
        <Field id="bp-email" label="Email" value={form.email} onChange={(v) => setForm({ ...form, email: v })} />
        <Field id="bp-address" label="Address" value={form.address} onChange={(v) => setForm({ ...form, address: v })} />
        <Field id="bp-industry" label="Industry" value={form.industry} onChange={(v) => setForm({ ...form, industry: v })} />
      </div>

      <div className="mt-4">
        <label htmlFor="bp-services" className="block text-sm font-medium">
          Services <span className="font-normal text-muted-foreground">— comma separated</span>
        </label>
        <input
          id="bp-services" value={form.services}
          onChange={(e) => setForm({ ...form, services: e.target.value })}
          className="mt-1.5 w-full rounded-xl border border-border bg-[var(--input)] px-4 py-2.5 text-sm outline-none transition-colors focus:border-[var(--brand-teal-bright)]"
        />
      </div>

      <div className="mt-4">
        <label htmlFor="bp-description" className="block text-sm font-medium">What the business does</label>
        <textarea
          id="bp-description" rows={3} value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          className="mt-1.5 w-full rounded-xl border border-border bg-[var(--input)] px-4 py-2.5 text-sm leading-relaxed outline-none transition-colors focus:border-[var(--brand-teal-bright)]"
        />
      </div>

      {/* Logo and brand colours are read-only here on purpose: they come from
          the website scan, and a text field is the wrong control for either.
          Re-scanning is how you change them today. */}
      {(profile?.brand.logoUrl || profile?.brand.colors) && (
        <div className="mt-5 flex flex-wrap items-center gap-6 rounded-xl border border-border bg-[var(--surface-soft)] p-3">
          {profile?.brand.logoUrl && (
            <div>
              <p className="text-xs uppercase tracking-widest text-muted-foreground">Logo</p>
              {/* eslint-disable-next-line @next/next/no-img-element -- remote logo on an
                  arbitrary client domain; cannot be in next.config's image allowlist. */}
              <img src={profile.brand.logoUrl} alt="" className="mt-1.5 h-8 max-w-[8rem] object-contain"
                onError={(e) => { e.currentTarget.style.display = "none" }} />
            </div>
          )}
          {profile?.brand.colors && (
            <div>
              <p className="text-xs uppercase tracking-widest text-muted-foreground">Brand colors</p>
              <div className="mt-1.5 flex gap-1.5">
                {[profile.brand.colors.primary, profile.brand.colors.secondary, profile.brand.colors.accent]
                  .filter((c): c is string => !!c)
                  .map((hex) => (
                    <span key={hex} title={hex} className="inline-block h-6 w-6 rounded-md border border-border" style={{ background: hex }} />
                  ))}
              </div>
            </div>
          )}
          <p className="text-xs text-muted-foreground">Re-scan your website to update these.</p>
        </div>
      )}

      {error && <p role="alert" className="mt-4 text-sm text-[var(--destructive)]">{error}</p>}

      <div className="mt-5 flex items-center gap-3">
        <button type="submit" disabled={saving || websiteInvalid}
          className="pill pill-solid px-6 text-sm font-medium disabled:opacity-60 disabled:cursor-not-allowed">
          {saving ? "Saving…" : "Save business details"}
        </button>
        {saved && <span className="text-sm text-muted-foreground">Saved.</span>}
      </div>
    </form>
  )
}

function Field({ id, label, value, onChange, placeholder, error }: {
  id: string; label: string; value: string; onChange: (v: string) => void
  placeholder?: string; error?: string
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium">{label}</label>
      <input
        id={id} value={value} placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={!!error}
        className="mt-1.5 w-full rounded-xl border border-border bg-[var(--input)] px-4 py-2.5 text-sm outline-none transition-colors focus:border-[var(--brand-teal-bright)]"
      />
      {error && <p role="alert" className="mt-1 text-xs text-[var(--destructive)]">{error}</p>}
    </div>
  )
}
