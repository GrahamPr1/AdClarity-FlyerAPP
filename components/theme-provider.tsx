"use client"

import { createContext, useCallback, useContext, useEffect, useState, useSyncExternalStore } from "react"
import { DEFAULT_THEME, type ThemePreference } from "@/lib/types"

/**
 * Applies the account's theme to OneFlyer's OWN interface.
 *
 * WHAT THIS DELIBERATELY DOES NOT TOUCH: generated flyers. A flyer is a
 * complete standalone HTML document carrying the CLIENT's brand colours, and
 * the dashboard renders it inside an <iframe>, which is a separate document
 * with its own root element. Toggling `.dark` on this page's <html> cannot
 * cascade into it. That separation is the point — an agency user's personal
 * theme must never change what their client's printed flyer looks like.
 *
 * Reuses the existing CSS variable system rather than adding a parallel one:
 * `.dark` in globals.css redefines the same --background, --brand- and
 * --surface- tokens the whole app already reads, so nothing else changed.
 *
 * The preference lives on the ACCOUNT (GET/PUT /api/account/theme), with a
 * localStorage mirror used only to avoid a flash of the wrong theme on first
 * paint while the account value is in flight.
 */
const STORAGE_KEY = "oneflyer:theme"

interface ThemeContextValue {
  theme: ThemePreference
  /** What is actually on screen once "system" is resolved. */
  resolved: "light" | "dark"
  setTheme: (t: ThemePreference) => void
  saving: boolean
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: DEFAULT_THEME,
  resolved: "light",
  setTheme: () => {},
  saving: false,
})

export const useTheme = () => useContext(ThemeContext)

function systemPrefersDark(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches
}

function apply(theme: ThemePreference) {
  if (typeof document === "undefined") return
  const dark = theme === "dark" || (theme === "system" && systemPrefersDark())
  document.documentElement.classList.toggle("dark", dark)
  // Lets form controls, scrollbars and the like follow too.
  document.documentElement.style.colorScheme = dark ? "dark" : "light"
}

/** Reads the local mirror. Never called during render — see themeStore. */
function storedTheme(): ThemePreference {
  if (typeof window === "undefined") return DEFAULT_THEME
  const v = localStorage.getItem(STORAGE_KEY)
  return v === "light" || v === "dark" || v === "system" ? v : DEFAULT_THEME
}

/**
 * The localStorage mirror, as an external store.
 *
 * REPLACES `useState<ThemePreference>(storedTheme)`, whose lazy initialiser
 * read localStorage during the FIRST RENDER. On the server that returned
 * DEFAULT_THEME and on the client it returned whatever the client had
 * chosen, so for every user whose theme is not the default, the two renders
 * disagreed and React reported:
 *
 *   "Hydration failed because the server rendered text didn't match the
 *    client. As a result this tree will be regenerated on the client."
 *
 * Reproduced on /profile, where ThemeSetting renders the selected option as
 * text. React recovered, so nothing was visibly broken — but this is the
 * same class of client/server mismatch that twice took real pages down in
 * this codebase, and a live instance of it is not worth keeping.
 *
 * useSyncExternalStore is the sanctioned fix and is already the pattern used
 * by useSystemPrefersDark directly below, for the same reason: localStorage
 * IS an external store. It renders the SERVER snapshot during hydration and
 * then immediately re-renders with the client snapshot, which is a
 * deliberate, supported transition rather than a mismatch.
 *
 * Writes go through setStoredTheme so every subscriber updates together, and
 * subscribing to the `storage` event means a theme changed in one tab now
 * follows in the others — which the useState version never did.
 */
const listeners = new Set<() => void>()

function subscribeToStoredTheme(onChange: () => void): () => void {
  listeners.add(onChange)
  const onStorage = (e: StorageEvent) => {
    if (e.key === null || e.key === STORAGE_KEY) onChange()
  }
  if (typeof window !== "undefined") window.addEventListener("storage", onStorage)
  return () => {
    listeners.delete(onChange)
    if (typeof window !== "undefined") window.removeEventListener("storage", onStorage)
  }
}

function setStoredTheme(t: ThemePreference): void {
  if (typeof window !== "undefined") localStorage.setItem(STORAGE_KEY, t)
  for (const l of listeners) l()
}

function useStoredTheme(): ThemePreference {
  return useSyncExternalStore(
    subscribeToStoredTheme,
    storedTheme,
    // Server: the default. The VISUAL theme is not affected by this — the
    // pre-paint script in app/layout.tsx sets the class on <html> before
    // first paint and is untouched — so matching the server here costs no
    // flash, it only makes the first React render agree with the HTML.
    () => DEFAULT_THEME,
  )
}

/**
 * Subscribes to the OS colour-scheme setting.
 *
 * useSyncExternalStore rather than an effect writing state: the media query IS
 * an external store, and reading it this way keeps `resolved` a pure
 * derivation instead of a second copy of the truth that an effect has to keep
 * in sync.
 */
function useSystemPrefersDark(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      if (typeof window === "undefined") return () => {}
      const mq = window.matchMedia("(prefers-color-scheme: dark)")
      mq.addEventListener("change", onChange)
      return () => mq.removeEventListener("change", onChange)
    },
    () => systemPrefersDark(),
    () => false, // server: assume light, corrected on hydration
  )
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Read from the external store, not component state — see useStoredTheme.
  const theme = useStoredTheme()
  const [saving, setSaving] = useState(false)
  const systemDark = useSystemPrefersDark()
  const resolved: "light" | "dark" = theme === "dark" || (theme === "system" && systemDark) ? "dark" : "light"

  // Pure DOM side-effect, no state — re-runs whenever the choice or the OS
  // setting changes, which also covers "system" following the OS at sunset.
  useEffect(() => {
    apply(theme)
  }, [theme, systemDark])

  useEffect(() => {
    let alive = true
    fetch("/api/account/theme", { cache: "no-store" })
      .then((r) => r.json())
      .then((d: { theme?: ThemePreference }) => {
        if (!alive || !d.theme) return
        // The account is the source of truth; the mirror follows it.
        setStoredTheme(d.theme)
      })
      .catch(() => {})
    return () => { alive = false }
  }, [])

  const setTheme = useCallback((t: ThemePreference) => {
    setStoredTheme(t)
    setSaving(true)
    fetch("/api/account/theme", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ theme: t }),
    })
      .catch(() => {})
      .finally(() => setSaving(false))
  }, [])

  return (
    <ThemeContext.Provider value={{ theme, resolved, setTheme, saving }}>{children}</ThemeContext.Provider>
  )
}
