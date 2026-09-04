"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

/**
 * The coloring page's own intake — deliberately not the business-flyer form.
 *
 * The flyer questions (trade, services, target audience, offer, phone number)
 * are meaningless to a teacher who wants a rainy-day classroom scene, and
 * asking them would be the clearest possible signal that this is a flyer
 * wearing a costume. These four questions are the ones that actually change
 * the drawing.
 */

const AUDIENCES = [
  { id: "toddler", label: "Toddler", hint: "2–4 · very thick lines, a few big shapes" },
  { id: "young-child", label: "Young child", hint: "5–7 · simple shapes, lots of room" },
  { id: "older-child", label: "Older child", hint: "8–12 · more detail and more to colour" },
  { id: "adult", label: "Adult", hint: "Intricate, fine line work" },
] as const

export function ColoringPageForm() {
  const router = useRouter()
  const [subject, setSubject] = useState("")
  const [audience, setAudience] = useState<(typeof AUDIENCES)[number]["id"]>("young-child")
  const [theme, setTheme] = useState("")
  const [caption, setCaption] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!subject.trim()) return
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch("/api/coloring-page", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: subject.trim(),
          audience,
          theme: theme.trim() || null,
          caption: caption.trim() || null,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(json.message ?? json.error ?? "Something went wrong.")
        setSubmitting(false)
        return
      }
      router.push("/dashboard?onboarded=1")
    } catch {
      setError("Something went wrong.")
      setSubmitting(false)
    }
  }

  const field =
    "w-full rounded-lg bg-[var(--surface-soft)] border border-border px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-[var(--brand-teal-bright)] focus:ring-1 focus:ring-[var(--brand-teal-bright)] transition-colors"

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      <div>
        <label htmlFor="subject" className="block text-sm font-medium mb-1.5">
          What should the coloring page show?
        </label>
        <textarea
          id="subject"
          rows={3}
          className={field}
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="A friendly dragon reading a book under a big tree"
        />
        <p className="mt-1.5 text-xs text-muted-foreground">
          A scene, a character, an animal, an object — describe it the way you&apos;d describe it
          to someone drawing it for you.
        </p>
      </div>

      <div>
        <span className="block text-sm font-medium mb-1.5">Who&apos;s colouring it in?</span>
        <div className="grid gap-2 sm:grid-cols-2">
          {AUDIENCES.map((a) => {
            const active = audience === a.id
            return (
              <button
                key={a.id}
                type="button"
                onClick={() => setAudience(a.id)}
                aria-pressed={active}
                className={`rounded-lg border px-3.5 py-2.5 text-left transition-colors ${
                  active ? "border-[var(--brand-teal-bright)] bg-[var(--brand-teal-tint)]" : "border-border hover:border-[var(--brand-slate)]"
                }`}
              >
                <span className="block text-sm font-medium">{a.label}</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">{a.hint}</span>
              </button>
            )
          })}
        </div>
        <p className="mt-1.5 text-xs text-muted-foreground">
          This sets how thick the lines are and how much detail there is — the difference between
          a page a four-year-old can finish and one they&apos;ll give up on.
        </p>
      </div>

      <div>
        <label htmlFor="theme" className="block text-sm font-medium mb-1.5">
          Theme or occasion <span className="font-normal text-muted-foreground">(optional)</span>
        </label>
        <input id="theme" className={field} value={theme} onChange={(e) => setTheme(e.target.value)}
          placeholder="Halloween, Earth Day, first day of school…" />
      </div>

      <div>
        <label htmlFor="caption" className="block text-sm font-medium mb-1.5">
          Caption across the top <span className="font-normal text-muted-foreground">(optional)</span>
        </label>
        <input id="caption" className={field} value={caption} onChange={(e) => setCaption(e.target.value)}
          placeholder="Mrs. Patel's Class" />
        <p className="mt-1.5 text-xs text-muted-foreground">
          Printed as hollow outlined letters, so it can be coloured in too.
        </p>
      </div>

      {error && (
        <p role="alert" className="text-sm text-red-400">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={submitting || !subject.trim()}
        className="rounded-xl bg-[var(--brand-teal-bright)] px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-[var(--brand-teal)] disabled:opacity-50"
      >
        {submitting ? "Drawing…" : "Create my coloring page"}
      </button>
      <p className="text-xs text-muted-foreground">
        Uses one campaign from your monthly allowance, the same as a flyer.
      </p>
    </form>
  )
}
