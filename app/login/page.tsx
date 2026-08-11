"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

export default function LoginPage() {
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
      setError("Incorrect password")
      return
    }

    router.push("/dashboard")
    router.refresh()
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2 font-semibold mb-8 justify-center">
          <span className="inline-block w-2 h-2 rounded-full bg-[var(--brand-teal-bright)]" />
          OneFlyer
        </div>
        <div className="rounded-2xl border border-white/10 bg-card p-7">
          <h1 className="text-xl font-semibold">Client Login</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">Sign in to view your deliverables.</p>
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
        </div>
      </div>
    </div>
  )
}
