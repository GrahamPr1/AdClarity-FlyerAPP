"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useNop } from "@/components/nop-i18n"
import type { NopStringKey } from "@/lib/enterprise/nop-i18n"

// Set up or edit an event (lib/enterprise/portal/events.ts), then share it:
// link, QR downloads, RSVP count, cancel. Event flyers wait for the program's
// template: a marked spot here (EVENT_FLYER_READY). The server checks everything.

const TIMEZONES: [string, NopStringKey][] = [
  ["America/New_York", "event.tz_eastern"], ["America/Chicago", "event.tz_central"], ["America/Denver", "event.tz_mountain"], ["America/Phoenix", "event.tz_arizona"],
  ["America/Los_Angeles", "event.tz_pacific"], ["America/Anchorage", "event.tz_alaska"], ["Pacific/Honolulu", "event.tz_hawaii"],
]
const DURATIONS = [30, 45, 60, 90, 120, 180, 240]
const field = "mt-1 block min-h-11 w-full rounded-lg border border-border bg-[var(--surface-soft)] px-3.5 py-2.5 text-base"
const primary = "inline-flex min-h-11 items-center justify-center rounded-lg bg-[var(--brand-teal-bright)] px-4 text-sm font-semibold text-[var(--primary-foreground)] disabled:opacity-60"
const outline = "inline-flex min-h-11 items-center justify-center rounded-lg border border-border px-4 text-sm font-medium hover:bg-[var(--surface-sunken)] disabled:opacity-60"

export interface EditorEvent {
  id: string
  code: string
  link: string
  title: string
  date: string
  time: string
  timezone: string
  durationMinutes: number
  locationName: string
  address: string
  details: string
  cancelledAt: string | null
  hiddenAt?: string | null
  /** The check-in page people scan at the event (Part H). */
  checkInLink?: string
}

