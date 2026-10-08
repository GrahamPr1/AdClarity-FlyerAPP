"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useNop } from "@/components/nop-i18n"
import type { NopLang, NopStringKey } from "@/lib/enterprise/nop-i18n"

// The NOP agent's home: Basic Benefits' 8 templates, each with the agent's
// own thumbnail and direct downloads. Every server answer is the authority
// (roster status is re-read on each render); this only shows what it returns.

const PACKAGES = ["P1", "P2", "P3", "ALL"] as const
type Pkg = (typeof PACKAGES)[number]

const primary =
  "inline-flex min-h-11 items-center justify-center whitespace-nowrap rounded-lg bg-[var(--brand-teal-bright)] px-4 py-2.5 text-sm font-semibold text-[var(--primary-foreground)] hover:bg-[var(--brand-teal)] disabled:opacity-60 transition-colors"
const outline =
  "inline-flex min-h-11 items-center justify-center whitespace-nowrap rounded-lg border border-border px-3 py-2.5 text-sm font-medium hover:bg-[var(--surface-sunken)] disabled:opacity-60 transition-colors"

type Fmt = "print" | "home" | "social"
const DOWNLOADS: { fmt: Fmt; label: NopStringKey; hint: NopStringKey }[] = [
  { fmt: "print", label: "flyer.dl_print", hint: "flyer.dl_print_hint" },
  { fmt: "home", label: "flyer.dl_home", hint: "flyer.dl_home_hint" },
  { fmt: "social", label: "flyer.dl_social", hint: "flyer.dl_social_hint" },
]

function StatusBanner({ messageKey }: { messageKey: NopStringKey }) {
  const { t } = useNop()
  return (
    <p role="status" data-testid="nop-status" className="mb-6 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100">
      {t(messageKey)}
    </p>
  )
}

/** Fetches a rendered file and hands it to the browser as a download. */
function useNopDownload(template: string) {
  const { t } = useNop()
  const [busy, setBusy] = useState<Fmt | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function download(fmt: Fmt) {
    setBusy(fmt)
    setError(null)
    try {
      const res = await fetch(`/api/enterprise/nop/render/${template}?format=${fmt}`, { cache: "no-store" })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        setError(body?.message ?? t("render.failed"))
        return
      }
      const name = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") ?? "")?.[1]
      const url = URL.createObjectURL(await res.blob())
      const a = document.createElement("a")
      a.href = url
      a.download = name ?? `${template}.${fmt === "social" ? "png" : "pdf"}`
      document.body.appendChild(a)
      a.click()
      a.remove()
      // Delayed: Safari cancels a download whose object URL vanishes at once.
      window.setTimeout(() => URL.revokeObjectURL(url), 30_000)
    } catch {
      setError(t("common.network"))
    } finally {
      setBusy(null)
    }
  }
  return { busy, error, download }
}

/**
 * One template: the agent's own thumbnail over the kit's blank master (so
 * the card is never empty while it renders), a tap through to the full
 * preview, and the three downloads right on the card.
 */
function FlyerCard({ id, pkg, active }: { id: string; pkg: Pkg; active: boolean }) {
  const { t } = useNop()
  const { busy, error, download } = useNopDownload(id)
  const [thumb, setThumb] = useState<"loading" | "ready" | "failed">("loading")
  const name = `${t(`pkg.${pkg}`)} · ${t(`pkg.${pkg}_name`)}`

  const image = (
    <span className="relative block aspect-[17/22] w-full overflow-hidden border-b border-border bg-[var(--surface-soft)]">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`/api/enterprise/nop/thumbnail/${id}`} alt="" width={1080} height={1350} className="absolute inset-0 h-full w-full object-cover object-top" />
      {active && thumb !== "failed" && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`/api/enterprise/nop/render/${id}?format=thumb`}
          alt={t("flyer.preview_alt", { name })}
          width={612}
          height={792}
          loading="lazy"
          decoding="async"
          data-testid="nop-thumb"
          onLoad={() => setThumb("ready")}
          onError={() => setThumb("failed")}
          className={"absolute inset-0 h-full w-full object-cover object-top transition-opacity duration-300 " + (thumb === "ready" ? "opacity-100" : "opacity-0")}
        />
      )}
    </span>
  )

  return (
    <li data-template={id} className="flex flex-col overflow-hidden rounded-2xl border border-border bg-card">
      {active ? (
        <Link href={`/enterprise/nop/flyer/${id}`} aria-label={t("dash.open_flyer", { name })} className="block focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-[var(--brand-teal-bright)]">
          {image}
        </Link>
      ) : (
        image
      )}
      <div className="flex flex-1 flex-col gap-1 p-4">
        <p className="text-xs uppercase tracking-widest text-muted-foreground">{t(`pkg.${pkg}`)}</p>
        <p className="font-semibold leading-snug">{t(`pkg.${pkg}_name`)}</p>
        {thumb === "failed" && <p className="text-xs text-muted-foreground">{t("dash.thumb_failed")}</p>}
        {active && (
          <div className="mt-auto flex flex-col gap-2 pt-3">
            {DOWNLOADS.map((d, i) => (
              <button key={d.fmt} type="button" data-format={d.fmt} disabled={busy !== null}
                className={i === 0 ? primary : outline} onClick={() => void download(d.fmt)}>
                {busy === d.fmt ? t("flyer.downloading") : t(d.label)}
              </button>
            ))}
            {error && <p role="alert" className="text-sm text-red-700 dark:text-red-400">{error}</p>}
          </div>
        )}
      </div>
    </li>
  )
}

