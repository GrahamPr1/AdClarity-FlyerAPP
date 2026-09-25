"use client"

import useSWR from "swr"
import Link from "next/link"
import { fetcher } from "@/lib/swr-fetcher"
import { displayHost } from "@/lib/url-normalize"
import type { BusinessProfile } from "@/lib/business-profile"

/**
 * Business / account details on the dashboard.
 *
 * Reads /api/profile, which falls back to the legacy stores for accounts
 * that predate the scanner — so an established client sees their real
 * details here on day one rather than an empty "set up your business" card.
 *
 * Editing is deliberately a link to the scan/profile flow rather than an
 * inline form: Phase 3 makes the brand record editable properly, and a
 * second half-featured editor here would be the duplicate system the brief
 * warns against.
 */
export function BusinessDetailsCard() {
  const { data, isLoading } = useSWR<{
    profile: BusinessProfile | null
    completeness: { score: number; missing: string[] } | null
  }>("/api/profile", fetcher)

  if (isLoading) {
    return (
      <section className="rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-soft)]">
        <p className="text-xs uppercase tracking-widest text-muted-foreground">Business details</p>
        <p className="mt-3 text-sm text-muted-foreground">Loading…</p>
      </section>
    )
  }

  const profile = data?.profile ?? null

  // Empty state: a real call to action, not a dead card.
  if (!profile) {
    return (
      <section className="rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-soft)]">
        <p className="text-xs uppercase tracking-widest text-muted-foreground">Business details</p>
        <p className="mt-2 text-sm">
          OneFlyer doesn&apos;t know your business yet.
        </p>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Scan your website once and every campaign after that starts with your name, logo, colors and
          contact details already filled in.
        </p>
        <Link href="/onboarding" className="pill pill-solid mt-4 inline-flex px-5 text-sm font-medium">
          Set up my business
        </Link>
      </section>
    )
  }

  const colors = profile.brand.colors
  const swatches = colors
    ? ([colors.primary, colors.secondary, colors.accent].filter((c): c is string => !!c))
    : []
  const completeness = data?.completeness ?? null
  const pct = completeness ? Math.round(completeness.score * 100) : null

  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-soft)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-widest text-muted-foreground">Business details</p>
          <p className="mt-2 text-xl" style={{ fontFamily: "var(--font-heading)" }}>
            {profile.businessName ?? "Unnamed business"}
          </p>
          {profile.website && (
            <a
              href={profile.website}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-0.5 inline-block text-sm text-[var(--brand-teal-bright)] transition-colors hover:text-[var(--brand-teal)]"
            >
              {displayHost(profile.website)}
            </a>
          )}
        </div>

        {profile.brand.logoUrl && (
          /* eslint-disable-next-line @next/next/no-img-element -- remote logo on an
             arbitrary client domain; cannot be in next.config's image allowlist. */
          <img
            src={profile.brand.logoUrl}
            alt=""
            className="h-9 max-w-[8rem] object-contain"
            onError={(e) => { e.currentTarget.style.display = "none" }}
          />
        )}
      </div>

      {profile.description && (
        <p className="mt-3 text-sm text-muted-foreground leading-relaxed line-clamp-3">{profile.description}</p>
      )}

      <dl className="mt-4 grid gap-3 sm:grid-cols-2">
        <Row label="Phone" value={profile.contact.phone} />
        <Row label="Address" value={profile.contact.address} />
      </dl>

      {profile.services.length > 0 && (
        <div className="mt-4">
          <p className="text-xs uppercase tracking-widest text-muted-foreground">Services</p>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {profile.services.slice(0, 8).map((s) => (
              <li key={s} className="rounded-full border border-border bg-[var(--surface-soft)] px-2.5 py-1 text-xs">
                {s}
              </li>
            ))}
          </ul>
        </div>
      )}

      {swatches.length > 0 && (
        <div className="mt-4">
          <p className="text-xs uppercase tracking-widest text-muted-foreground">Brand colors</p>
          <div className="mt-2 flex items-center gap-2">
            {swatches.map((hex) => (
              <span
                key={hex}
                title={hex}
                className="inline-block h-6 w-6 rounded-md border border-border"
                style={{ background: hex }}
              />
            ))}
          </div>
        </div>
      )}

      {pct !== null && pct < 100 && completeness && (
        <div className="mt-4 rounded-xl border border-border bg-[var(--surface-soft)] p-3">
          <p className="text-xs">
            Profile {pct}% complete — still missing {completeness.missing.slice(0, 3).join(", ").toLowerCase()}
            {completeness.missing.length > 3 ? ` and ${completeness.missing.length - 3} more` : ""}.
          </p>
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-3">
        {/* /profile#business, NOT /onboarding. This used to drop the client
            into the new-campaign flow, which is a different task entirely —
            they asked to edit their details and got asked what they wanted to
            promote. */}
        <Link href="/profile#business" className="pill pill-outline border-foreground/25 px-5 text-xs">
          Update business details
        </Link>
      </div>
    </section>
  )
}

function Row({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-widest text-muted-foreground">{label}</dt>
      <dd className={`mt-0.5 text-sm ${value ? "" : "text-muted-foreground"}`}>{value || "Not set"}</dd>
    </div>
  )
}
