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

/** Reads the local mirror without touching state, for the lazy initialiser. */
function storedTheme(): ThemePreference {
  if (typeof window === "undefined") return DEFAULT_THEME
  const v = localStorage.getItem(STORAGE_KEY)
  return v === "light" || v === "dark" || v === "system" ? v : DEFAULT_THEME
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
  // Seeded lazily rather than set inside the effect: the mirror is known
  // synchronously, and assigning it in an effect both trips the
  // cascading-render lint and paints one frame of the wrong theme.
  const [theme, setThemeState] = useState<ThemePreference>(storedTheme)
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
        setThemeState(d.theme)
        localStorage.setItem(STORAGE_KEY, d.theme)
      })
      .catch(() => {})
    return () => { alive = false }
  }, [])

  const setTheme = useCallback((t: ThemePreference) => {
    setThemeState(t)
    localStorage.setItem(STORAGE_KEY, t)
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
