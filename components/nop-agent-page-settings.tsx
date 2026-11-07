"use client"

import { useState } from "react"
import { useNop } from "@/components/nop-i18n"

/**
 * /agent/page: the agent's page link (copy, open), its QR as PNG or SVG, the
 * booking link, and the photo when the org allows one. The server checks
 * everything (booking hosts, photo bytes, switches, view-as); this only
 * reports what it said. Read-only while an admin views as the agent: copy,
 * open and download still work, nothing saves.
 */
export function NopAgentPageSettings(props: {
  link: string | null
  path: string | null
  bookingUrl: string | null
  hasPhoto: boolean
  photoAllowed: boolean
  readOnly: boolean
}) {
  const { t } = useNop()
  const { link, path, readOnly } = props
  const card = "rounded-2xl border border-border bg-card p-5"
  const button = "inline-flex min-h-11 items-center justify-center rounded-lg border border-border px-4 text-sm font-medium hover:bg-[var(--surface-soft)] disabled:opacity-50"

  return (
    <div className="flex flex-col gap-4">
      <section className={card} data-testid="page-link">
        {link && path ? (
          <>
            <p className="break-all font-medium" data-testid="page-link-url">{link}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <CopyButton text={link} className={button} />
              <a href={path} target="_blank" rel="noopener noreferrer" className={button}>{t("portal.page_open")}</a>
            </div>
          </>
        ) : (
          <p className="text-sm text-muted-foreground" data-testid="page-no-link">{t("portal.page_no_link")}</p>
        )}
      </section>

      {link && (
        <section className={card} aria-labelledby="page-qr" data-testid="page-qr">
          <h2 id="page-qr" className="font-semibold">{t("portal.page_qr_title")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("portal.page_qr_note")}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <a href="/api/enterprise/agent/page/qr?format=png" download className={button} data-testid="page-qr-png">{t("portal.page_qr_png")}</a>
            <a href="/api/enterprise/agent/page/qr?format=svg" download className={button} data-testid="page-qr-svg">{t("portal.page_qr_svg")}</a>
          </div>
        </section>
      )}

      <BookingLink initial={props.bookingUrl} readOnly={readOnly} card={card} button={button} />
      {props.photoAllowed && <Photo initial={props.hasPhoto} path={path} readOnly={readOnly} card={card} button={button} />}
    </div>
  )
}

function CopyButton({ text, className }: { text: string; className: string }) {
  const { t } = useNop()
  const [copied, setCopied] = useState(false)
  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }
  return (
    <button type="button" onClick={() => void copy()} className={className} data-testid="page-copy">
      <span aria-live="polite">{copied ? t("portal.page_copied") : t("portal.page_copy")}</span>
    </button>
  )
}

// Matches MAX_BOOKING_URL in lib/enterprise/portal/agent-page.ts (server-only, so not imported).
const MAX_BOOKING_URL = 500

const field =
  "block w-full min-h-11 rounded-lg bg-[var(--surface-soft)] border border-border px-3.5 py-2.5 text-base text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-[var(--brand-teal-bright)] focus:ring-1 focus:ring-[var(--brand-teal-bright)] transition-colors disabled:opacity-60"

function BookingLink({ initial, readOnly, card, button }: { initial: string | null; readOnly: boolean; card: string; button: string }) {
  const { t } = useNop()
  const [value, setValue] = useState(initial ?? "")
  const [state, setState] = useState<"idle" | "saving" | "saved" | "invalid" | "failed">("idle")

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setState("saving")
    try {
      const res = await fetch("/api/enterprise/agent/page", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ bookingUrl: value }) })
      if (res.status === 422) return setState("invalid")
      if (!res.ok) return setState("failed")
      const json = await res.json()
      setValue(json.bookingUrl ?? "")
      setState("saved")
    } catch {
      setState("failed")
    }
  }

  return (
    <form onSubmit={save} className={card} data-testid="page-booking">
      <label htmlFor="booking-url" className="block font-semibold">{t("portal.page_booking")}</label>
      <p id="booking-help" className="mt-1 text-sm text-muted-foreground">{t("portal.page_booking_help")}</p>
      <input id="booking-url" type="url" inputMode="url" aria-describedby="booking-help" placeholder="https://calendly.com/…" className={`${field} mt-3`}
        value={value} onChange={(e) => { setValue(e.target.value); setState("idle") }} maxLength={MAX_BOOKING_URL} disabled={readOnly} />
      {state === "invalid" && <p role="alert" className="mt-2 text-sm text-red-600 dark:text-red-400">{t("portal.page_booking_invalid")}</p>}
      {state === "failed" && <p role="alert" className="mt-2 text-sm text-red-600 dark:text-red-400">{t("portal.lead_save_failed")}</p>}
      <div className="mt-3 flex items-center gap-3">
        <button type="submit" disabled={readOnly || state === "saving"} title={readOnly ? t("portal.read_only") : undefined} className={button}>
          {state === "saving" ? t("portal.page_saving") : t("portal.page_save")}
        </button>
        {state === "saved" && <span role="status" className="text-sm text-muted-foreground">{t("portal.page_saved")}</span>}
      </div>
    </form>
  )
}

function Photo({ initial, path, readOnly, card, button }: { initial: boolean; path: string | null; readOnly: boolean; card: string; button: string }) {
  const { t, lang } = useNop()
  const [has, setHas] = useState(initial)
  const [version, setVersion] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<"invalid" | "failed" | null>(null)

  async function send(init: RequestInit) {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch("/api/enterprise/agent/page/photo", init)
      if (res.status === 422) return setError("invalid")
      if (!res.ok) return setError("failed")
      const json = await res.json()
      setHas(json.hasPhoto)
      setVersion((v) => v + 1)
    } catch {
      setError("failed")
    } finally {
      setBusy(false)
    }
  }

  function upload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ""
    if (!file) return
    const body = new FormData()
    body.set("file", file)
    void send({ method: "POST", body })
  }

  return (
    <section className={card} aria-labelledby="page-photo" data-testid="page-photo">
      <h2 id="page-photo" className="font-semibold">{t("portal.page_photo")}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{t("portal.page_photo_help")}</p>
      {has && path && (
        // eslint-disable-next-line @next/next/no-img-element -- our own switch-checked route
        <img src={`${path}/photo?v=${version}`} alt="" className="mt-3 h-24 w-24 rounded-full border border-border object-cover" data-testid="page-photo-preview" />
      )}
      {error && <p role="alert" className="mt-2 text-sm text-red-600 dark:text-red-400">{t(error === "invalid" ? "portal.page_photo_invalid" : "portal.lead_save_failed")}</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        <label className={`${button} ${readOnly || busy ? "pointer-events-none opacity-50" : "cursor-pointer"}`} title={readOnly ? t("portal.read_only") : undefined}>
          <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={upload} disabled={readOnly || busy} lang={lang} data-testid="page-photo-input" />
          {t("portal.page_photo_upload")}
        </label>
        {has && (
          <button type="button" onClick={() => void send({ method: "DELETE" })} disabled={readOnly || busy} title={readOnly ? t("portal.read_only") : undefined} className={button} data-testid="page-photo-remove">
            {t("portal.page_photo_remove")}
          </button>
        )}
      </div>
    </section>
  )
}