export function NopDashboard({ active, statusKey }: { active: boolean; statusKey: NopStringKey | null }) {
  const { lang, t } = useNop()
  // Which flyers to show. Follows the page language until the agent picks
  // one, then it is their own choice: an agent reading English may hand
  // out Spanish flyers, and switching the page language leaves it alone.
  const [chosen, setFlyerLang] = useState<NopLang | null>(null)
  const flyerLang = chosen ?? lang
  const code = flyerLang.toUpperCase()

  return (
    <div>
      {!active && statusKey && <StatusBanner messageKey={statusKey} />}

      <div role="group" aria-label={t("dash.flyer_lang")} className="mb-6 flex flex-wrap items-center gap-3">
        <span className="text-sm font-medium" aria-hidden="true">{t("dash.flyer_lang")}</span>
        <div className="inline-flex overflow-hidden rounded-full border border-border">
          {(["en", "es"] as const).map((l) => (
            <button
              key={l}
              type="button"
              aria-pressed={flyerLang === l}
              onClick={() => setFlyerLang(l)}
              className={
                "min-h-11 px-4 text-sm font-medium transition-colors " +
                (flyerLang === l ? "bg-[var(--brand-teal-bright)] text-[var(--primary-foreground)]" : "text-muted-foreground hover:text-foreground")
              }
            >
              {t(l === "en" ? "dash.flyer_lang_en" : "dash.flyer_lang_es")}
            </button>
          ))}
        </div>
      </div>

      <ul className="grid gap-5 sm:grid-cols-2" data-testid="nop-templates">
        {PACKAGES.map((pkg) => (
          <FlyerCard key={`NOP_${pkg}_${code}`} id={`NOP_${pkg}_${code}`} pkg={pkg} active={active} />
        ))}
      </ul>
    </div>
  )
}

/** The agent's actual flyer, rendered by the server, then the three downloads. */
export function NopFlyerPreview({ template, active, statusKey, agentName }: { template: string; active: boolean; statusKey: NopStringKey | null; agentName: string }) {
  const { t } = useNop()
  const { busy, error, download } = useNopDownload(template)
  const [preview, setPreview] = useState<{ url?: string; error?: string } | null>(null)

  // Rendered once on arrival; nothing is downloadable until it has rendered
  // (and passed the server's gates) at least once.
  useEffect(() => {
    if (!active) return
    let cancelled = false
    let url: string | undefined
    void fetch(`/api/enterprise/nop/render/${template}?format=preview`, { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) return { error: (await res.json().catch(() => null))?.message as string | undefined }
        return { blob: await res.blob() }
      })
      .catch(() => ({ error: undefined as string | undefined, network: true }))
      .then((r) => {
        if (cancelled) return
        if ("blob" in r && r.blob) {
          url = URL.createObjectURL(r.blob)
          setPreview({ url })
        } else setPreview({ error: ("network" in r ? t("common.network") : r.error) ?? t("render.failed") })
      })
    return () => {
      cancelled = true
      if (url) URL.revokeObjectURL(url)
    }
    // t only changes with the page language; re-render on template change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, template])

  if (!active) return statusKey ? <StatusBanner messageKey={statusKey} /> : null

  return (
    <div className="flex flex-col gap-6">
      <div className="overflow-hidden rounded-2xl border border-border bg-[var(--surface-soft)]">
        {preview?.url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview.url} alt={t("flyer.preview_alt", { name: agentName })} width={816} height={1056} data-testid="nop-preview" className="block h-auto w-full" />
        ) : (
          <p role={preview?.error ? "alert" : "status"} className={"p-6 text-sm " + (preview?.error ? "text-red-700 dark:text-red-400" : "text-muted-foreground")}>
            {preview?.error ?? t("flyer.rendering")}
          </p>
        )}
      </div>

      {preview?.url && (
        <section aria-labelledby="nop-downloads" className="rounded-2xl border border-border bg-card p-5">
          <h2 id="nop-downloads" className="mb-3 font-semibold">{t("flyer.download_title")}</h2>
          <ul className="flex flex-col gap-3">
            {DOWNLOADS.map((d) => (
              <li key={d.fmt} className="flex flex-wrap items-center justify-between gap-3">
                <span className="text-sm text-muted-foreground">{t(d.hint)}</span>
                <button type="button" className={primary} disabled={busy !== null} onClick={() => void download(d.fmt)} data-format={d.fmt}>
                  {busy === d.fmt ? t("flyer.downloading") : t(d.label)}
                </button>
              </li>
            ))}
          </ul>
          {error && <p role="alert" className="mt-3 text-sm text-red-700 dark:text-red-400">{error}</p>}
        </section>
      )}

      <Link href="/enterprise/nop/profile" className="inline-flex min-h-11 items-center text-sm text-[var(--brand-teal-bright)] hover:text-[var(--brand-teal)]">
        {t("flyer.edit_details")}
      </Link>
    </div>
  )
}
