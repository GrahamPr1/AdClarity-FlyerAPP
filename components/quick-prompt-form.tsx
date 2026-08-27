"use client"

import { useState } from "react"
import useSWR from "swr"
import type { BusinessCategory, QuickPromptFormat, QuickPromptStyle } from "@/lib/types"
import { QUICK_PROMPT_FORMATS, QUICK_PROMPT_STYLES } from "@/lib/types"
import { QUICK_PROMPT_STARTERS } from "@/lib/quick-prompt-starters"
import { FlyerCard } from "./dashboard-client"
import { LoadingSpinner } from "./loading-spinner"
import type { Deliverables } from "@/lib/types"
import Link from "next/link"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

function ChipRow<T extends string>({ options, value, onChange, allowNone }: {
  options: readonly T[]
  value: T | null
  onChange: (v: T | null) => void
  allowNone?: boolean
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => (
        <button
          key={opt}
          type="button"
          onClick={() => onChange(allowNone && value === opt ? null : opt)}
          className={`px-3.5 py-1.5 rounded-full text-sm font-medium border transition-colors ${
            value === opt
              ? "border-[var(--brand-teal-bright)] bg-[var(--brand-teal-tint)] text-[var(--brand-teal-bright)]"
              : "border-white/12 bg-white/[0.04] text-foreground/80 hover:border-white/25"
          }`}
        >
          {opt}
        </button>
      ))}
    </div>
  )
}

function fieldBase() {
  return "w-full rounded-lg bg-white/[0.04] border border-white/12 px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-[var(--brand-teal-bright)] focus:ring-1 focus:ring-[var(--brand-teal-bright)] transition-colors"
}

interface QuickPromptResult {
  flyerId: string
}

