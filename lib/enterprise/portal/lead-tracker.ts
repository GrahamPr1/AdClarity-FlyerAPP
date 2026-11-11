import type { LeadRecord, LeadStatus } from "@/lib/types"

// The lead tracker (Phase D): a status, private notes and an optional
// follow-up date on each of an agent's leads. Pure: no Redis, so the rules are
// shared by the API, the Leads tab and the daily reminder (Part E).
//
// A lead that needs follow-up: its follow-up date is today or earlier (unless
// it's Enrolled or Not interested), or it's still New and untouched 2+ days
// after it came in.

export const LEAD_STATUSES: readonly LeadStatus[] = ["new", "contacted", "appointment", "enrolled", "not_interested"]
export const MAX_NOTES = 2000
export const UNTOUCHED_DAYS = 2
const CLOSED: readonly LeadStatus[] = ["enrolled", "not_interested"]

export function isLeadStatus(v: unknown): v is LeadStatus {
  return typeof v === "string" && (LEAD_STATUSES as readonly string[]).includes(v)
}

/** A lead's status; leads from before statuses existed: Contacted if they were marked contacted, else New. */
export function leadStatus(lead: Pick<LeadRecord, "status" | "contactedAt">): LeadStatus {
  return lead.status ?? (lead.contactedAt ? "contacted" : "new")
}

export interface TrackerPatch {
  status?: LeadStatus
  notes?: string | null
  followUpOn?: string | null
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
function validDate(d: string): boolean {
  if (!DATE_RE.test(d)) return false
  const t = new Date(`${d}T12:00:00Z`)
  return !Number.isNaN(t.getTime()) && t.toISOString().slice(0, 10) === d
}

/** The fields an agent may change, checked. Unknown fields are ignored; an invalid one fails the whole patch. */
export function checkTrackerPatch(raw: Record<string, unknown>): { ok: true; patch: TrackerPatch } | { ok: false; field: string } {
  const patch: TrackerPatch = {}
  if ("status" in raw) {
    if (!isLeadStatus(raw.status)) return { ok: false, field: "status" }
    patch.status = raw.status
  } else if (typeof raw.contacted === "boolean") {
    // The old "mark as contacted" button.
    patch.status = raw.contacted ? "contacted" : "new"
  }
  if ("notes" in raw) {
    if (raw.notes !== null && typeof raw.notes !== "string") return { ok: false, field: "notes" }
    const notes = typeof raw.notes === "string" ? raw.notes.trim() : ""
    if (notes.length > MAX_NOTES) return { ok: false, field: "notes" }
    patch.notes = notes || null
  }
  if ("followUpOn" in raw) {
    const d = raw.followUpOn
    if (d === null || d === "") patch.followUpOn = null
    else if (typeof d === "string" && validDate(d)) patch.followUpOn = d
    else return { ok: false, field: "followUpOn" }
  }
  return { ok: true, patch }
}

/** The lead after a patch: status time and contactedAt kept in step, and the time it was last touched. */
export function applyTrackerPatch(lead: LeadRecord, patch: TrackerPatch, at: Date): LeadRecord {
  const now = at.toISOString()
  const next: LeadRecord = { ...lead, trackedAt: now }
  if (patch.status && patch.status !== leadStatus(lead)) {
    next.status = patch.status
    next.statusAt = now
    next.contactedAt = patch.status === "new" ? null : lead.contactedAt ?? now
    // The first time it reaches each stage, for the monthly counts.
    if (patch.status === "appointment") next.appointmentAt = lead.appointmentAt ?? now
    if (patch.status === "enrolled") next.enrolledAt = lead.enrolledAt ?? now
  } else if (patch.status) {
    next.status = patch.status
  }
  if ("notes" in patch) next.notes = patch.notes ?? null
  if ("followUpOn" in patch) next.followUpOn = patch.followUpOn ?? null
  return next
}

export type FollowUpReason = { kind: "overdue"; on: string } | { kind: "today" } | { kind: "untouched"; days: number }

/**
 * Why a lead needs follow-up today, or null. `today` is the agent's calendar
 * date ("YYYY-MM-DD"); `now` measures how long a New lead has waited.
 */
export function followUpReason(lead: LeadRecord, today: string, now: Date): FollowUpReason | null {
  const status = leadStatus(lead)
  if (lead.followUpOn && !CLOSED.includes(status)) {
    if (lead.followUpOn < today) return { kind: "overdue", on: lead.followUpOn }
    if (lead.followUpOn === today) return { kind: "today" }
  }
  if (status === "new" && !lead.trackedAt && !lead.contactedAt) {
    const days = Math.floor((now.getTime() - Date.parse(lead.createdAt)) / 86_400_000)
    if (days >= UNTOUCHED_DAYS) return { kind: "untouched", days }
  }
  return null
}

/** An RSVP from an event page, as opposed to a walk-in who checked in at the event (Part H), which also carries the eventId. */
export function isRsvp(lead: Pick<LeadRecord, "eventId" | "flyerId">): boolean {
  return !!lead.eventId && !lead.flyerId?.startsWith("nop-event-checkin:")
}

/** A walk-in who checked in at an event without an RSVP. */
export function isWalkIn(lead: Pick<LeadRecord, "eventId" | "flyerId">): boolean {
  return !!lead.eventId && !!lead.flyerId?.startsWith("nop-event-checkin:")
}

export interface MonthFunnel {
  /** Requests that came in (forms, RSVPs, check-ins). */
  leads: number
  contacted: number
  appointments: number
  enrolled: number
}

/**
 * What happened in a month [start, end): leads that came in, and leads first
 * contacted, given an appointment, or enrolled then. A stage counts only while
 * the lead is still at or past it (a mistaken tap that was undone doesn't).
 * Leads tracked before the stage times existed fall back to their status time.
 */
export function monthFunnel(leads: LeadRecord[], start: Date, end: Date): MonthFunnel {
  const inRange = (iso: string | null | undefined) => { if (!iso) return false; const t = Date.parse(iso); return t >= start.getTime() && t < end.getTime() }
  let out: MonthFunnel = { leads: 0, contacted: 0, appointments: 0, enrolled: 0 }
  for (const l of leads) {
    const status = leadStatus(l)
    const appointmentAt = l.appointmentAt ?? (status === "appointment" ? l.statusAt : null)
    const enrolledAt = l.enrolledAt ?? (status === "enrolled" ? l.statusAt : null)
    out = {
      leads: out.leads + (inRange(l.createdAt) ? 1 : 0),
      contacted: out.contacted + (status !== "new" && inRange(l.contactedAt) ? 1 : 0),
      appointments: out.appointments + ((status === "appointment" || status === "enrolled") && inRange(appointmentAt) ? 1 : 0),
      enrolled: out.enrolled + (status === "enrolled" && inRange(enrolledAt) ? 1 : 0),
    }
  }
  return out
}

