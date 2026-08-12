"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

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

function ClientLoginForm() {
  const [email, setEmail] = useState("")
  const [code, setCode] = useState("")
  const [issuedCode, setIssuedCode] = useState("")
  const [error, setError] = useState("")
  const [requesting, setRequesting] = useState(false)
  const [signingIn, setSigningIn] = useState(false)
  const router = useRouter()

  async function handleGetCode(e: React.FormEvent) {
    e.preventDefault()
    setRequesting(true)
    setError("")
    setIssuedCode("")

    const res = await fetch("/api/auth/client-access", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    })
    const data = await res.json()
    setRequesting(false)

    if (!res.ok) {
      setError(data.error ?? "Something went wrong")
      return
    }

    setIssuedCode(data.code)
    setCode(data.code)
  }

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault()
    setSigningIn(true)
    setError("")

    const res = await fetch("/api/auth/client-login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, code }),
    })

    setSigningIn(false)

    if (!res.ok) {
      setError("Invalid or expired code")
      return
    }

    router.push("/dashboard")
    router.refresh()
  }

  return (
    <div className="mt-6 flex flex-col gap-4">
      <div>
        <label htmlFor="email" className="block text-sm font-medium mb-1.5">Email</label>
        <input id="email" type="email" required autoFocus value={email}
          onChange={(e) => { setEmail(e.target.value); setIssuedCode(""); setCode("") }}
          className="w-full rounded-lg bg-white/[0.04] border border-white/12 px-3.5 py-2.5 text-sm focus:outline-none focus:border-[var(--brand-teal-bright)] focus:ring-1 focus:ring-[var(--brand-teal-bright)]"
          placeholder="you@business.com" />
      </div>

      {!issuedCode ? (
        <button onClick={handleGetCode} disabled={requesting || !email} type="button"
          className="w-full py-2.5 rounded-lg bg-[var(--brand-teal-bright)] text-white text-sm font-semibold hover:bg-[var(--brand-teal)] disabled:opacity-60 transition-colors">
          {requesting ? "Generating code…" : "Get my access code"}
        </button>
      ) : (
        <>
          <div className="rounded-lg bg-[var(--brand-teal-tint)] px-4 py-3 text-sm">
            Your access code: <span className="font-mono font-semibold tracking-wider">{issuedCode}</span>
            <p className="mt-1 text-xs text-foreground/70">Valid for 15 minutes. Confirm below to continue.</p>
          </div>
          <div>
            <label htmlFor="code" className="block text-sm font-medium mb-1.5">Access code</label>
            <input id="code" required value={code} onChange={(e) => setCode(e.target.value)}
              className="w-full rounded-lg bg-white/[0.04] border border-white/12 px-3.5 py-2.5 text-sm font-mono tracking-wider focus:outline-none focus:border-[var(--brand-teal-bright)] focus:ring-1 focus:ring-[var(--brand-teal-bright)]" />
          </div>
          <button onClick={handleSignIn} disabled={signingIn || !code} type="button"
            className="w-full py-2.5 rounded-lg bg-[var(--brand-teal-bright)] text-white text-sm font-semibold hover:bg-[var(--brand-teal)] disabled:opacity-60 transition-colors">
            {signingIn ? "Signing in…" : "Sign in"}
          </button>
        </>
      )}

      {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
    </div>
  )
}

export default function LoginPage() {
  const [mode, setMode] = useState<"client" | "admin">("client")

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

          {mode === "client" ? <ClientLoginForm /> : <AdminLoginForm />}

          <button onClick={() => setMode(mode === "client" ? "admin" : "client")} type="button"
            className="mt-5 w-full text-center text-xs text-muted-foreground hover:text-foreground transition-colors">
            {mode === "client" ? "Site admin? Sign in with password" : "← Back to client login"}
          </button>
        </div>
      </div>
    </div>
  )
}
