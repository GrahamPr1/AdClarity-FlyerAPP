"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { ApStringKey } from "@/lib/ap/i18n"
import type { ApLang } from "@/lib/ap/types"

// Sign-up and sign-in for one org's agents. Two steps: details (or email),
// then the emailed 6-digit code. Every call goes to /api/ap/{slug}/…, so the
// flow is bound to this org server-side.

type Props = {
  mode: "join" | "signin"
  slug: string
  lang: ApLang
  languages: ApLang[]
  t: Record<ApStringKey, string>
  prefillId: string | null
  refCode: string | null
}

export function ApAccessForm({ mode, slug, lang, languages, t, prefillId, refCode }: Props) {
  const router = useRouter()
  const [step, setStep] = useState<"details" | "code" | "done">("details")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const [f, setF] = useState({ externalId: prefillId ?? "", name: "", phone: "", email: "", lang, code: "" })
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value })

  async function call(path: string, body: unknown) {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/ap/${slug}/${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      const data = await res.json().catch(() => ({}))
      return { res, data }
    } finally {
      setBusy(false)
    }
  }

  const errorText = (data: { error?: string; message?: string }) => {
    const k = `err.${data.error}` as ApStringKey
    return data.message ?? t[k] ?? t["err.generic"]
  }

  async function sendDetails(e: React.FormEvent) {
    e.preventDefault()
    const { res, data } = mode === "join"
      ? await call("signup", { externalId: f.externalId, name: f.name, phone: f.phone, email: f.email, lang: f.lang, ref: refCode })
      : await call("signin", { email: f.email })
    if (res.ok) setStep("code")
    else setError(errorText(data))
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault()
    const { res, data } = await call("verify", { code: f.code.trim() })
    if (!res.ok) return setError(errorText(data))
    if (data.state === "signed_in") return router.push(data.next)
    setDone(data.state === "pending" ? t["msg.pending"] : t["msg.review"])
    setStep("done")
  }

  if (step === "done") return <p className="rounded-md border p-4" data-testid="ap-done">{done}</p>

  return step === "details" ? (
    <form onSubmit={sendDetails} className="space-y-4" data-testid="ap-details-form">
      {mode === "join" && (
        <>
          <Field id="externalId" label={t["field.externalId"]}><Input id="externalId" value={f.externalId} onChange={set("externalId")} required maxLength={32} autoComplete="off" /></Field>
          <Field id="name" label={t["field.name"]}><Input id="name" value={f.name} onChange={set("name")} required maxLength={40} autoComplete="name" /></Field>
          <Field id="phone" label={t["field.phone"]}><Input id="phone" value={f.phone} onChange={set("phone")} required inputMode="tel" autoComplete="tel" /></Field>
        </>
      )}
      <Field id="email" label={t["field.email"]}><Input id="email" type="email" value={f.email} onChange={set("email")} required autoComplete="email" /></Field>
      {mode === "join" && languages.length > 1 && (
        <Field id="lang" label={t["field.lang"]}>
          <select id="lang" value={f.lang} onChange={set("lang")} className="h-9 w-full rounded-md border bg-transparent px-3 text-sm">
            {languages.map((l) => <option key={l} value={l}>{l === "en" ? "English" : "Español"}</option>)}
          </select>
        </Field>
      )}
      {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
      <Button type="submit" disabled={busy} className="w-full">{t["btn.send"]}</Button>
    </form>
  ) : (
    <form onSubmit={verify} className="space-y-4" data-testid="ap-code-form">
      <p className="text-sm text-muted-foreground">{t["msg.code_sent"]}</p>
      <Field id="code" label={t["field.code"]}><Input id="code" value={f.code} onChange={set("code")} required inputMode="numeric" pattern="\d{6}" maxLength={6} autoComplete="one-time-code" /></Field>
      {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
      <Button type="submit" disabled={busy} className="w-full">{t["btn.verify"]}</Button>
    </form>
  )
}

function Field({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  )
}
