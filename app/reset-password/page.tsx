"use client"

import { Suspense, useState, useSyncExternalStore } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { NOP_LANG_COOKIE, parseNopLang, tNop, type NopLang, type NopStringKey } from "@/lib/enterprise/nop-i18n"
import { NopLangProvider, NopLanguageToggle } from "@/components/nop-i18n"

/**
 * NOP visitors only: their chosen language (nop_lang cookie), else the `lang`
 * the reset email's link carries (added only for NOP visitors — see
 * /api/auth/forgot-password). null for everyone else, who then see the
 * original English literals below, untouched.
 */
function nopResetLang(): NopLang | null {
  const m = document.cookie.match(new RegExp(`(?:^|;\\s*)${NOP_LANG_COOKIE}=([^;]*)`))
  return parseNopLang(m ? decodeURIComponent(m[1]) : null) ?? parseNopLang(new URLSearchParams(window.location.search).get("lang"))
}

/** The cookie and URL don't change under a mounted page, so there is nothing to subscribe to. */
const noSubscribe = () => () => {}

/** The Spanish string for a NOP Spanish visitor; otherwise the original English, unchanged. */
function pick(es: boolean, key: NopStringKey, english: string): string {
  return es ? tNop("es", key) : english
}

function ResetPasswordForm({ nopLang }: { nopLang: NopLang | null }) {
  const es = nopLang === "es"
  const L = (key: NopStringKey, english: string) => pick(es, key, english)
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
      setError(L("reset.err_mismatch", "Passwords don't match."))
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
      // A NOP Spanish visitor gets the same outcome in Spanish, keyed on the
      // route's status; the route itself is unchanged.
      if (es) {
        setError(
          tNop("es", res.status === 401 ? "reset.err_invalid"
            : res.status === 422 && /password/i.test(data.error ?? "") ? "auth.err_pw_short"
            : res.status === 422 ? "reset.err_missing"
            : "auth.err_generic"),
        )
        return
      }
      setError(data.error ?? "Something went wrong")
      return
    }

    router.push("/dashboard")
    router.refresh()
  }

  if (!email || !token) {
    return <p className="mt-6 text-sm text-red-400">{L("reset.err_missing", "This reset link is missing required information — please request a new one from the login page.")}</p>
  }

  return (
    <form className="mt-6 flex flex-col gap-4" onSubmit={handleSubmit}>
      <div>
        <label htmlFor="password" className="block text-sm font-medium mb-1.5">{L("reset.new_pw", "New password")}</label>
        <input id="password" type="password" required autoFocus minLength={8} value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-lg bg-[var(--surface-soft)] border border-border px-3.5 py-2.5 text-sm focus:outline-none focus:border-[var(--brand-teal-bright)] focus:ring-1 focus:ring-[var(--brand-teal-bright)]"
          placeholder={L("auth.pw_placeholder", "At least 8 characters")} />
      </div>
      <div>
        <label htmlFor="confirm" className="block text-sm font-medium mb-1.5">{L("reset.confirm_pw", "Confirm new password")}</label>
        <input id="confirm" type="password" required minLength={8} value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className="w-full rounded-lg bg-[var(--surface-soft)] border border-border px-3.5 py-2.5 text-sm focus:outline-none focus:border-[var(--brand-teal-bright)] focus:ring-1 focus:ring-[var(--brand-teal-bright)]" />
      </div>
      {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
      <button type="submit" disabled={working}
        className="mt-2 w-full py-2.5 rounded-lg bg-[var(--brand-teal-bright)] text-[var(--primary-foreground)] text-sm font-semibold hover:bg-[var(--brand-teal)] disabled:opacity-60 transition-colors">
        {working ? L("reset.saving", "Saving…") : L("reset.submit", "Set new password")}
      </button>
    </form>
  )
}

export default function ResetPasswordPage() {
  // The heading below is server-rendered, so the language is read through
  // useSyncExternalStore: null while hydrating (matching that HTML), then the
  // browser's value. Everyone but NOP visitors stays null and sees the page
  // exactly as before. A toggle click overrides it.
  const detected = useSyncExternalStore(noSubscribe, nopResetLang, () => null)
  const [chosen, setChosen] = useState<NopLang | null>(null)
  const nopLang = chosen ?? detected
  const es = nopLang === "es"

  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2 font-semibold mb-8 justify-center">
          <span className="inline-block w-2 h-2 rounded-full bg-[var(--brand-teal-bright)]" />
          OneFlyer
        </div>
        {/* NOP visitors only. The provider also sets <html lang> for them. */}
        {nopLang && (
          <NopLangProvider lang={nopLang}>
            <div className="mb-6 flex justify-center">
              <NopLanguageToggle onChange={setChosen} />
            </div>
          </NopLangProvider>
        )}
        <div className="rounded-2xl border border-border bg-card p-7">
          <h1 className="text-xl">{pick(es, "reset.heading", "Set a new password")}</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">{pick(es, "reset.sub", "Choose a password you'll use to log in from now on.")}</p>
          <Suspense fallback={null}>
            <ResetPasswordForm nopLang={nopLang} />
          </Suspense>
        </div>
      </div>
    </div>
  )
}
