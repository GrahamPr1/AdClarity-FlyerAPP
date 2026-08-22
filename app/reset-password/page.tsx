"use client"

import { Suspense, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"

function ResetPasswordForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const email = searchParams.get("email") ?? ""
  const token = searchParams.get("token") ?? ""

  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [error, setError] = useState("")
  const [working, setWorking] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")

    if (password !== confirm) {
      setError("Passwords don't match.")
      return
    }

    setWorking(true)
    const res = await fetch("/api/auth/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, token, password }),
    })
    const data = await res.json().catch(() => ({}) as { error?: string })

    if (!res.ok) {
      setWorking(false)
      setError(data.error ?? "Something went wrong")
      return
    }

    router.push("/dashboard")
    router.refresh()
  }

  if (!email || !token) {
    return <p className="mt-6 text-sm text-red-400">This reset link is missing required information — please request a new one from the login page.</p>
  }

  return (
    <form className="mt-6 flex flex-col gap-4" onSubmit={handleSubmit}>
      <div>
        <label htmlFor="password" className="block text-sm font-medium mb-1.5">New password</label>
        <input id="password" type="password" required autoFocus minLength={8} value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-lg bg-white/[0.04] border border-white/12 px-3.5 py-2.5 text-sm focus:outline-none focus:border-[var(--brand-teal-bright)] focus:ring-1 focus:ring-[var(--brand-teal-bright)]"
          placeholder="At least 8 characters" />
      </div>
      <div>
        <label htmlFor="confirm" className="block text-sm font-medium mb-1.5">Confirm new password</label>
        <input id="confirm" type="password" required minLength={8} value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className="w-full rounded-lg bg-white/[0.04] border border-white/12 px-3.5 py-2.5 text-sm focus:outline-none focus:border-[var(--brand-teal-bright)] focus:ring-1 focus:ring-[var(--brand-teal-bright)]" />
      </div>
      {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
      <button type="submit" disabled={working}
        className="mt-2 w-full py-2.5 rounded-lg bg-[var(--brand-teal-bright)] text-white text-sm font-semibold hover:bg-[var(--brand-teal)] disabled:opacity-60 transition-colors">
        {working ? "Saving…" : "Set new password"}
      </button>
    </form>
  )
}

export default function ResetPasswordPage() {
  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2 font-semibold mb-8 justify-center">
          <span className="inline-block w-2 h-2 rounded-full bg-[var(--brand-teal-bright)]" />
          OneFlyer
        </div>
        <div className="rounded-2xl border border-white/10 bg-card p-7">
          <h1 className="text-xl font-semibold">Set a new password</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">Choose a password you&apos;ll use to log in from now on.</p>
          <Suspense fallback={null}>
            <ResetPasswordForm />
          </Suspense>
        </div>
      </div>
    </div>
  )
}