export function NopEventEditor({ event, stats, readOnly, flyerReady }: { event: EditorEvent | null; stats: { rsvps: number; guests: number; checkedIn?: number } | null; readOnly: boolean; flyerReady: boolean }) {
  const { t } = useNop()
  const router = useRouter()
  const browserTz = typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : ""
  const [v, setV] = useState({
    title: event?.title ?? "", date: event?.date ?? "", time: event?.time ?? "10:00",
    timezone: event?.timezone ?? (TIMEZONES.some(([z]) => z === browserTz) ? browserTz : "America/New_York"),
    durationMinutes: event?.durationMinutes ?? 60, locationName: event?.locationName ?? "", address: event?.address ?? "", details: event?.details ?? "",
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [confirmCancel, setConfirmCancel] = useState(false)
  const cancelled = !!event?.cancelledAt
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setV({ ...v, [k]: k === "durationMinutes" ? Number(e.target.value) : e.target.value })
  const err = (k: string) => errors[k] && <p role="alert" className="mt-1 text-sm text-red-700 dark:text-red-400">{t(errors[k] as NopStringKey)}</p>

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setErrors({}); setMsg(null)
    const res = await fetch(event ? `/api/enterprise/agent/events/${event.id}` : "/api/enterprise/agent/events", { method: event ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(v) }).catch(() => null)
    const body = res ? await res.json().catch(() => ({})) : {}
    setBusy(false)
    if (!res?.ok) return body.fields ? setErrors(body.fields) : setMsg(t("common.generic"))
    if (!event) return router.replace(`/agent/events/${body.event.id}`)
    setMsg(t("event.saved"))
    router.refresh()
  }

  async function cancel() {
    setBusy(true)
    await fetch(`/api/enterprise/agent/events/${event!.id}`, { method: "DELETE" })
    setBusy(false); setConfirmCancel(false)
    router.refresh()
  }

  return (
    <div className="flex flex-col gap-6">
      {event && (
        <section aria-labelledby="share" data-testid="event-share" className="rounded-2xl border border-border bg-card p-5">
          <h2 id="share" className="font-semibold">{t("event.share_title")}</h2>
          {cancelled && <p className="mt-1 text-sm font-medium text-amber-700 dark:text-amber-300">{t("event.cancelled_badge")}</p>}
          {event.hiddenAt && <p data-testid="event-hidden-badge" className="mt-1 text-sm font-medium text-amber-700 dark:text-amber-300">{t("event.hidden_badge")}</p>}
          <p className="mt-2 break-all font-mono text-sm" data-testid="event-link">{event.link.replace(/^https?:\/\//, "")}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className={outline} onClick={async () => { await navigator.clipboard.writeText(event.link).catch(() => {}); setCopied(true) }}>{copied ? t("event.copied") : t("event.copy")}</button>
            <a href={event.link} target="_blank" rel="noopener" className={outline}>{t("event.open")}</a>
            <a href={`/api/enterprise/agent/events/${event.id}/qr?format=png`} className={outline} data-testid="event-qr-png">{t("event.qr_png")}</a>
            <a href={`/api/enterprise/agent/events/${event.id}/qr?format=svg`} className={outline}>{t("event.qr_svg")}</a>
          </div>
          {stats && (
            <p className="mt-3 text-sm" data-testid="event-rsvps">
              {t(stats.rsvps === 1 ? "event.rsvp_count_one" : "event.rsvp_count", { n: String(stats.rsvps), guests: String(stats.guests) })} · <Link href="/agent/leads" className="text-[var(--brand-teal-bright)] underline-offset-2 hover:underline">{t("event.see_rsvps")}</Link>
            </p>
          )}
          {event.checkInLink && !cancelled && !event.hiddenAt && (
            <div data-testid="event-checkin" className="mt-5 border-t border-border pt-4">
              <h3 className="font-semibold">{t("checkin.agent_title")}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{t("checkin.agent_intro")}</p>
              <p className="mt-2 break-all font-mono text-sm" data-testid="event-checkin-link">{event.checkInLink.replace(/^https?:\/\//, "")}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <a href={`/agent/events/${event.id}/sign`} className={outline} data-testid="event-checkin-sign">{t("checkin.print_sign")}</a>
                <a href={`/api/enterprise/agent/events/${event.id}/qr?format=png&kind=checkin`} className={outline} data-testid="event-checkin-qr">{t("checkin.qr_png")}</a>
              </div>
              {stats && <p className="mt-3 text-sm" data-testid="event-checked-in">{t("checkin.count", { n: String(stats.checkedIn ?? 0) })}</p>}
            </div>
          )}
          {/* The spot for the event flyer: filled when the program's event template arrives (EVENT_FLYER_READY). */}
          {!flyerReady && <p data-testid="event-flyer-placeholder" className="mt-4 rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">{t("event.flyer_placeholder")}</p>}
        </section>
      )}

      <form onSubmit={save} className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5" data-testid="event-form">
        <p data-testid="event-content-note" className="text-sm text-muted-foreground">{t("event.content_note")}</p>
        <fieldset disabled={readOnly || cancelled} className="contents">
          <label className="text-sm font-medium">{t("event.title_label")}<input id="event-title" className={field} value={v.title} onChange={set("title")} maxLength={80} />{err("title")}</label>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-sm font-medium">{t("event.date_label")}<input id="event-date" type="date" className={field} value={v.date} onChange={set("date")} />{err("date")}</label>
            <label className="text-sm font-medium">{t("event.time_label")}<input id="event-time" type="time" className={field} value={v.time} onChange={set("time")} />{err("time")}</label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-sm font-medium">{t("event.timezone_label")}
              <select id="event-timezone" className={field} value={v.timezone} onChange={set("timezone")}>{TIMEZONES.map(([z, k]) => <option key={z} value={z}>{t(k)}</option>)}</select>{err("timezone")}
            </label>
            <label className="text-sm font-medium">{t("event.duration_label")}
              <select id="event-duration" className={field} value={v.durationMinutes} onChange={set("durationMinutes")}>
                {DURATIONS.map((m) => <option key={m} value={m}>{m >= 120 ? t("event.hours", { n: String(m / 60) }) : t("event.minutes", { n: String(m) })}</option>)}
              </select>{err("durationMinutes")}
            </label>
          </div>
          <label className="text-sm font-medium">{t("event.location_label")}<input id="event-location" className={field} value={v.locationName} onChange={set("locationName")} maxLength={80} />{err("locationName")}</label>
          <label className="text-sm font-medium">{t("event.address_label")}<input id="event-address" className={field} value={v.address} onChange={set("address")} maxLength={160} autoComplete="street-address" />{err("address")}</label>
          <label className="text-sm font-medium">{t("event.details_label")}<textarea id="event-details" rows={4} className={field} value={v.details} onChange={set("details")} maxLength={500} />{err("details")}</label>
          <div className="flex flex-wrap items-center gap-3">
            <button type="submit" disabled={busy} className={primary} data-testid="event-save" title={readOnly ? t("portal.read_only") : undefined}>{busy ? t("event.saving") : t("event.save")}</button>
            {msg && <p role="status" className="text-sm text-muted-foreground">{msg}</p>}
          </div>
        </fieldset>
      </form>

      {event && !cancelled && !readOnly && (
        !confirmCancel ? (
          <button type="button" className={`${outline} self-start text-red-700 dark:text-red-400`} onClick={() => setConfirmCancel(true)} data-testid="event-cancel">{t("event.cancel")}</button>
        ) : (
          <div role="alert" className="flex flex-col gap-3 rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-900 dark:border-red-800 dark:bg-red-950/40 dark:text-red-100">
            <p>{t("event.cancel_confirm")}</p>
            <div className="flex gap-2">
              <button type="button" disabled={busy} className={outline} onClick={() => void cancel()} data-testid="event-cancel-confirm">{t("event.cancel_yes")}</button>
              <button type="button" className={outline} onClick={() => setConfirmCancel(false)}>{t("event.keep")}</button>
            </div>
          </div>
        )
      )}
    </div>
  )
}
