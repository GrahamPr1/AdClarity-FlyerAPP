"use client"

import { useTheme } from "@/components/theme-provider"
import { THEME_PREFERENCES, type ThemePreference } from "@/lib/types"

const LABELS: Record<ThemePreference, { label: string; hint: string }> = {
  light: { label: "Light", hint: "Always the light interface" },
  dark: { label: "Dark", hint: "Always the dark interface" },
  system: { label: "System", hint: "Follow your device setting" },
}

/**
 * Theme control, on the existing /profile page rather than a second settings
 * page — the account dropdown already points here.
 */
export function ThemeSetting() {
  const { theme, resolved, setTheme, saving } = useTheme()

  return (
    <section className="rounded-2xl border border-border bg-card p-6">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-lg tracking-tight">Appearance</h2>
        {saving && <span className="text-xs text-muted-foreground">Saving…</span>}
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        How OneFlyer looks for you. Saved to your account, so it follows you to other devices.
      </p>

      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        {THEME_PREFERENCES.map((option) => {
          const active = theme === option
          return (
            <button
              key={option}
              type="button"
              aria-pressed={active}
              onClick={() => setTheme(option)}
              className={`rounded-xl border px-4 py-3 text-left transition-colors ${
                active
                  ? "border-[var(--brand-teal-bright)] bg-[var(--brand-teal-tint)]"
                  : "border-border hover:bg-[var(--surface-sunken)]"
              }`}
            >
              <span className="block text-sm font-medium">{LABELS[option].label}</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">{LABELS[option].hint}</span>
            </button>
          )
        })}
      </div>

      <p className="mt-3 text-xs text-muted-foreground">
        Currently showing <span className="text-foreground">{resolved}</span>. This changes OneFlyer&rsquo;s own
        interface only — the flyers you generate keep your client&rsquo;s brand colors and look the same to whoever
        you send them to.
      </p>
    </section>
  )
}
