import { Redis } from "@upstash/redis"
import { randomInt } from "node:crypto"
import { getAgentIdOwner, getRosterRecord } from "@/lib/enterprise/agents-store"
import { NOP_QR_ALPHABET } from "@/lib/enterprise/nop-roster"
import type { NopLang } from "@/lib/enterprise/nop-i18n"
import { CANONICAL_SITE_URL } from "@/lib/site-url"
import { canUse } from "./features"
import { loadPortalContext } from "./context"

// Agent events (Phase 5): an active Pro/Leader agent sets up an event (an
// enrollment day, an info session), shares its page oneflyer.org/e/{code} by
// link or QR, and people RSVP there with the same consent checkbox as the
// lead forms. RSVPs are leads (eventId set), so they show in the Leads tab and
// follow the same retention, deletion and data-move rules. The day before,
// RSVPs who gave an email get a reminder (event-reminders.ts).
//
// Event FLYERS need a template the program hasn't supplied: the event page in
// the portal keeps a marked spot for it (EVENT_FLYER_READY).
//
//   nop-event:{id}                AgentEvent
//   nop-event-code:{code}         event id (the public page)
//   nop-agent:{agentId}:events    zset of event ids by start time
//   nop-events-by-start           zset of every event id by start time (reminders)
//   nop-events-all                zset of every event id ever made, by start time (admin list)
//
// Admins (owner and program admins) can hide an event: its public page then
// says only "This event isn't available", it takes no RSVPs and sends no
// reminders, until they unhide it.

const redis = Redis.fromEnv()
const eventKey = (id: string) => `nop-event:${id}`
const codeKey = (code: string) => `nop-event-code:${code}`
const agentEventsKey = (agentId: string) => `nop-agent:${agentId}:events`
export const EVENTS_BY_START_KEY = "nop-events-by-start"
const ALL_EVENTS_KEY = "nop-events-all"

/** The template isn't here yet: the portal shows a marked spot instead of an event flyer. */
export const EVENT_FLYER_READY = false
export const NOP_EVENT_PATH = "/e"
export const eventLink = (code: string) => `${CANONICAL_SITE_URL}${NOP_EVENT_PATH}/${code}`

/** US time zones agents pick from. The event's date and time are entered in it. */
export const EVENT_TIMEZONES = ["America/New_York", "America/Chicago", "America/Denver", "America/Phoenix", "America/Los_Angeles", "America/Anchorage", "Pacific/Honolulu"] as const
export type EventTimezone = (typeof EVENT_TIMEZONES)[number]

export const EVENT_LIMITS = { title: 80, locationName: 80, address: 160, details: 500, maxGuests: 10, minMinutes: 15, maxMinutes: 600 } as const

export interface AgentEvent {
  id: string
  agentId: string
  code: string
  title: string
  /** As entered, in `timezone`: "2026-12-05" and "10:00". */
  date: string
  time: string
  timezone: EventTimezone
  durationMinutes: number
  /** UTC instants, from date + time in timezone. */
  startsAt: string
  endsAt: string
  locationName: string
  address: string
  details: string
  createdAt: string
  updatedAt: string
  cancelledAt: string | null
  /** Taken down by an admin (who, when); unset when shown. */
  hiddenAt?: string | null
  hiddenBy?: string | null
  /** When the agent got their day-before email with the RSVP list (once only). */
  agentReminderSentAt?: string | null
}

export type EventInput = Pick<AgentEvent, "title" | "date" | "time" | "timezone" | "durationMinutes" | "locationName" | "address" | "details">

/** The UTC instant of a wall-clock date and time in an IANA time zone (DST-aware, no library). */
export function zonedTimeToUtc(date: string, time: string, timeZone: string): Date {
  const [y, mo, d] = date.split("-").map(Number)
  const [h, mi] = time.split(":").map(Number)
  const guess = Date.UTC(y, mo - 1, d, h, mi)
  const offsetAt = (ms: number) => {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(new Date(ms))
    const get = (t: string) => Number(parts.find((p) => p.type === t)!.value)
    return Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second")) - ms
  }
  // Two passes settle the offset across a DST change.
  let ms = guess - offsetAt(guess)
  ms = guess - offsetAt(ms)
  return new Date(ms)
}

/** "Saturday, December 5, 10:00 AM EST" in the event's own time zone, in the reader's language. */
export function formatEventWhen(event: Pick<AgentEvent, "startsAt" | "timezone">, lang: NopLang): string {
  return new Intl.DateTimeFormat(lang === "es" ? "es-US" : "en-US", {
    timeZone: event.timezone, weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short",
  }).format(new Date(event.startsAt))
}

