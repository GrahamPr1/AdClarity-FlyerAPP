"use client"

import { useState } from "react"
import { useNop } from "@/components/nop-i18n"
import type { LeadRecord, LeadStatus } from "@/lib/types"
import type { NopStringKey } from "@/lib/enterprise/nop-i18n"
import { LEAD_STATUSES, followUpReason, isRsvp, leadStatus } from "@/lib/enterprise/portal/lead-tracker"
import type { FollowUp } from "@/lib/enterprise/portal/follow-ups"

/**
 * An agent's leads, with the lead tracker (lead-tracker.ts): a status set in
 * one tap, private notes, and a follow-up date. Filter by status, with
 * "Needs follow-up" first (follow-up due today or earlier, or New and
 * untouched for 2+ days); sort newest first or by follow-up date. One tap to
 * call, text or email. While an admin views the portal everything shows but
 * nothing saves (the server refuses it anyway).
 *
 * Follow-ups (Pro/Leader, org switch on): the org's approved messages, already
 * filled in on the server. Each opens the agent's own Messages or email app
 * with the text ready; nothing is sent until they press send there.
 *
 * eventTitles: the event title for each RSVP's eventId (RSVPs are leads with an eventId).
 * textsOptedOut: leads whose number is on the SMS opt-out list (they show "No texts" even if they once said yes).
 * Each card has id="lead-{id}", so the daily reminder email can link straight to it.
 */
type Filter = "due" | "all" | LeadStatus
type Sort = "newest" | "followup"

const STATUS_KEY: Record<LeadStatus, NopStringKey> = {
  new: "tracker.status_new", contacted: "tracker.status_contacted", appointment: "tracker.status_appointment", enrolled: "tracker.status_enrolled", not_interested: "tracker.status_not_interested",
}

