"use client"

import { useEffect, useRef, useState } from "react"

/**
 * Signed-in indicator for the site header.
 *
 * Renders NOTHING until it knows — not a signed-out state. The marketing
 * pages are statically cached, so this cannot be server-rendered without
 * either breaking that cache or serving one visitor's account state to
 * everyone; it resolves client-side instead. Flashing "Log In" at someone who
 * is already signed in, for the moment before the check returns, is the exact
 * confusion this component exists to remove.
 */
interface Session {
  signedIn: boolean
  email?: string | null
  isAdmin?: boolean
}

function initialFor(email: string | null | undefined, isAdmin: boolean | undefined): string {
  if (isAdmin) return "A"
  return (email?.trim()?.[0] ?? "?").toUpperCase()
}

export function AccountMenu({ variant = "bar" }: { variant?: "bar" | "stacked" }) {
  const [session, setSession] = useState<Session | null>(null)
  const [open, setOpen] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let alive = true
    fetch("/api/auth/session", { cache: "no-store" })
      .then((r) => r.json())
      .then((d: Session) => { if (alive) setSession(d) })
      .catch(() => { if (alive) setSession({ signedIn: false }) })
    return () => { alive = false }
  }, [])

  // Close on an outside click, the behaviour every dropdown is expected to have.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", onDown)
    return () => document.removeEventListener("mousedown", onDown)
  }, [open])

  async function signOut() {
    setSigningOut(true)
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {})
    // Full reload rather than a router push: the header is rendered inside
    // statically cached pages, so the signed-out state has to come from a
    // fresh document.
    window.location.href = "/"
  }

  // Unknown, or genuinely signed out — the existing Log In link stays.
  if (!session?.signedIn) return null

  const label = session.isAdmin ? "Admin" : (session.email ?? "Account")

  if (variant === "stacked") {
    return (
      <>
        <a href="/dashboard" className="px-4 py-3 text-sm text-foreground hover:bg-[var(--surface-sunken)] rounded-xl transition-colors">
          Dashboard
        </a>
        <a href="/profile" className="px-4 py-3 text-sm text-muted-foreground hover:text-foreground hover:bg-[var(--surface-sunken)] rounded-xl transition-colors">
          {label}
        </a>
        <button
          onClick={signOut}
          disabled={signingOut}
          className="px-4 py-3 text-left text-sm text-muted-foreground hover:text-foreground hover:bg-[var(--surface-sunken)] rounded-xl transition-colors disabled:opacity-60"
        >
          {signingOut ? "Signing out…" : "Sign out"}
        </button>
      </>
    )
  }

  return (
    <div className="relative" ref={wrapRef}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Signed in as ${label}`}
        title={`Signed in as ${label}`}
        className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--brand-teal-bright)] text-[13px] font-semibold text-white transition-colors hover:bg-[var(--brand-teal)]"
      >
        {initialFor(session.email, session.isAdmin)}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-2 w-56 overflow-hidden rounded-xl border border-border bg-card shadow-lg"
        >
          <p className="truncate border-b border-border px-3 py-2.5 text-xs text-muted-foreground" title={label}>
            Signed in as <span className="text-foreground">{label}</span>
          </p>
          <a href="/dashboard" role="menuitem" className="block px-3 py-2.5 text-sm hover:bg-[var(--surface-sunken)]">Dashboard</a>
          <a href="/profile" role="menuitem" className="block px-3 py-2.5 text-sm hover:bg-[var(--surface-sunken)]">Account</a>
          <button
            onClick={signOut}
            disabled={signingOut}
            role="menuitem"
            className="block w-full border-t border-border px-3 py-2.5 text-left text-sm hover:bg-[var(--surface-sunken)] disabled:opacity-60"
          >
            {signingOut ? "Signing out…" : "Sign out"}
          </button>
        </div>
      )}
    </div>
  )
}

/** True once we know the visitor is signed in — lets the header hide "Log In". */
export function useIsSignedIn(): boolean | null {
  const [signedIn, setSignedIn] = useState<boolean | null>(null)
  useEffect(() => {
    let alive = true
    fetch("/api/auth/session", { cache: "no-store" })
      .then((r) => r.json())
      .then((d: Session) => { if (alive) setSignedIn(Boolean(d.signedIn)) })
      .catch(() => { if (alive) setSignedIn(false) })
    return () => { alive = false }
  }, [])
  return signedIn
}

/**
 * The homepage footer's Account column.
 *
 * Separate from the header because the footer is its own nav — it kept
 * offering "Log In" to someone already signed in, which is the exact
 * ambiguity this work is meant to remove.
 */
export function FooterAccountLinks({ className = "" }: { className?: string }) {
  const signedIn = useIsSignedIn()
  if (signedIn === null) return <span className={className} aria-hidden="true">&nbsp;</span>
  if (!signedIn) return <a href="/login" className={className}>Log In</a>
  return (
    <>
      <a href="/dashboard" className={className}>Dashboard</a>
      <SignOutLink className={className} />
    </>
  )
}

function SignOutLink({ className }: { className: string }) {
  const [busy, setBusy] = useState(false)
  return (
    <button
      className={`${className} text-left`}
      disabled={busy}
      onClick={async () => {
        setBusy(true)
        await fetch("/api/auth/logout", { method: "POST" }).catch(() => {})
        window.location.href = "/"
      }}
    >
      {busy ? "Signing out…" : "Sign out"}
    </button>
  )
}