/** The calendar date ("YYYY-MM-DD") of an instant in a time zone. */
export function localDate(at: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(at)
}

export type EventCheck = { ok: true; value: EventInput & { startsAt: string; endsAt: string } } | { ok: false; errors: Partial<Record<keyof EventInput, string>> }

/** Field keys are i18n keys (the portal shows them in the agent's language). */
export function checkEventInput(raw: Record<string, unknown>, now = new Date()): EventCheck {
  const str = (k: string, max: number) => (typeof raw[k] === "string" ? (raw[k] as string).trim().replace(/[ \t]+/g, " ").slice(0, max + 1) : "")
  const v = {
    title: str("title", EVENT_LIMITS.title),
    date: str("date", 10),
    time: str("time", 5),
    timezone: str("timezone", 40) as EventTimezone,
    durationMinutes: Number(raw.durationMinutes),
    locationName: str("locationName", EVENT_LIMITS.locationName),
    address: str("address", EVENT_LIMITS.address),
    details: typeof raw.details === "string" ? raw.details.trim().slice(0, EVENT_LIMITS.details + 1) : "",
  }
  const errors: Partial<Record<keyof EventInput, string>> = {}
  if (!v.title || v.title.length > EVENT_LIMITS.title) errors.title = "event.err_title"
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v.date) || Number.isNaN(Date.parse(`${v.date}T00:00:00Z`))) errors.date = "event.err_date"
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(v.time)) errors.time = "event.err_time"
  if (!(EVENT_TIMEZONES as readonly string[]).includes(v.timezone)) errors.timezone = "event.err_timezone"
  if (!Number.isInteger(v.durationMinutes) || v.durationMinutes < EVENT_LIMITS.minMinutes || v.durationMinutes > EVENT_LIMITS.maxMinutes) errors.durationMinutes = "event.err_duration"
  if (!v.locationName || v.locationName.length > EVENT_LIMITS.locationName) errors.locationName = "event.err_location"
  if (v.address.length > EVENT_LIMITS.address) errors.address = "event.err_address"
  if (v.details.length > EVENT_LIMITS.details) errors.details = "event.err_details"
  if (Object.keys(errors).length) return { ok: false, errors }
  const start = zonedTimeToUtc(v.date, v.time, v.timezone)
  if (start.getTime() <= now.getTime()) return { ok: false, errors: { date: "event.err_past" } }
  return { ok: true, value: { ...v, startsAt: start.toISOString(), endsAt: new Date(start.getTime() + v.durationMinutes * 60_000).toISOString() } }
}

function newCode(): string {
  let s = ""
  for (let i = 0; i < 8; i++) s += NOP_QR_ALPHABET[randomInt(NOP_QR_ALPHABET.length)]
  return s
}

export async function getEvent(id: string): Promise<AgentEvent | null> {
  return (await redis.get<AgentEvent>(eventKey(id))) ?? null
}

/** The agent's events, soonest first. */
export async function listAgentEvents(agentId: string): Promise<AgentEvent[]> {
  const ids = ((await redis.zrange<string[]>(agentEventsKey(agentId), 0, -1)) ?? []).map(String)
  if (ids.length === 0) return []
  const records = await redis.mget<(AgentEvent | null)[]>(...ids.map(eventKey))
  return records.filter((e): e is AgentEvent => e !== null)
}

export async function createEvent(agentId: string, input: EventInput & { startsAt: string; endsAt: string }): Promise<AgentEvent> {
  const now = new Date().toISOString()
  let code = newCode()
  for (let i = 0; i < 5 && !(await redis.set(codeKey(code), "pending", { nx: true })); i++) code = newCode()
  const event: AgentEvent = { id: crypto.randomUUID(), agentId, code, ...input, createdAt: now, updatedAt: now, cancelledAt: null }
  await redis.set(codeKey(code), event.id)
  await redis.set(eventKey(event.id), event)
  await redis.zadd(agentEventsKey(agentId), { score: Date.parse(event.startsAt), member: event.id })
  await redis.zadd(EVENTS_BY_START_KEY, { score: Date.parse(event.startsAt), member: event.id })
  await redis.zadd(ALL_EVENTS_KEY, { score: Date.parse(event.startsAt), member: event.id })
  return event
}

export async function updateEvent(event: AgentEvent, input: EventInput & { startsAt: string; endsAt: string }): Promise<AgentEvent> {
  const next: AgentEvent = { ...event, ...input, updatedAt: new Date().toISOString() }
  await redis.set(eventKey(event.id), next)
  await redis.zadd(agentEventsKey(event.agentId), { score: Date.parse(next.startsAt), member: event.id })
  if (!event.cancelledAt) await redis.zadd(EVENTS_BY_START_KEY, { score: Date.parse(next.startsAt), member: event.id })
  await redis.zadd(ALL_EVENTS_KEY, { score: Date.parse(next.startsAt), member: event.id })
  return next
}

