"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

// /program: the program admin's sign-in (email -> code) and the bar with Sign out.

const field = "mt-1 block min-h-11 w-full rounded-lg border border-border bg-background px-3"
const primary = "min-h-11 rounded-lg bg-[var(--brand-teal-bright)] px-4 text-sm font-semibold text-[var(--primary-foreground)] disabled:opacity-60"

export function ProgramAdminSignIn() {
  const router = useRouter()
  const [step, setStep] = useState<"email" | "code">("email")
  const [email, setEmail] = useState("")
  const [code, setCode] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  async function post(path: string, body: unknown) {
    setBusy(true); setError(null)
    const res = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null)
    const data = res ? await res.json().catch(() => ({})) : { message: "Network problem. Try again." }
    setBusy(false)
    return { ok: !!res?.ok, data }
  }
  return step === "email" ? (
    <form className="mt-6 flex flex-col gap-4" onSubmit={async (e) => {
      e.preventDefault()
      const { ok, data } = await post("/api/program-admin/signin", { email })
      if (!ok) return setError(data.message ?? "Couldn't send a code.")
      setStep("code")
    }}>
      <label className="text-sm">Email<input id="pa-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className={field} /></label>
      <button type="submit" disabled={busy || !email.trim()} className={primary}>{busy ? "Sending…" : "Send code"}</button>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    </form>
  ) : (
    <form className="mt-6 flex flex-col gap-4" onSubmit={async (e) => {
      e.preventDefault()
      const { ok, data } = await post("/api/program-admin/verify", { code })
      if (!ok) {
        if (data.error === "expired" || data.error === "too_many_attempts") { setStep("email"); setCode("") }
        return setError(data.message ?? "That code didn't work.")
      }
      router.replace(data.redirect ?? "/program/agents")
    }}>
      <p className="text-sm text-muted-foreground">If {email} is a program admin, a code is on its way. It expires in 15 minutes.</p>
      <label className="text-sm">Code<input id="pa-code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} className={`${field} tracking-[0.4em]`} /></label>
      <button type="submit" disabled={busy || code.length !== 6} className={primary}>{busy ? "Checking…" : "Sign in"}</button>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    </form>
  )
}

export function ProgramAdminBar({ name, canSignOut }: { name: string; canSignOut: boolean }) {
  const router = useRouter()
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-6 py-3 text-sm" data-testid="program-admin-bar">
      <span><strong>Neighborhood Outreach Program</strong> · admin: {name}</span>
      {canSignOut && (
        <button type="button" data-testid="program-sign-out" className="min-h-11 rounded-lg border border-border px-3"
          onClick={async () => { await fetch("/api/program-admin/signout", { method: "POST" }); router.replace("/program") }}>
          Sign out
        </button>
      )}
    </div>
  )
}
