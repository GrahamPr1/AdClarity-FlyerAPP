"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Field, field, post, primary, secondary, textLink } from "@/components/nop-agent"

// NOP admin console sign-in for org admins: email -> emailed code. English
// (Basic Benefits staff, not agents). The server routes are the authority.

const COOLDOWN_S = 60

export function OrgAdminSignIn() {
  const router = useRouter()
  const [step, setStep] = useState<"email" | "code">("email")
  const [email, setEmail] = useState("")
  const [code, setCode] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [wait, setWait] = useState(0)
  const codeInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (wait <= 0) return
    const timer = window.setTimeout(() => setWait((w) => w - 1), 1000)
    return () => window.clearTimeout(timer)
  }, [wait])
  useEffect(() => {
    if (step === "code") codeInput.current?.focus()
  }, [step])

  async function sendCode(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const r = await post("/api/enterprise/nop/org-admin/signin", { email })
    setBusy(false)
    if (!r.ok) return setError(r.data.message ?? "Something went wrong. Please try again.")
    setStep("code")
    setWait(COOLDOWN_S)
  }

  async function verify(value: string) {
    if (busy || value.length !== 6) return
    setBusy(true)
    setError(null)
    setNotice(null)
    const r = await post("/api/enterprise/nop/org-admin/verify", { code: value })
    if (r.ok) {
      router.replace(r.data.redirect ?? "/admin/enterprise/nop")
      router.refresh()
      return
    }
    setBusy(false)
    setCode("")
    setError(r.data.message ?? "Something went wrong. Please try again.")
    if (r.data.error === "expired" || r.data.error === "too_many_attempts") setStep("email")
    else codeInput.current?.focus()
  }

  async function resend() {
    setError(null)
    const r = await post("/api/enterprise/nop/org-admin/resend", {})
    if (!r.ok) {
      setError(r.data.message ?? "Something went wrong. Please try again.")
      if (r.data.error === "expired" || r.data.error === "resend_limit") setStep("email")
      return
    }
    setNotice("We sent a new code. The earlier one no longer works.")
    setWait(COOLDOWN_S)
  }

  if (step === "email") {
    return (
      <form onSubmit={sendCode} className="flex flex-col gap-4">
        <Field id="email" label="Email">
          <input id="email" type="email" autoComplete="email" required className={field} value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        {error && <p role="alert" className="text-sm text-red-700 dark:text-red-400">{error}</p>}
        <button type="submit" className={primary} disabled={busy}>Send code</button>
      </form>
    )
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        void verify(code)
      }}
      className="flex flex-col gap-4"
    >
      <p className="text-sm text-muted-foreground" aria-live="polite">
        If {email} is a Neighborhood Outreach Program admin, we&apos;ve emailed a 6-digit code to it. It expires in 15 minutes.
      </p>
      <Field id="code" label="Code">
        <input
          ref={codeInput}
          id="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          className={`${field} tracking-[0.3em]`}
          value={code}
          onChange={(e) => {
            const digits = e.target.value.replace(/\D/g, "").slice(0, 6)
            setCode(digits)
            if (digits.length === 6) void verify(digits)
          }}
        />
      </Field>
      {error && <p role="alert" className="text-sm text-red-700 dark:text-red-400">{error}</p>}
      {notice && <p className="text-sm text-muted-foreground" aria-live="polite">{notice}</p>}
      <button type="submit" className={primary} disabled={busy || code.length !== 6}>Sign in</button>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button type="button" className={secondary} disabled={wait > 0} onClick={() => void resend()}>
          {wait > 0 ? `Resend code (${wait}s)` : "Resend code"}
        </button>
        <button type="button" className={`${textLink} text-sm text-muted-foreground hover:text-foreground`} onClick={() => { setStep("email"); setCode(""); setError(null) }}>
          Use a different email
        </button>
      </div>
    </form>
  )
}

export function OrgAdminSignOut() {
  const router = useRouter()
  return (
    <button
      type="button"
      className={secondary}
      onClick={async () => {
        await post("/api/enterprise/nop/org-admin/signout", {})
        router.replace("/admin/enterprise/nop/sign-in")
        router.refresh()
      }}
    >
      Sign out
    </button>
  )
}
