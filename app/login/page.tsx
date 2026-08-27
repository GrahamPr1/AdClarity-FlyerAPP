"use client"

import { Suspense, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { trackEvent } from "@/lib/analytics"

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

type ClientMode = "login" | "signup" | "forgot"

function EmailField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label htmlFor="email" className="block text-sm font-medium mb-1.5">Email</label>
      <input id="email" type="email" required autoFocus value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg bg-white/[0.04] border border-white/12 px-3.5 py-2.5 text-sm focus:outline-none focus:border-[var(--brand-teal-bright)] focus:ring-1 focus:ring-[var(--brand-teal-bright)]"
        placeholder="you@business.com" />
    </div>
  )
}

function ClientLoginForm({
  next,
  mode,
  onModeChange,
}: {
  next: string
  mode: ClientMode
  onModeChange: (mode: ClientMode) => void
}) {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const [working, setWorking] = useState(false)

  function switchMode(newMode: ClientMode) {
    onModeChange(newMode)
    setError("")
    setNotice("")
    setPassword("")
    setConfirmPassword("")
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setWorking(true)
    setError("")

    // Wrapped: an unwrapped fetch that rejects (offline, DNS, connection
    // reset) left `working` true forever, so the button sat on "Signing you
    // in…" with no error and no way to retry short of reloading.
    let res: Response
    try {
      res = await fetch("/api/auth/client-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      })
    } catch {
      setWorking(false)
      setError("Couldn't reach the server — check your connection and try again.")
      return
    }
    const data = await res.json().catch(() => ({}) as { error?: string; message?: string })

    if (!res.ok) {
      setWorking(false)
      // "no_password_set" covers both a genuinely new client and an
      // account that predates password auth — either way, the fix is the
      // same emailed link, so point them at it directly rather than
      // leaving them stuck on a login that can never succeed.
      setError(
        data.message ??
          (data.error === "no_password_set"
            ? 'No password set for this email yet — use "Forgot password" above to set one.'
            : res.status === 401
              ? "That email and password don't match. Check them and try again, or use \"Forgot password\"."
              : "We couldn't sign you in just now. Your account is fine — please try again in a moment."),
      )
      return
    }

    router.push(next)
    router.refresh()
  }

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    if (password !== confirmPassword) {
      setError("Those two passwords don't match — retype them and try again.")
      return
    }
    setWorking(true)
    trackEvent("signup_started")

    // Same missing-try/catch bug as handleLogin had: a network failure left
    // the button stuck on "Creating account…" indefinitely.
    let res: Response
    try {
      res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      })
    } catch {
      setWorking(false)
      setError("Couldn't reach the server — check your connection and try again.")
      return
    }
    const data = await res.json().catch(() => ({}) as { error?: string })

    if (!res.ok) {
      setWorking(false)
      setError(
        data.error ??
          "We couldn't create your account just now. Nothing was charged or saved — please try again in a moment.",
      )
      return
    }

    trackEvent("signup_completed")
    router.push(next)
    router.refresh()
  }

  async function handleForgot(e: React.FormEvent) {
    e.preventDefault()
    setWorking(true)
    setError("")
    setNotice("")

    const res = await fetch("/api/auth/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    })
    const data = await res.json().catch(() => ({}) as { error?: string })
    setWorking(false)

    if (!res.ok) {
      setError(data.error ?? "Something went wrong")
      return
    }
    setNotice("If that email has an account, a link to set a new password is on its way — check your inbox.")
  }

  if (mode === "signup") {
    return (
      <>
        <form onSubmit={handleSignup} className="mt-6 flex flex-col gap-4">
          <EmailField value={email} onChange={setEmail} />
          <div>
            <label htmlFor="password" className="block text-sm font-medium mb-1.5">Password</label>
            <input id="password" type="password" required minLength={8} value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg bg-white/[0.04] border border-white/12 px-3.5 py-2.5 text-sm focus:outline-none focus:border-[var(--brand-teal-bright)] focus:ring-1 focus:ring-[var(--brand-teal-bright)]"
              placeholder="At least 8 characters"
              aria-describedby="password-requirements" />
            {/* Stated up front rather than only surfacing as a rejected
                submit — the rule is trivial, and finding it out by failing is
                a needless round trip. Live feedback once they start typing. */}
            <p id="password-requirements"
              className={`mt-1.5 text-xs ${password.length === 0 ? "text-muted-foreground" : password.length >= 8 ? "text-emerald-400" : "text-amber-300"}`}>
              {password.length === 0
                ? "Must be at least 8 characters."
                : password.length >= 8
                  ? "Long enough."
                  : `${8 - password.length} more character${8 - password.length === 1 ? "" : "s"} needed.`}
            </p>
          </div>
          <div>
            <label htmlFor="confirmPassword" className="block text-sm font-medium mb-1.5">Confirm password</label>
            <input id="confirmPassword" type="password" required minLength={8} value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full rounded-lg bg-white/[0.04] border border-white/12 px-3.5 py-2.5 text-sm focus:outline-none focus:border-[var(--brand-teal-bright)] focus:ring-1 focus:ring-[var(--brand-teal-bright)]" />
          </div>
          {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
          <button type="submit" disabled={working}
            className="w-full py-2.5 rounded-lg bg-[var(--brand-teal-bright)] text-white text-sm font-semibold hover:bg-[var(--brand-teal)] disabled:opacity-60 transition-colors">
            {working ? "Creating account…" : "Create account"}
          </button>
        </form>
        <button onClick={() => switchMode("login")} type="button"
          className="mt-4 w-full text-center text-xs text-muted-foreground hover:text-foreground transition-colors">
          Already have an account? Log in
        </button>
      </>
    )
  }

  if (mode === "forgot") {
    return (
      <>
        <form onSubmit={handleForgot} className="mt-6 flex flex-col gap-4">
          <EmailField value={email} onChange={setEmail} />
          {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
          {notice && <p className="text-sm text-[var(--brand-teal-bright)]">{notice}</p>}
          <button type="submit" disabled={working || !email}
            className="w-full py-2.5 rounded-lg bg-[var(--brand-teal-bright)] text-white text-sm font-semibold hover:bg-[var(--brand-teal)] disabled:opacity-60 transition-colors">
            {working ? "Sending…" : "Email me a reset link"}
          </button>
        </form>
        <button onClick={() => switchMode("login")} type="button"
          className="mt-4 w-full text-center text-xs text-muted-foreground hover:text-foreground transition-colors">
          ← Back to login
        </button>
      </>
    )
  }

  return (
    <>
      <form onSubmit={handleLogin} className="mt-6 flex flex-col gap-4">
        <EmailField value={email} onChange={setEmail} />
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label htmlFor="password" className="block text-sm font-medium">Password</label>
            <button type="button" onClick={() => switchMode("forgot")}
              className="text-xs text-[var(--brand-teal-bright)] hover:text-[var(--brand-teal)] transition-colors">
              Forgot password?
            </button>
          </div>
          <input id="password" type="password" required value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-lg bg-white/[0.04] border border-white/12 px-3.5 py-2.5 text-sm focus:outline-none focus:border-[var(--brand-teal-bright)] focus:ring-1 focus:ring-[var(--brand-teal-bright)]"
            placeholder="••••••••" />
        </div>
        {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
        <button type="submit" disabled={working || !email || !password}
          className="w-full py-2.5 rounded-lg bg-[var(--brand-teal-bright)] text-white text-sm font-semibold hover:bg-[var(--brand-teal)] disabled:opacity-60 transition-colors">
          {working ? "Signing you in…" : "Log in"}
        </button>
      </form>
      {/* Goes to /onboarding rather than flipping this form to signup mode:
          someone with no account wants to start a campaign, and /onboarding
          bounces them through account creation on the way with `next` set —
          so they land where they were actually trying to go. */}
      <a href="/onboarding"
        className="mt-4 block w-full text-center text-xs text-muted-foreground hover:text-foreground transition-colors">
        Don&apos;t have an account? Sign up
      </a>
    </>
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

  // Anyone arriving from the landing page's "Create My First Campaign — Free"
  // CTA is trying to sign UP, not sign in — they've never been here. Starting
  // them on the login form meant the highest-intent click on the whole site
  // landed on a password field for an account they don't have, with the real
  // action hidden behind a small "New here?" link underneath.
  const wantsToStart = next.startsWith("/onboarding")
  const [clientMode, setClientMode] = useState<ClientMode>(wantsToStart ? "signup" : "login")

  const heading =
    mode === "admin"
      ? "Admin Login"
      : clientMode === "signup"
        ? "Create your account"
        : clientMode === "forgot"
          ? "Reset your password"
          : "Client Login"

  const subheading =
    mode === "admin"
      ? "Sign in with the site admin password."
      : clientMode === "signup"
        ? wantsToStart
          ? "One quick step, then you're straight into your first campaign. We need an account so your flyers are saved and only you can see them."
          : "Set up an email and password to save your flyers."
        : clientMode === "forgot"
          ? "We'll email you a link to set a new one."
          : "Log in with your email and password to see your own flyers."

  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="w-full max-w-sm">
        {/* The wordmark is the only way back out of login/signup — without it
            someone who lands here by mistake has no route to the homepage. */}
        <div className="flex justify-center mb-8">
          <Link
            href="/"
            aria-label="OneFlyer — back to homepage"
            className="inline-flex items-center gap-2 font-semibold rounded-md px-2 py-1 -mx-2 transition-colors hover:text-[var(--brand-teal-bright)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-teal-bright)]"
          >
            <span className="inline-block w-2 h-2 rounded-full bg-[var(--brand-teal-bright)]" />
            OneFlyer
          </Link>
        </div>
        <div className="rounded-2xl border border-white/10 bg-card p-7">
          <h1 className="text-xl font-semibold">{heading}</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">{subheading}</p>

          {mode === "client" ? (
            <ClientLoginForm next={next} mode={clientMode} onModeChange={setClientMode} />
          ) : (
            <AdminLoginForm />
          )}

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
