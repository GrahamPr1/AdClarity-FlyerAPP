"use client"

import { useState } from "react"
import { useNop } from "@/components/nop-i18n"
import type { LeadRecord } from "@/lib/types"
import type { FollowUp } from "@/lib/enterprise/portal/follow-ups"

/**
 * An agent's leads, newest first: one tap to call, text or email, and "mark as
 * contacted". While an admin views the portal the button is disabled, and the
 * server refuses it anyway.
 *
 * Follow-ups (Pro/Leader, org switch on): the org's approved messages, already
 * filled in on the server. Each opens the agent's own Messages or email app
 * with the text ready; nothing is sent until they press send there. Shown but
 * not tappable while an admin views as the agent.
 */
/** eventTitles: the event title for each RSVP's eventId (RSVPs are leads with an eventId). */
export function NopAgentLeads({ leads, followUps = {}, readOnly, eventTitles = {} }: { leads: LeadRecord[]; followUps?: Record<string, FollowUp[]>; readOnly: boolean; eventTitles?: Record<string, string> }) {
  return (
    <ul data-testid="leads-list" className="flex flex-col gap-3">
      {leads.map((lead) => <LeadCard key={lead.id} lead={lead} followUps={followUps[lead.id] ?? []} readOnly={readOnly} eventTitle={lead.eventId ? eventTitles[lead.eventId] ?? null : null} />)}
    </ul>
  )
}

const action = "inline-flex min-h-11 flex-1 items-center justify-center rounded-lg border border-border px-3 text-sm font-medium hover:bg-[var(--surface-soft)]"

function LeadCard({ lead: initial, followUps, readOnly, eventTitle }: { lead: LeadRecord; followUps: FollowUp[]; readOnly: boolean; eventTitle: string | null }) {
  const { t, lang } = useNop()
  const [lead, setLead] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)
  const digits = lead.phone.replace(/[^0-9+]/g, "")
  const when = new Date(lead.createdAt).toLocaleString(lang === "es" ? "es-US" : "en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })

  async function toggle() {
    setBusy(true)
    setError(false)
    try {
      const res = await fetch(`/api/enterprise/agent/leads/${encodeURIComponent(lead.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contacted: !lead.contactedAt }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json.lead) return setError(true)
      setLead(json.lead)
    } catch {
      setError(true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <li data-testid="lead" className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-baseline justify-between gap-3">
        <p className="font-semibold">{lead.name}</p>
        {lead.contactedAt && <span data-testid="lead-contacted" className="shrink-0 rounded-full border border-border px-2 py-0.5 text-xs">{t("portal.lead_contacted")}</span>}
      </div>
      {lead.eventId && (
        <p data-testid="lead-rsvp" className="mt-1 text-sm font-medium text-[var(--brand-teal-bright)]">
          {t("event.rsvp_badge", { title: eventTitle ?? "—" })}{lead.guests ? ` · ${t("event.rsvp_guests", { n: String(lead.guests) })}` : ""}
        </p>
      )}
      <p className="mt-0.5 text-xs text-muted-foreground">{t("portal.lead_received", { date: when })}</p>
      <p className="mt-2 text-sm">{lead.phone}{lead.email ? ` · ${lead.email}` : ""}</p>
      {lead.message && <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{lead.message}</p>}
      <div className="mt-3 flex gap-2">
        <a href={`tel:${digits}`} className={action}>{t("portal.lead_call")}</a>
        <a href={`sms:${digits}`} className={action}>{t("portal.lead_text")}</a>
        {lead.email && <a href={`mailto:${lead.email}`} className={action}>{t("portal.lead_email")}</a>}
      </div>
      {followUps.length > 0 && <FollowUps items={followUps} readOnly={readOnly} />}
      <button type="button" onClick={() => void toggle()} disabled={busy || readOnly} title={readOnly ? t("portal.read_only") : undefined}
        className="mt-2 min-h-11 w-full rounded-lg px-3 text-sm font-medium text-muted-foreground hover:text-foreground disabled:opacity-50">
        {lead.contactedAt ? t("portal.lead_mark_not_contacted") : t("portal.lead_mark_contacted")}
      </button>
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
