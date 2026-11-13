"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { LAYOUTS, SLOTS, type Layout } from "@/lib/ap/templates/slots"
import { sampleSlots } from "@/lib/ap/templates/sample"
import type { ApPackage, Pricing, SlotValues } from "@/lib/ap/templates/content"
import type { ApLang } from "@/lib/ap/types"

// The org's flyer content: packages, each filling one layout, one set of
// slots per ENABLED language (an English-only org never sees Spanish fields).
// Budgets are enforced here (maxLength) and again on the server, which also
// renders every page and names any slot that doesn't fit.

const LAYOUT_NAMES: Record<Layout, string> = {
  P1: "P1 · three benefits + steps",
  P2: "P2 · four benefits + plus card",
  P3: "P3 · two benefits + engagement card",
}
const LANG_NAMES: Record<ApLang, string> = { en: "English", es: "Spanish" }

type Draft = Omit<ApPackage, "id"> & { id?: string }

export function ApPackagesEditor({ orgId, languages, initial }: { orgId: string; languages: ApLang[]; initial: ApPackage[] }) {
  const [pkgs, setPkgs] = useState<Draft[]>(initial)
  const [busy, setBusy] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [msg, setMsg] = useState<string | null>(null)
  const [saved, setSaved] = useState<ApPackage[]>(initial)

  const setPkg = (i: number, p: Draft) => setPkgs(pkgs.map((x, j) => (j === i ? p : x)))
  const setSlot = (i: number, lang: ApLang, key: string, value: string) => {
    const p = pkgs[i]
    const v = { ...(p.variants[lang] ?? {}), [key]: value }
    // Prices are shared by every language.
    const variants = { ...p.variants, [lang]: v }
    if (key.endsWith(".amount")) for (const l of languages) variants[l] = { ...(variants[l] ?? {}), [key]: value }
    setPkg(i, { ...p, variants })
  }

  function addPackage(layout: Layout) {
    const variants: Partial<Record<ApLang, SlotValues>> = {}
    for (const l of languages) variants[l] = Object.fromEntries(SLOTS[layout].map((s) => [s.key, ""]))
    setPkgs([...pkgs, { layout, variants, pricing: ["price", "noprice"] }])
  }

  function fillSample(i: number) {
    const p = pkgs[i]
    const variants: Partial<Record<ApLang, SlotValues>> = {}
    for (const l of languages) variants[l] = sampleSlots(p.layout, l)
    setPkg(i, { ...p, variants })
  }

  async function save() {
    setBusy(true)
    setMsg("Checking budgets and rendering every page… (up to a minute)")
    setErrors({})
    try {
      const res = await fetch(`/api/admin/organizations/${orgId}/packages`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ packages: pkgs }) })
      const data = await res.json()
      if (res.ok) {
        setPkgs(data.content.packages)
        setSaved(data.content.packages)
        setMsg("Saved. Every page fits.")
      } else if (data.errors) {
        setErrors(Object.fromEntries(data.errors.map((e: { path: string; error: string }) => [e.path, e.error])))
        setMsg(`Not saved: ${data.errors.length} field problem(s), shown below.`)
      } else if (data.problems) {
        const e: Record<string, string> = {}
        for (const p of data.problems as { package: string; lang: string; slot?: string; message: string }[]) {
          const i = pkgs.findIndex((x) => x.id === p.package)
          e[p.slot && i >= 0 ? `packages[${i}].variants.${p.lang}.${p.slot}` : `fit.${p.package}.${p.lang}.${p.slot ?? "page"}`] = p.message
        }
        setErrors(e)
        setMsg(`Not saved: doesn't fit the page. ${data.problems.map((p: { lang: string; message: string }) => `${p.lang}: ${p.message}`).join(" · ")}`)
      } else setMsg(`Not saved: ${data.message ?? data.error}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6" data-testid="ap-packages">
      {pkgs.map((p, i) => (
        <div key={p.id ?? `new-${i}`} className="space-y-4 rounded-md border p-4" data-testid={`ap-package-${i}`}>
          <div className="flex flex-wrap items-center gap-3">
            <strong>Package {i + 1}</strong>
            <span className="text-sm text-muted-foreground">{LAYOUT_NAMES[p.layout]}</span>
            {(["price", "noprice"] as Pricing[]).map((pr) => (
              <label key={pr} className="inline-flex items-center gap-1 text-sm">
                <input type="checkbox" name={`pricing-${i}-${pr}`} checked={p.pricing.includes(pr)} onChange={(e) => setPkg(i, { ...p, pricing: e.target.checked ? (["price", "noprice"] as Pricing[]).filter((x) => x === pr || p.pricing.includes(x)) : p.pricing.filter((x) => x !== pr) })} />
                {pr === "price" ? "With prices" : "Without prices"}
              </label>
            ))}
            <Button type="button" size="sm" variant="outline" onClick={() => fillSample(i)}>Fill with sample content</Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setPkgs(pkgs.filter((_, j) => j !== i))}>Remove</Button>
          </div>
          {errors[`packages[${i}].pricing`] && <p className="text-xs text-destructive">{errors[`packages[${i}].pricing`]}</p>}
          <div className={`grid gap-6 ${languages.length > 1 ? "lg:grid-cols-2" : ""}`}>
            {languages.map((lang) => (
              <fieldset key={lang} className="space-y-2">
                <legend className="text-sm font-semibold">{LANG_NAMES[lang]}</legend>
                {SLOTS[p.layout].map((slot) => {
                  const path = `packages[${i}].variants.${lang}.${slot.key}`
                  const value = p.variants[lang]?.[slot.key] ?? ""
                  const max = slot.budget === "amount" ? 5 : slot.budget
                  return (
                    <div key={slot.key} className="grid grid-cols-[11rem_1fr] items-start gap-2">
                      <label htmlFor={`${i}-${lang}-${slot.key}`} className="pt-2 text-xs text-muted-foreground">{slot.key}</label>
                      <div>
                        <Input id={`${i}-${lang}-${slot.key}`} name={`${lang}.${slot.key}`} value={value} maxLength={max} onChange={(e) => setSlot(i, lang, slot.key, e.target.value)} aria-invalid={!!errors[path]} placeholder={slot.budget === "amount" ? "$36" : undefined} />
                        <div className="flex justify-between text-[11px] text-muted-foreground">
                          <span className="text-destructive">{errors[path] ?? ""}</span>
                          <span>{value.length}/{max}</span>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </fieldset>
            ))}
          </div>
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-2">
        {LAYOUTS.map((l) => <Button key={l} type="button" variant="outline" size="sm" onClick={() => addPackage(l)}>Add {LAYOUT_NAMES[l]}</Button>)}
        <Button type="button" onClick={save} disabled={busy}>Save packages</Button>
      </div>
      {msg && <p className="text-sm" role="status" data-testid="ap-packages-status">{msg}</p>}
      {Object.entries(errors).filter(([k]) => k.startsWith("fit.")).map(([k, v]) => <p key={k} className="text-xs text-destructive">{k.slice(4)}: {v}</p>)}
      {saved.length > 0 && <ApDraftPreviews orgId={orgId} packages={saved} languages={languages} />}
    </div>
  )
}

function ApDraftPreviews({ orgId, packages, languages }: { orgId: string; packages: ApPackage[]; languages: ApLang[] }) {
  const ids = packages.flatMap((p) => languages.filter((l) => p.variants[l]).flatMap((l) => p.pricing.map((pr) => `${p.id}_${l.toUpperCase()}_${pr.toUpperCase()}`)))
  const base = `/api/admin/organizations/${orgId}/preview`
  return (
    <div className="space-y-2">
      <h3 className="font-semibold">Draft previews (sample agent, PROOF)</h3>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4" data-testid="ap-draft-previews">
        {ids.map((id) => (
          <figure key={id} className="space-y-1">
            {/* eslint-disable-next-line @next/next/no-img-element -- a rendered proof from our own API */}
            <img src={`${base}?template=${id}&size=letter&format=thumb`} alt={`Preview ${id}`} loading="lazy" className="w-full rounded border" />
            <figcaption className="text-[11px] break-all">
              {id} · <a className="underline" href={`${base}?template=${id}&size=letter&format=pdf`}>PDF</a> · <a className="underline" href={`${base}?template=${id}&size=bleed&format=pdf`}>bleed PDF</a>
            </figcaption>
          </figure>
        ))}
      </div>
    </div>
  )
}