/** The agent's calendar date, from their own device. */
function localToday(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

export function NopAgentLeads({ leads: initial, followUps = {}, readOnly, eventTitles = {}, textsOptedOut = {} }: { leads: LeadRecord[]; followUps?: Record<string, FollowUp[]>; readOnly: boolean; eventTitles?: Record<string, string>; textsOptedOut?: Record<string, boolean> }) {
  const { t } = useNop()
  const [leads, setLeads] = useState(initial)
  const [today] = useState(localToday)
  const [now] = useState(() => new Date())
  const due = leads.filter((l) => followUpReason(l, today, now))
  const [filter, setFilter] = useState<Filter>(due.length > 0 ? "due" : "all")
  const [sort, setSort] = useState<Sort>("newest")
  const replace = (next: LeadRecord) => setLeads((all) => all.map((l) => (l.id === next.id ? next : l)))

  const shown = (filter === "due" ? due : filter === "all" ? leads : leads.filter((l) => leadStatus(l) === filter)).slice()
  if (sort === "followup") shown.sort((a, b) => (a.followUpOn ?? "9999-12-31").localeCompare(b.followUpOn ?? "9999-12-31") || b.createdAt.localeCompare(a.createdAt))
  const chip = (active: boolean) => `inline-flex min-h-11 shrink-0 items-center rounded-full border px-3 text-sm font-medium ${active ? "border-[var(--brand-teal-bright)] bg-[var(--brand-teal-bright)] text-[var(--primary-foreground)]" : "border-border hover:bg-[var(--surface-soft)]"}`
  const options: [Filter, string][] = [
    ["due", t("tracker.filter_due", { n: String(due.length) })],
    ["all", t("tracker.filter_all")],
    ...LEAD_STATUSES.map((st): [Filter, string] => [st, t(STATUS_KEY[st])]),
  ]

  return (
    <div>
      <div role="group" aria-label={t("tracker.filter_label")} data-testid="lead-filters" className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-2">
        {options.map(([f, label]) => (
          <button key={f} type="button" aria-pressed={filter === f} data-filter={f} onClick={() => setFilter(f)} className={chip(filter === f)}>{label}</button>
        ))}
      </div>
      <label className="mb-3 mt-1 flex items-center gap-2 text-sm text-muted-foreground">
        {t("tracker.sort_label")}
        <select data-testid="lead-sort" value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="min-h-11 rounded-lg border border-border bg-background px-2 text-foreground">
          <option value="newest">{t("tracker.sort_newest")}</option>
          <option value="followup">{t("tracker.sort_followup")}</option>
        </select>
      </label>
      {shown.length === 0 ? (
        <p data-testid="leads-none-here" className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">{t("tracker.none_here")}</p>
      ) : (
        <ul data-testid="leads-list" className="flex flex-col gap-3">
          {shown.map((lead) => (
            <LeadCard key={lead.id} lead={lead} onChange={replace} today={today} now={now} followUps={followUps[lead.id] ?? []} readOnly={readOnly}
              eventTitle={lead.eventId ? eventTitles[lead.eventId] ?? null : null} optedOut={!!textsOptedOut[lead.id]} />
          ))}
        </ul>
      )}
    </div>
  )
}

const action = "inline-flex min-h-11 flex-1 items-center justify-center rounded-lg border border-border px-3 text-sm font-medium hover:bg-[var(--surface-soft)]"

function LeadCard({ lead, onChange, today, now, followUps, readOnly, eventTitle, optedOut }: {
  lead: LeadRecord; onChange: (l: LeadRecord) => void; today: string; now: Date; followUps: FollowUp[]; readOnly: boolean; eventTitle: string | null; optedOut: boolean
}) {
  const { t, lang } = useNop()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)
  const [notes, setNotes] = useState(lead.notes ?? "")
  const [notesSaved, setNotesSaved] = useState(false)
  const digits = lead.phone.replace(/[^0-9+]/g, "")
  const locale = lang === "es" ? "es-US" : "en-US"
  const when = new Date(lead.createdAt).toLocaleString(locale, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
  const day = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString(locale, { weekday: "short", month: "short", day: "numeric" })
  const status = leadStatus(lead)
  const reason = followUpReason(lead, today, now)

  async function save(patch: Record<string, unknown>): Promise<boolean> {
    setBusy(true)
    setError(false)
    try {
      const res = await fetch(`/api/enterprise/agent/leads/${encodeURIComponent(lead.id)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json.lead) { setError(true); return false }
      onChange(json.lead)
      return true
    } catch {
      setError(true)
      return false
    } finally {
      setBusy(false)
    }
  }

  return (
    <li id={`lead-${lead.id}`} data-testid="lead" data-status={status} className="scroll-mt-4 rounded-2xl border border-border bg-card p-4">
      <div className="flex items-baseline justify-between gap-3">
        <p className="font-semibold">{lead.name}</p>
        <span data-testid="lead-status-badge" className="shrink-0 rounded-full border border-border px-2 py-0.5 text-xs">{t(STATUS_KEY[status])}</span>
      </div>
      {reason && (
        <p data-testid="lead-due" data-due={reason.kind} className="mt-1 text-sm font-semibold text-amber-700 dark:text-amber-300">
          {reason.kind === "today" ? t("tracker.due_today") : reason.kind === "overdue" ? t("tracker.overdue", { date: day(reason.on) }) : t("tracker.untouched", { n: String(reason.days) })}
        </p>
      )}
      {lead.eventId && isRsvp(lead) && (
        <p data-testid="lead-rsvp" className="mt-1 text-sm font-medium text-[var(--brand-teal-bright)]">
          {t("event.rsvp_badge", { title: eventTitle ?? "—" })}{lead.guests ? ` · ${t("event.rsvp_guests", { n: String(lead.guests) })}` : ""}
        </p>
      )}
      {lead.checkedInAt && (
        <p data-testid="lead-checked-in" className="mt-1 text-sm font-medium text-[var(--brand-teal-bright)]">{t("checkin.badge", { title: eventTitle ?? "—" })}</p>
      )}
      <p className="mt-0.5 text-xs text-muted-foreground">{t("portal.lead_received", { date: when })}</p>
      {lead.smsConsent?.agreed && (
        optedOut
          ? <p data-testid="lead-texts" data-texts="opted-out" className="mt-1 text-xs font-medium text-muted-foreground">{t("sms.badge_opted_out")}</p>
          : <p data-testid="lead-texts" data-texts="ok" className="mt-1 inline-flex rounded-full border border-[var(--brand-teal-bright)] px-2 py-0.5 text-xs font-medium text-[var(--brand-teal-bright)]">{t("sms.badge_ok")}</p>
      )}
      <p className="mt-2 text-sm">{lead.phone}{lead.email ? ` · ${lead.email}` : ""}</p>
      {lead.message && <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{lead.message}</p>}
      <div className="mt-3 flex gap-2">
        <a href={`tel:${digits}`} className={action}>{t("portal.lead_call")}</a>
        <a href={`sms:${digits}`} className={action}>{t("portal.lead_text")}</a>
        {lead.email && <a href={`mailto:${lead.email}`} className={action}>{t("portal.lead_email")}</a>}
      </div>
      {followUps.length > 0 && <FollowUps items={followUps} readOnly={readOnly} />}

      <fieldset disabled={busy || readOnly} title={readOnly ? t("portal.read_only") : undefined} className="mt-3 border-t border-border pt-3">
        <legend className="sr-only">{t("tracker.status_label")}</legend>
        <p aria-hidden="true" className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("tracker.status_label")}</p>
        <div role="radiogroup" aria-label={t("tracker.status_label")} data-testid="lead-status" className="flex flex-wrap gap-1.5">
          {LEAD_STATUSES.map((st) => (
            <button key={st} type="button" role="radio" aria-checked={status === st} data-status={st} onClick={() => status !== st && void save({ status: st })}
              className={`min-h-11 rounded-full border px-3 text-sm ${status === st ? "border-[var(--brand-teal-bright)] bg-[var(--brand-teal-bright)] font-semibold text-[var(--primary-foreground)]" : "border-border hover:bg-[var(--surface-soft)]"} disabled:opacity-60`}>
              {t(STATUS_KEY[st])}
            </button>
          ))}
        </div>
        <details data-testid="lead-more" open={!!(lead.notes || lead.followUpOn)} className="mt-3 rounded-xl border border-border">
          <summary className="flex min-h-11 cursor-pointer items-center px-3 text-sm font-medium">{t("tracker.more")}</summary>
          <div className="border-t border-border px-3 pb-3">
        <label className="mt-3 block text-sm font-medium">{t("tracker.followup_label")}
          <span className="mt-1 flex items-center gap-2">
            <input type="date" data-testid="lead-followup" value={lead.followUpOn ?? ""} onChange={(e) => void save({ followUpOn: e.target.value || null })}
              className="min-h-11 rounded-lg border border-border bg-background px-3 text-base" />
            {lead.followUpOn && <button type="button" data-testid="lead-followup-clear" onClick={() => void save({ followUpOn: null })} className="min-h-11 rounded-lg px-3 text-sm text-muted-foreground hover:text-foreground">{t("tracker.followup_clear")}</button>}
          </span>
        </label>
        <label className="mt-3 block text-sm font-medium">{t("tracker.notes_label")}
          <textarea data-testid="lead-notes" rows={2} maxLength={2000} value={notes} onChange={(e) => { setNotes(e.target.value); setNotesSaved(false) }}
            className="mt-1 block w-full rounded-lg border border-border bg-background px-3 py-2 text-base" />
        </label>
        <p className="mt-1 text-xs text-muted-foreground">{t("tracker.notes_help")}</p>
        <div className="mt-2 flex items-center gap-3">
          <button type="button" data-testid="lead-notes-save" disabled={notes.trim() === (lead.notes ?? "")} onClick={async () => { if (await save({ notes })) setNotesSaved(true) }}
            className="min-h-11 rounded-lg border border-border px-4 text-sm font-medium disabled:opacity-50">{t("tracker.notes_save")}</button>
          {notesSaved && <span role="status" className="text-sm text-muted-foreground">{t("tracker.saved")}</span>}
        </div>
          </div>
        </details>
      </fieldset>
      {error && <p role="alert" className="mt-1 text-sm text-red-600 dark:text-red-400">{t("portal.lead_save_failed")}</p>}
    </li>
  )
}

function FollowUps({ items, readOnly }: { items: FollowUp[]; readOnly: boolean }) {
  const { t } = useNop()
  const open = (href: string, label: string, testId: string) =>
    readOnly ? (
      <span aria-disabled="true" title={t("portal.read_only")} className={`${action} opacity-50`} data-testid={testId}>{label}</span>
    ) : (
      <a href={href} className={action} data-testid={testId}>{label}</a>
    )
  return (
    <details data-testid="follow-ups" className="mt-3 rounded-xl border border-border">
      <summary className="flex min-h-11 cursor-pointer items-center px-3 text-sm font-medium">{t("portal.followup_title", { count: String(items.length) })}</summary>
      <div className="flex flex-col gap-3 border-t border-border p-3">
        <p className="text-xs text-muted-foreground">{t("portal.followup_note")}</p>
        {items.map((f) => (
          <div key={f.n} data-testid={`follow-up-${f.n}`} lang={f.lang}>
            <p className="line-clamp-3 whitespace-pre-wrap text-sm">{f.body}</p>
            <div className="mt-2 flex gap-2">
              {open(f.sms, t("portal.followup_sms"), `follow-up-${f.n}-sms`)}
              {f.mailto && open(f.mailto, t("portal.followup_email"), `follow-up-${f.n}-email`)}
            </div>
          </div>
        ))}
      </div>
    </details>
  )
}
