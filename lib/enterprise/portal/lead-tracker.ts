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