// `email` is part of the caller contract (create-flyer-flow passes it) but
// the server derives identity from the session, so it is intentionally unused here.
export function QuickPromptForm({ email: _email, hasSavedBrand, onBack }: { email: string; hasSavedBrand: boolean; onBack: () => void }) {
  const [prompt, setPrompt] = useState("")
  const [format, setFormat] = useState<QuickPromptFormat>("Flyer")
  const [style, setStyle] = useState<QuickPromptStyle | null>(null)
  const [useSavedBrand, setUseSavedBrand] = useState(hasSavedBrand)
  const [websiteUrl, setWebsiteUrl] = useState("")
  // Set when a site was supplied but couldn't be read. The flyer still
  // generated — this explains why it used only what was typed.
  const [scrapeNotice, setScrapeNotice] = useState<string | null>(null)
  const [businessName, setBusinessName] = useState("")
  const [phone, setPhone] = useState("")
  const [address, setAddress] = useState("")

  const [attempt, setAttempt] = useState(0)
  const [clarifyingQuestion, setClarifyingQuestion] = useState<string | null>(null)
  const [clarificationAnswer, setClarificationAnswer] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")
  const [result, setResult] = useState<QuickPromptResult | null>(null)

  // businessCategory drives the starter chips — pulled from the same
  // /api/deliverables payload every other dashboard view already uses.
  const { data: deliverables } = useSWR<Deliverables>("/api/deliverables", fetcher)
  const category: BusinessCategory = deliverables?.businessCategory ?? "Other"
  const starters = QUICK_PROMPT_STARTERS[category]

  const needsFallbackFields = !useSavedBrand

  async function submit(currentAttempt: number) {
    setSubmitting(true)
    setError("")

    let res: Response
    try {
      res = await fetch("/api/quick-prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          format,
          styleOverride: style,
          useSavedBrand,
          websiteUrl: websiteUrl.trim() || undefined,
          attempt: currentAttempt,
          clarificationAnswer: currentAttempt > 0 ? clarificationAnswer : undefined,
          businessName: needsFallbackFields ? businessName : undefined,
          phone: needsFallbackFields ? phone : undefined,
          address: needsFallbackFields ? address : undefined,
        }),
      })
    } catch {
      setSubmitting(false)
      setError("Couldn't reach the server — check your connection and try again.")
      return
    }

    const data = await res.json().catch(
      () => ({}) as { error?: string; message?: string; needsClarification?: boolean; question?: string; flyerId?: string; scrapeNotice?: string | null },
    )

    if (!res.ok) {
      setSubmitting(false)
      setError(data.message ?? data.error ?? "Something went wrong")
      return
    }

    if (data.needsClarification && data.question) {
      setSubmitting(false)
      setClarifyingQuestion(data.question)
      setAttempt(currentAttempt + 1)
      return
    }

    setSubmitting(false)
    // Surfaced on the result view too — the client spent a credit and should
    // know the flyer was built without the site they pointed us at.
    setScrapeNotice(data.scrapeNotice ?? null)
    setResult({ flyerId: data.flyerId! })
  }

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault()
    await submit(attempt)
  }

  async function handleClarificationSubmit(e: React.FormEvent) {
    e.preventDefault()
    await submit(attempt)
  }

  if (result) {
    return <QuickPromptResultView flyerId={result.flyerId} hasSavedBrand={hasSavedBrand} onBack={onBack} />
  }

  if (clarifyingQuestion) {
    return (
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Just one thing…</h1>
        <p className="mt-2 text-sm text-muted-foreground">{clarifyingQuestion}</p>
        <form onSubmit={handleClarificationSubmit} className="mt-6 flex flex-col gap-4">
          <textarea rows={2} className={fieldBase()} value={clarificationAnswer}
            onChange={(e) => setClarificationAnswer(e.target.value)} autoFocus
            placeholder="Your answer…" />
          {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
          <button type="submit" disabled={submitting || !clarificationAnswer.trim()}
            className="self-start px-6 py-2.5 rounded-lg bg-[var(--brand-teal-bright)] text-white text-sm font-semibold hover:bg-[var(--brand-teal)] disabled:opacity-60 transition-colors">
            {submitting ? "Generating…" : "Continue"}
          </button>
        </form>
      </div>
    )
  }

  return (
    <div>
      <button type="button" onClick={onBack} className="text-sm text-muted-foreground hover:text-foreground transition-colors">← Back</button>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight">Quick Prompt</h1>
      <p className="mt-2 text-sm text-muted-foreground">Describe what you need in one sentence — we&apos;ll handle the rest.</p>

      <form onSubmit={handleGenerate} className="mt-6 flex flex-col gap-5">
        <div>
          <label className="block text-sm font-medium mb-1.5">Format</label>
          <ChipRow options={QUICK_PROMPT_FORMATS} value={format} onChange={(v) => v && setFormat(v)} />
          {/* Listed here for discoverability, but it is not a chip: a
              coloring page isn't generated from a one-line business prompt.
              It asks what to DRAW — a scene, a character, who's colouring it
              in — so it links to its own flow rather than pretending this
              form can produce one. Pro-only; enforced server-side by
              coloringPagesEnabled, not by this link. */}
          <p className="mt-2 text-xs text-muted-foreground">
            Making a{" "}
            <Link href="/coloring-page" className="text-[var(--brand-teal-bright)] hover:underline">
              printable coloring page
            </Link>{" "}
            instead? It asks a different set of questions.{" "}
            <span className="rounded-full border border-[var(--brand-teal)]/40 bg-[var(--brand-teal-tint)] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--brand-teal-bright)]">
              Pro
            </span>
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1.5">Style <span className="text-muted-foreground">(optional — overrides whatever tone we infer)</span></label>
          <ChipRow options={QUICK_PROMPT_STYLES} value={style} onChange={setStyle} allowNone />
        </div>

        {hasSavedBrand && (
          <label className="flex items-center gap-2.5 text-sm cursor-pointer">
            <input type="checkbox" checked={useSavedBrand} onChange={(e) => setUseSavedBrand(e.target.checked)}
              className="w-4 h-4 accent-[var(--brand-teal-bright)]" />
            Use my saved brand (logo, colors, business info)
          </label>
        )}

        <div>
          <label htmlFor="prompt" className="block text-sm font-medium mb-1.5">What do you need?</label>
          <textarea id="prompt" rows={4} className={fieldBase()} value={prompt}
            onChange={(e) => setPrompt(e.target.value)} autoFocus
            placeholder="e.g. Flyer for a spring bakery sale, 20% off pastries, playful colors" />
        </div>

        {starters.length > 0 && (
          <div>
            <p className="text-xs uppercase tracking-widest text-muted-foreground/70 mb-2">Need an idea? Tap one to start</p>
            <div className="flex flex-wrap gap-2">
              {starters.map((s) => (
                <button key={s} type="button" onClick={() => setPrompt(s)}
                  className="px-3 py-1.5 rounded-full text-xs border border-white/12 bg-white/[0.03] text-muted-foreground hover:border-white/25 hover:text-foreground transition-colors">
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {needsFallbackFields && (
          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 flex flex-col gap-4">
            <p className="text-xs text-muted-foreground">
              {hasSavedBrand ? "Not using your saved brand — a few basics for this flyer:" : "Since this is your first flyer, a few basics:"}
            </p>
            <input className={fieldBase()} value={businessName} onChange={(e) => setBusinessName(e.target.value)} placeholder="Business name" />
            <div className="grid sm:grid-cols-2 gap-4">
              <input className={fieldBase()} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone" />
              <input className={fieldBase()} value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Address" />
            </div>

            {/* The guided flow has been able to read a website since it
                shipped; Quick Prompt had only the one text box, which is why
                its output was necessarily more generic. Optional and
                best-effort — a site we can't read never blocks the
                generation. */}
            <div>
              <label htmlFor="qp-website" className="block text-sm font-medium mb-1.5">
                Your website <span className="font-normal text-muted-foreground">(optional)</span>
              </label>
              <input id="qp-website" className={fieldBase()} value={websiteUrl}
                onChange={(e) => setWebsiteUrl(e.target.value)} placeholder="millerheating.com" />
              <p className="mt-1.5 text-xs text-muted-foreground">
                We&apos;ll read it and match your colours, services and wording — much more
                personal than what fits in one sentence. Adds around half a minute.
              </p>
            </div>
          </div>
        )}

        {scrapeNotice && (
          <p className="rounded-lg border border-amber-500/25 bg-amber-500/[0.06] px-3.5 py-2.5 text-sm text-amber-200">
            {scrapeNotice} We built your flyer from what you typed instead.
          </p>
        )}

        {error && <p role="alert" className="text-sm text-red-400">{error}</p>}

        <button type="submit" disabled={submitting || !prompt.trim() || (needsFallbackFields && (!businessName.trim() || !phone.trim() || !address.trim()))}
          className="self-start px-6 py-2.5 rounded-lg bg-[var(--brand-teal-bright)] text-white text-sm font-semibold hover:bg-[var(--brand-teal)] disabled:opacity-60 transition-colors">
          {submitting ? "Generating…" : "Generate"}
        </button>
      </form>
    </div>
  )
}

function QuickPromptResultView({ flyerId, hasSavedBrand, onBack }: { flyerId: string; hasSavedBrand: boolean; onBack: () => void }) {
  const { data, mutate } = useSWR<Deliverables>("/api/deliverables", fetcher, {
    refreshInterval: (latest) => {
      const flyer = latest?.flyers.find((f) => f.id === flyerId)
      return !flyer || flyer.status === "In Progress" || flyer.status === "Pending" ? 3000 : 0
    },
  })
  const flyer = data?.flyers.find((f) => f.id === flyerId)
  const ready = flyer?.status === "Ready"

  const [regenerating, setRegenerating] = useState(false)
  const [regenerateNotice, setRegenerateNotice] = useState("")

  const [saveOffered, setSaveOffered] = useState(!hasSavedBrand)
  const [savingBrand, setSavingBrand] = useState(false)
  const [saveError, setSaveError] = useState("")
  const [saved, setSaved] = useState(false)

  const [refineInstruction, setRefineInstruction] = useState("")
  const [refining, setRefining] = useState(false)
  const [refineError, setRefineError] = useState("")
  const [refineNotice, setRefineNotice] = useState("")

  async function handleRetry(id: string) {
    const res = await fetch("/api/deliverables/retry", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ flyerId: id }),
    })
    mutate()
    if (!res.ok) {
      const body = await res.json().catch(() => ({}) as { message?: string; error?: string })
      return { ok: false, error: body.message ?? body.error ?? "Could not start retry — please try again." }
    }
    return { ok: true }
  }

  // "Try Again" — first 2 calls per flyer within 10 minutes are free (see
  // incrementAndCheckRegenerateAllowance in lib/store.ts); the server
  // enforces this regardless of what the client shows.
  async function handleTryAgain() {
    setRegenerating(true)
    setRegenerateNotice("")
    const res = await fetch("/api/quick-prompt/regenerate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ flyerId }),
    })
    const responseData = await res.json().catch(() => ({}) as { message?: string; error?: string; isFree?: boolean; countSoFar?: number })
    setRegenerating(false)
    if (!res.ok) {
      setRegenerateNotice(responseData.message ?? responseData.error ?? "Couldn't try again — please try again later.")
      return
    }
    setRegenerateNotice(responseData.isFree ? "" : "This used an additional flyer credit — you've used your 2 free retries for this one.")
    mutate()
  }

  async function handleSaveBrand() {
    setSavingBrand(true)
    setSaveError("")
    const res = await fetch("/api/brand-profile/save-from-generation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ flyerId }),
    })
    setSavingBrand(false)
    if (!res.ok) {
      const body = await res.json().catch(() => ({}) as { message?: string; error?: string })
      setSaveError(body.message ?? body.error ?? "Couldn't save your brand — please try again.")
      return
    }
    setSaved(true)
  }

  // Natural-language refinement — first 3 per flyer within an hour are
  // free (see incrementAndCheckRefinementAllowance in lib/store.ts).
  async function handleRefine(e: React.FormEvent) {
    e.preventDefault()
    setRefining(true)
    setRefineError("")
    setRefineNotice("")
    const res = await fetch("/api/quick-prompt/refine", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ flyerId, instruction: refineInstruction }),
    })
    const responseData = await res.json().catch(() => ({}) as { message?: string; error?: string; isFree?: boolean })
    setRefining(false)
    if (!res.ok) {
      setRefineError(responseData.message ?? responseData.error ?? "Couldn't apply that change — please try again.")
      return
    }
    setRefineNotice(responseData.isFree ? "Applying your change…" : "Applying your change — this used an additional flyer credit (3 free refinements used for this one).")
    setRefineInstruction("")
    mutate()
  }

  return (
    <div>
      <button type="button" onClick={onBack} className="text-sm text-muted-foreground hover:text-foreground transition-colors">← Back to dashboard</button>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight">Your flyer</h1>

      <div className="mt-6 max-w-sm">
        {!flyer ? (
          <LoadingSpinner message="Designing your flyer… this usually takes less than a minute." />
        ) : (
          <FlyerCard flyer={flyer} onRetry={handleRetry} />
        )}
      </div>

      {ready && (
        <div className="mt-5 max-w-sm flex flex-col gap-2">
          <button type="button" onClick={handleTryAgain} disabled={regenerating}
            className="self-start px-4 py-2 rounded-lg border border-white/12 text-sm hover:bg-white/[0.05] disabled:opacity-60 transition-colors">
            {regenerating ? "Generating a new take…" : "Try Again"}
          </button>
          {regenerateNotice && <p className="text-xs text-muted-foreground">{regenerateNotice}</p>}
        </div>
      )}

      {ready && saveOffered && !saved && (
        <div className="mt-5 max-w-sm rounded-xl border border-[var(--brand-teal)]/40 bg-[var(--brand-teal-tint)] p-4">
          <p className="text-sm">Like this style? Save it as your brand so future flyers stay consistent.</p>
          {saveError && <p className="mt-2 text-xs text-red-400">{saveError}</p>}
          <div className="mt-3 flex gap-3">
            <button type="button" onClick={handleSaveBrand} disabled={savingBrand}
              className="px-4 py-1.5 rounded-lg bg-[var(--brand-teal-bright)] text-white text-sm font-semibold hover:bg-[var(--brand-teal)] disabled:opacity-60 transition-colors">
              {savingBrand ? "Saving…" : "Save as my brand"}
            </button>
            <button type="button" onClick={() => setSaveOffered(false)} className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              Not now
            </button>
          </div>
        </div>
      )}
      {saved && <p className="mt-5 max-w-sm text-sm text-[var(--brand-teal-bright)]">Saved — future flyers will reuse this brand automatically.</p>}

      {ready && (
        <form onSubmit={handleRefine} className="mt-6 max-w-sm flex flex-col gap-2">
          <label htmlFor="refine" className="block text-sm font-medium">Want to change something?</label>
          <textarea id="refine" rows={2} value={refineInstruction} onChange={(e) => setRefineInstruction(e.target.value)}
            placeholder="e.g. 'make the headline bigger', 'use blue instead of green'"
            className="w-full rounded-lg bg-white/[0.04] border border-white/12 px-3.5 py-2.5 text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:border-[var(--brand-teal-bright)] focus:ring-1 focus:ring-[var(--brand-teal-bright)]" />
          {refineError && <p role="alert" className="text-xs text-red-400">{refineError}</p>}
          {refineNotice && <p className="text-xs text-muted-foreground">{refineNotice}</p>}
          <button type="submit" disabled={refining || !refineInstruction.trim()}
            className="self-start px-4 py-2 rounded-lg border border-white/12 text-sm hover:bg-white/[0.05] disabled:opacity-60 transition-colors">
            {refining ? "Applying…" : "Apply change"}
          </button>
        </form>
      )}
    </div>
  )
}
