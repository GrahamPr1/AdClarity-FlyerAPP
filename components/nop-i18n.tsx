"use client"

import { createContext, Fragment, useContext, useEffect, useState, type ReactNode } from "react"
import { useRouter } from "next/navigation"
import { tNop, type NopLang, type NopStringKey } from "@/lib/enterprise/nop-i18n"

// Client side of NOP language: the active language for a NOP page, the
// EN/ES toggle, and keeping <html lang> in step with it.

type NopI18n = {
  lang: NopLang
  t: (key: NopStringKey, vars?: Record<string, string | number>) => string
  /** Like t, but placeholders may be React nodes (e.g. a bold name). */
  rich: (key: NopStringKey, vars: Record<string, ReactNode>) => ReactNode
}

const Ctx = createContext<NopI18n | null>(null)

export function useNop(): NopI18n {
  const v = useContext(Ctx)
  if (!v) throw new Error("useNop must be used inside NopLangProvider")
  return v
}

/** Sets the nop_lang cookie, and the agent's saved preference if they are registered. */
export async function saveNopLanguage(lang: NopLang): Promise<boolean> {
  try {
    const res = await fetch("/api/enterprise/nop/language", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lang }),
    })
    return res.ok
  } catch {
    return false
  }
}

export function NopLangProvider({
  lang,
  persist = false,
  children,
}: {
  lang: NopLang
  /** True when the language came from the saved profile rather than a cookie: write the cookie so sign-in pages match later. */
  persist?: boolean
  children: ReactNode
}) {
  // <html lang> is set before first paint by NopHtmlLangScript; this keeps it
  // right after a toggle and puts it back for the (English) pages outside NOP.
  useEffect(() => {
    document.documentElement.lang = lang
    return () => {
      document.documentElement.lang = "en"
    }
  }, [lang])

  useEffect(() => {
    if (persist) void saveNopLanguage(lang)
  }, [persist, lang])

  const t = (key: NopStringKey, vars?: Record<string, string | number>) => tNop(lang, key, vars)
  const rich = (key: NopStringKey, vars: Record<string, ReactNode>) => {
    const parts = tNop(lang, key).split(/(\{\w+\})/g)
    return parts.map((part, i) => {
      const m = /^\{(\w+)\}$/.exec(part)
      return <Fragment key={i}>{m && m[1] in vars ? vars[m[1]] : part}</Fragment>
    })
  }
  return <Ctx.Provider value={{ lang, t, rich }}>{children}</Ctx.Provider>
}

/**
 * EN / ES. Two real buttons with aria-pressed; each label is bilingual so a
 * screen-reader user can find their language whichever one is active.
 * By default the server page re-renders in place (router.refresh), which
 * keeps every client component's state — a registration step in progress
 * stays where it is.
 */
export function NopLanguageToggle({ onChange }: { onChange?: (lang: NopLang) => void }) {
  const { lang, t } = useNop()
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  async function choose(next: NopLang) {
    if (next === lang || busy) return
    setBusy(true)
    await saveNopLanguage(next)
    setBusy(false)
    if (onChange) onChange(next)
    else router.refresh()
  }

  const button = (code: NopLang, label: string) => (
    <button
      type="button"
      lang={code}
      aria-label={label}
      aria-pressed={lang === code}
      disabled={busy}
      onClick={() => void choose(code)}
      className={
        "min-h-11 min-w-11 px-3 text-xs font-semibold transition-colors disabled:opacity-60 " +
        (lang === code
          ? "bg-[var(--brand-teal-bright)] text-[var(--primary-foreground)]"
          : "text-muted-foreground hover:text-foreground hover:bg-[var(--surface-sunken)]")
      }
    >
      {code.toUpperCase()}
    </button>
  )

  return (
    <div role="group" aria-label={t("lang.group")} className="inline-flex overflow-hidden rounded-full border border-border">
      {button("en", t("lang.en"))}
      {button("es", t("lang.es"))}
    </div>
  )
}
