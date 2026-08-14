"use client"

import { Suspense, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"

function AdminLoginForm() {
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError("")

    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    })

    setLoading(false)

    if (!res.ok) {
      // A 500 here means DASHBOARD_PASSWORD isn't set on the server for
      // this environment — a real config problem, not a wrong password.
      // Showing "Incorrect password" for both masked exactly that
      // distinction when the env var was missing on Preview but set on
      // Production.
      setError(
        res.status === 500
          ? "Server isn't configured for admin login yet (DASHBOARD_PASSWORD missing on this environment) — this isn't about your password."
          : "Incorrect password",
      )
      return
    }

    router.push("/dashboard")
    router.refresh()
  }

  return (
    <form className="mt-6 flex flex-col gap-4" onSubmit={handleSubmit}>
      <div>
        <label htmlFor="password" className="block text-sm font-medium mb-1.5">Password</label>
        <input id="password" type="password" required autoFocus value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-lg bg-white/[0.04] border border-white/12 px-3.5 py-2.5 text-sm focus:outline-none focus:border-[var(--brand-teal-bright)] focus:ring-1 focus:ring-[var(--brand-teal-bright)]"
          placeholder="••••••••" />
      </div>
      {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
      <button type="submit" disabled={loading}
        className="mt-2 w-full py-2.5 rounded-lg bg-[var(--brand-teal-bright)] text-white text-sm font-semibold hover:bg-[var(--brand-teal)] disabled:opacity-60 transition-colors">
        {loading ? "Signing in…" : "Sign in"}
      </button>
    </form>
  )
}

function ClientLoginForm({ next }: { next: string }) {
  const [email, setEmail] = useState("")
  const [error, setError] = useState("")
  const [working, setWorking] = useState(false)
  const router = useRouter()

  // One step, not two — get-code-then-manually-re-enter-it never bought
  // any real security (the code is already fully visible on this same
  // screen; requiring it to be typed into a second field doesn't prove
  // anything more), and the extra click was genuinely confusing: after
  // the code appeared, nothing looked like it had happened until you
  // noticed a second button had replaced the first one.
  async function handleContinue(e: React.FormEvent) {
    e.preventDefault()
    setWorking(true)
    setError("")

    const accessRes = await fetch("/api/auth/client-access", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    })
    const accessData = await accessRes.json().catch(() => ({}) as { error?: string; code?: string })

    if (!accessRes.ok || !accessData.code) {
      setWorking(false)
      setError(accessData.error ?? "Something went wrong")
      return
    }

    const loginRes = await fetch("/api/auth/client-login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, code: accessData.code }),
    })

    if (!loginRes.ok) {
      setWorking(false)
      setError("Couldn't sign you in — please try again.")
      return
    }

    router.push(next)
    router.refresh()
  }

  return (
    <form onSubmit={handleContinue} className="mt-6 flex flex-col gap-4">
      <div>
        <label htmlFor="email" className="block text-sm font-medium mb-1.5">Email</label>
        <input id="email" type="email" required autoFocus value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-lg bg-white/[0.04] border border-white/12 px-3.5 py-2.5 text-sm focus:outline-none focus:border-[var(--brand-teal-bright)] focus:ring-1 focus:ring-[var(--brand-teal-bright)]"
          placeholder="you@business.com" />
      </div>
      {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
      <button type="submit" disabled={working || !email}
        className="w-full py-2.5 rounded-lg bg-[var(--brand-teal-bright)] text-white text-sm font-semibold hover:bg-[var(--brand-teal)] disabled:opacity-60 transition-colors">
        {working ? "Signing you in…" : "Continue"}
      </button>
    </form>
  )
}

function LoginPageInner() {
  const [mode, setMode] = useState<"client" | "admin">("client")
  const searchParams = useSearchParams()
  // Where to land after signing in — e.g. /onboarding?plan=pro if that's
  // what sent them here. Only ever used for the client flow; admin always
  // goes to /dashboard regardless, since an onboarding redirect makes no
  // sense for the site-owner login.
  const next = searchParams.get("next") ?? "/dashboard"

  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2 font-semibold mb-8 justify-center">
          <span className="inline-block w-2 h-2 rounded-full bg-[var(--brand-teal-bright)]" />
          OneFlyer
        </div>
        <div className="rounded-2xl border border-white/10 bg-card p-7">
          <h1 className="text-xl font-semibold">{mode === "client" ? "Client Login" : "Admin Login"}</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {mode === "client" ? "Enter your email to get an access code and view your flyers." : "Sign in with the site admin password."}
          </p>

          {mode === "client" ? <ClientLoginForm next={next} /> : <AdminLoginForm />}

          <button onClick={() => setMode(mode === "client" ? "admin" : "client")} type="button"
            className="mt-5 w-full text-center text-xs text-muted-foreground hover:text-foreground transition-colors">
            {mode === "client" ? "Site admin? Sign in with password" : "← Back to client login"}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginPageInner />
    </Suspense>
  )
}
