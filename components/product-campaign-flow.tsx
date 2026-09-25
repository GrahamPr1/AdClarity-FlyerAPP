"use client"

import { useState } from "react"
import useSWR from "swr"
import { fetcher } from "@/lib/swr-fetcher"
import { MAX_VARIATIONS, type ProductProfile } from "@/lib/product-profile"

/**
 * Product / service -> creative options -> generate.
 *
 * The Phase 3 campaign flow. Replaces "What are you promoting?" — a box you
 * retyped every campaign — with a list of things the business actually
 * sells, each structured once and reused.
 *
 * Back navigation at every step, on purpose: the old flow could strand you
 * inside a form with no way out but the browser button.
 */
type Step = "pick" | "add" | "options"

export function ProductCampaignFlow({ onBack }: { onBack?: () => void }) {
  const { data, isLoading, mutate } = useSWR<{ products: ProductProfile[] }>("/api/products", fetcher)
  const [step, setStep] = useState<Step>("pick")
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const products = data?.products ?? []
  const selected = products.find((p) => p.id === selectedId) ?? null

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading your products…</p>

  if (step === "add") {
    return (
      <AddProductForm
        onBack={() => setStep("pick")}
        onSaved={async (product) => {
          await mutate()
          setSelectedId(product.id)
          setStep("options")
        }}
      />
    )
  }

  if (step === "options" && selected) {
    return <CreativeOptions product={selected} onBack={() => setStep("pick")} />
  }

  return (
    <div>
      {onBack && (
        <button type="button" onClick={onBack} className="mb-4 text-sm text-muted-foreground transition-colors hover:text-foreground">
          ← Back
        </button>
      )}
      <h1 className="text-2xl md:text-3xl tracking-tight">What are you promoting?</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Pick something you&apos;ve already set up, or add a new product, service or offer.
      </p>

      {products.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-border bg-card p-6">
          <p className="text-sm">You haven&apos;t added anything yet.</p>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Describe one product, service or offer in your own words. OneFlyer structures it once, and
            every future campaign can reuse it.
          </p>
          <button type="button" onClick={() => setStep("add")} className="pill pill-solid mt-4 px-6 text-sm font-medium">
            + Add product or service
          </button>
        </div>
      ) : (
        <>
          <ul className="mt-6 grid gap-3 sm:grid-cols-2">
            {products.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => { setSelectedId(p.id); setStep("options") }}
                  className="h-full w-full rounded-2xl border border-border bg-card p-5 text-left transition-colors hover:bg-[var(--surface-sunken)] hover:border-[var(--brand-teal-bright)]"
                >
                  <p className="font-semibold">{p.name}</p>
                  {p.offer && <p className="mt-1 text-sm text-[var(--brand-teal-bright)]">{p.offer}</p>}
                  {p.description && (
                    <p className="mt-1.5 line-clamp-2 text-sm text-muted-foreground">{p.description}</p>
                  )}
                  {p.pricing && <p className="mt-2 text-xs text-muted-foreground">{p.pricing}</p>}
                </button>
              </li>
            ))}
          </ul>
          <button type="button" onClick={() => setStep("add")} className="pill pill-outline border-foreground/25 mt-4 px-6 text-sm">
            + Add product or service
          </button>
        </>
      )}
    </div>
  )
}

/* ------------------------------ Add form ------------------------------- */