/** Every event of every agent, newest start first (the admin Events list). */
export async function listAllEvents(): Promise<AgentEvent[]> {
  const ids = ((await redis.zrange<string[]>(ALL_EVENTS_KEY, 0, -1, { rev: true })) ?? []).map(String)
  if (ids.length === 0) return []
  const records = await redis.mget<(AgentEvent | null)[]>(...ids.map(eventKey))
  return records.filter((e): e is AgentEvent => e !== null)
}

/** An admin hides (takes down) or shows an event's public page. Re-reads the record so nothing else is lost. */
export async function setEventHidden(id: string, hidden: boolean, by: string): Promise<AgentEvent | null> {
  const event = await getEvent(id)
  if (!event) return null
  const next: AgentEvent = { ...event, hiddenAt: hidden ? new Date().toISOString() : null, hiddenBy: hidden ? by : null }
  await redis.set(eventKey(id), next)
  return next
}

/** Marks that the agent got their day-before email for this event. */
export async function markAgentReminded(id: string, at: Date): Promise<void> {
  const event = await getEvent(id)
  if (event) await redis.set(eventKey(id), { ...event, agentReminderSentAt: at.toISOString() })
}

/** Cancelled events stay (their RSVPs are leads); the page says it's cancelled and takes no RSVPs; no reminder goes out. */
export async function cancelEvent(event: AgentEvent): Promise<AgentEvent> {
  const next: AgentEvent = { ...event, cancelledAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
  await redis.set(eventKey(event.id), next)
  await redis.zrem(EVENTS_BY_START_KEY, event.id)
  return next
}

/** Events starting between two instants (for the reminder job). */
export async function eventsStartingBetween(from: Date, to: Date): Promise<AgentEvent[]> {
  const ids = ((await redis.zrange<string[]>(EVENTS_BY_START_KEY, from.getTime(), to.getTime(), { byScore: true })) ?? []).map(String)
  if (ids.length === 0) return []
  const records = await redis.mget<(AgentEvent | null)[]>(...ids.map(eventKey))
  return records.filter((e): e is AgentEvent => e !== null && !e.cancelledAt)
}

export interface EventPage {
  event: AgentEvent
  agentId: string
  owner: string
  orgId: string
  agentLang: NopLang
  agentName: string
  phone: string
  email: string
  /** RSVPs accepted now: not cancelled, not over, and the agent can still use events and leads. */
  open: boolean
  state: "open" | "cancelled" | "ended" | "closed" | "hidden"
}

/**
 * What /e/{code} shows, or null (unknown code, or the agent isn't an active
 * agent the event belongs to). A cancelled or past event still shows, without
 * the form. An agent who lost Pro or events: "closed", no form. Hidden by an
 * admin: "hidden", and the page shows nothing of the event.
 */
export async function eventPageFor(code: string, now = new Date()): Promise<EventPage | null> {
  const id = await redis.get<string>(codeKey(code))
  const event = id ? await getEvent(String(id)) : null
  if (!event) return null
  const roster = await getRosterRecord(event.agentId)
  const owner = await getAgentIdOwner(event.agentId)
  if (roster?.status !== "active" || !owner) return null
  const ctx = await loadPortalContext(owner)
  if (!ctx || ctx.agent.agentId !== event.agentId) return null
  const p = ctx.agent.profile
  const state = event.hiddenAt ? "hidden" : event.cancelledAt ? "cancelled" : Date.parse(event.endsAt) <= now.getTime() ? "ended" : canUse(ctx, "events") && canUse(ctx, "leads") ? "open" : "closed"
  return {
    event, agentId: event.agentId, owner, orgId: ctx.orgId, agentLang: p.preferredLanguage ?? "en",
    agentName: p.displayName ?? p.name, phone: p.displayPhone ?? p.phone, email: p.displayEmail ?? p.email,
    open: state === "open", state,
  }
}

/** Account deletion (agent-account-deletion.ts): every event of this agent, its public code, and the indexes. Returns how many. */
export async function deleteAgentEvents(agentId: string): Promise<number> {
  const events = await listAgentEvents(agentId)
  for (const e of events) {
    await redis.del(eventKey(e.id), codeKey(e.code))
    await redis.zrem(EVENTS_BY_START_KEY, e.id)
    await redis.zrem(ALL_EVENTS_KEY, e.id)
  }
  await redis.del(agentEventsKey(agentId))
  return events.length
}