function AddProductForm({ onBack, onSaved }: { onBack: () => void; onSaved: (p: ProductProfile) => void }) {
  const [name, setName] = useState("")
  const [raw, setRaw] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [warning, setWarning] = useState<string | null>(null)

  async function save() {
    if (!name.trim() && !raw.trim()) return
    setSaving(true); setError(null); setWarning(null)
    try {
      const res = await fetch("/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() || undefined, rawInput: raw.trim() || undefined, understand: !!raw.trim() }),
      })
      const body = await res.json().catch(() => null)
      if (!res.ok) { setError(body?.error ?? "Couldn't save that. Please try again."); return }
      if (body?.warning) setWarning(body.warning)
      onSaved(body.product as ProductProfile)
    } catch {
      setError("We couldn't reach the server. Check your connection and try again.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <button type="button" onClick={onBack} className="mb-4 text-sm text-muted-foreground transition-colors hover:text-foreground">
        ← Back
      </button>
      <h1 className="text-2xl md:text-3xl tracking-tight">Add a product or service</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Describe it however you like. OneFlyer pulls out the offer, features, pricing and any conditions —
        and shows you what it understood so you can correct it.
      </p>

      <label htmlFor="product-name" className="mt-6 block text-sm font-medium">What is it called?</label>
      <input
        id="product-name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Spring roof inspection"
        disabled={saving}
        className="mt-2 w-full rounded-xl border border-border bg-[var(--input)] px-4 py-3 text-sm outline-none transition-colors focus:border-[var(--brand-teal-bright)] disabled:opacity-60"
      />

      <label htmlFor="product-raw" className="mt-5 block text-sm font-medium">
        Tell us about it <span className="font-normal text-muted-foreground">— offer, price, what&apos;s included, any conditions</span>
      </label>
      <textarea
        id="product-raw"
        value={raw}
        onChange={(e) => setRaw(e.target.value)}
        rows={6}
        disabled={saving}
        placeholder="$99 roof inspection for homeowners. Includes a written report and photos. New customers only, ends June 30."
        className="mt-2 w-full rounded-xl border border-border bg-[var(--input)] px-4 py-3 text-sm leading-relaxed outline-none transition-colors focus:border-[var(--brand-teal-bright)] disabled:opacity-60"
      />
      <p className="mt-1.5 text-xs text-muted-foreground">
        Only what you write here is used. OneFlyer never invents a price, a deadline or a guarantee.
      </p>

      {error && <p role="alert" className="mt-3 text-sm text-[var(--destructive)]">{error}</p>}
      {warning && <p className="mt-3 text-sm text-muted-foreground">{warning}</p>}

      <div className="mt-6 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving || (!name.trim() && !raw.trim())}
          className="pill pill-solid px-6 text-sm font-medium disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {saving ? "Reading it…" : "Save and continue"}
        </button>
        <button type="button" onClick={onBack} disabled={saving} className="pill pill-outline border-foreground/25 px-6 text-sm">
          Cancel
        </button>
      </div>
    </div>
  )
}

/* --------------------------- Creative options --------------------------- */

function CreativeOptions({ product, onBack }: { product: ProductProfile; onBack: () => void }) {
  const [count, setCount] = useState(3)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<{ variations: number; angles: { id: string; name: string }[] } | null>(null)

  async function generate() {
    setBusy(true); setError(null)
    try {
      const res = await fetch("/api/campaigns/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId: product.id, variations: count }),
      })
      const body = await res.json().catch(() => null)
      if (!res.ok) { setError(body?.message ?? body?.error ?? "Couldn't start generation."); return }
      setDone({ variations: body.variations, angles: body.angles ?? [] })
    } catch {
      setError("We couldn't reach the server. Check your connection and try again.")
    } finally {
      setBusy(false)
    }
  }

  if (done) {
    return (
      <div>
        <h1 className="text-2xl md:text-3xl tracking-tight">
          Generating {done.variations} option{done.variations === 1 ? "" : "s"}…
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Each one takes a different angle on {product.name}. They&apos;ll appear on your dashboard as they finish.
        </p>
        {done.angles.length > 0 && (
          <ul className="mt-4 flex flex-wrap gap-1.5">
            {done.angles.map((a, i) => (
              <li key={`${a.id}-${i}`} className="rounded-full border border-border bg-[var(--surface-soft)] px-3 py-1 text-xs">
                {a.name}
              </li>
            ))}
          </ul>
        )}
        <a href="/dashboard" className="pill pill-solid mt-6 inline-flex px-6 text-sm font-medium">
          Go to my dashboard
        </a>
      </div>
    )
  }

  return (
    <div>
      <button type="button" onClick={onBack} className="mb-4 text-sm text-muted-foreground transition-colors hover:text-foreground">
        ← Back to products
      </button>
      <h1 className="text-2xl md:text-3xl tracking-tight">How many options for {product.name}?</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Each option uses a different messaging angle and layout, all built from the same details — so you can
        pick the one that fits. Each counts as one flyer against your plan.
      </p>

      <div className="mt-6 flex flex-wrap gap-2" role="group" aria-label="Number of creative options">
        {Array.from({ length: MAX_VARIATIONS }, (_, i) => i + 1).map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setCount(n)}
            aria-pressed={count === n}
            className={`h-12 w-12 rounded-xl border text-sm font-medium transition-colors ${
              count === n
                ? "border-[var(--brand-teal-bright)] bg-[var(--brand-teal-bright)] text-[var(--primary-foreground)]"
                : "border-border bg-card hover:bg-[var(--surface-sunken)]"
            }`}
          >
            {n}
          </button>
        ))}
      </div>

      <details className="mt-6 rounded-xl border border-border bg-[var(--surface-soft)] p-4">
        <summary className="cursor-pointer text-sm font-medium">What OneFlyer will use</summary>
        <dl className="mt-3 grid gap-2 text-sm">
          <Detail label="Offer" value={product.offer} />
          <Detail label="Pricing" value={product.pricing} />
          <Detail label="Features" value={product.features.join(", ") || null} />
          <Detail label="Must appear" value={product.limitations.join(", ") || null} />
        </dl>
        {product.normalizationNotes.length > 0 && (
          <p className="mt-3 text-xs text-muted-foreground">
            Notes: {product.normalizationNotes.join(" · ")}
          </p>
        )}
      </details>

      {error && <p role="alert" className="mt-4 text-sm text-[var(--destructive)]">{error}</p>}

      <button
        type="button"
        onClick={() => void generate()}
        disabled={busy}
        className="pill pill-solid mt-6 px-7 text-sm font-medium disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {busy ? "Starting…" : `Generate ${count} option${count === 1 ? "" : "s"}`}
      </button>
    </div>
  )
}

function Detail({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex gap-2">
      <dt className="min-w-[7rem] text-muted-foreground">{label}</dt>
      <dd className={value ? "" : "text-muted-foreground"}>{value || "Not set"}</dd>
    </div>
  )
}
