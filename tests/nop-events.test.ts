import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { NextRequest } from "next/server"
import { defaultOrgFeatures, entitlements, portalTabs } from "@/lib/enterprise/portal/features"

/**
 * Agent events (Phase 5): Pro/Leader agents set up events; /e/{code} takes
 * RSVPs with the same consent checkbox; RSVPs are leads (eventId, guests);
 * the day before, RSVPs with an email get one reminder in their language.
 */

const r = vi.hoisted(() => ({
  kv: new Map<string, unknown>(),
  z: new Map<string, Map<string, number>>(),
  lists: new Map<string, unknown[]>(),
  tier: "pro",
  active: true,
  features: {} as Record<string, boolean>,
  viewingAs: false,
  consent: { id: "approved-text:nop:leadConsent:en", text: "I agree that {agent_name} may contact me.", version: 2, pending: false },
  notices: [] as Record<string, unknown>[],
  reminders: [] as Record<string, unknown>[],
  agentReminders: [] as Record<string, unknown>[],
  hiddenNotices: [] as Record<string, unknown>[],
  audits: [] as string[],
  admin: true,
}))
vi.mock("@upstash/redis", () => {
  const zs = (k: string) => r.z.get(k) ?? (r.z.set(k, new Map()), r.z.get(k)!)
  const fake: Record<string, (...a: never[]) => unknown> = {
    get: async (k: string) => r.kv.get(k) ?? null,
    set: async (k: string, v: unknown, o?: { nx?: boolean }) => { if (o?.nx && r.kv.has(k)) return null; r.kv.set(k, v); return "OK" },
    mget: async (...ks: string[]) => ks.map((k) => r.kv.get(k) ?? null),
    zadd: async (k: string, e: { score: number; member: string }) => (zs(k).set(e.member, e.score), 1),
    zrem: async (k: string, m: string) => (zs(k).delete(m) ? 1 : 0),
    zscore: async (k: string, m: string) => zs(k).get(m) ?? null,
    zrange: async (k: string, a: number, b: number, o?: { byScore?: boolean; rev?: boolean }) => {
      const sorted = [...zs(k).entries()].sort((x, y) => x[1] - y[1])
      if (o?.byScore) return sorted.filter(([, s]) => s >= a && s <= b).map(([m]) => m)
      const ids = sorted.map(([m]) => m)
      return o?.rev ? ids.reverse() : ids
    },
    lpush: async (k: string, v: unknown) => r.lists.set(k, [v, ...(r.lists.get(k) ?? [])]).get(k)!.length,
    ltrim: async () => "OK",
  }
  fake.multi = () => {
    const q: (() => Promise<unknown>)[] = []
    const tx: Record<string, unknown> = { exec: async () => { for (const f of q) await f() } }
    for (const k of ["set", "zadd"]) tx[k] = (...a: never[]) => { q.push(() => (fake[k] as (...x: never[]) => Promise<unknown>)(...a)); return tx }
    return tx
  }
  return { Redis: { fromEnv: () => fake } }
})
vi.mock("@/lib/enterprise/agents-store", () => ({
  getRosterRecord: async () => ({ status: r.active ? "active" : "suspended" }),
  getAgentIdOwner: async () => "agent@x.test",
}))
vi.mock("@/lib/enterprise/portal/context", () => ({
  loadPortalContext: async () => {
    const base = { tier: r.tier, orgFeatures: r.features, active: r.active }
    return { email: "agent@x.test", agent: { agentId: "858980", profile: { displayName: "Pat Lee", name: "Pat Lee", displayPhone: "(270) 555-0100", displayEmail: "pat@x.test", preferredLanguage: "es" } }, orgId: "nop", orgName: "NOP", ...base, can: entitlements(base as never), tabs: portalTabs(base as never) }
  },
}))
vi.mock("@/lib/enterprise/portal/api", async () => {
  const { loadPortalContext } = await import("@/lib/enterprise/portal/context")
  const { canUse } = await import("@/lib/enterprise/portal/features")
  return {
    requireAgentFeature: async (_req: unknown, feature: string | null) => {
      const ctx = await loadPortalContext("agent@x.test")
      if (feature && !canUse(ctx as never, feature as never)) return { response: Response.json({ error: "not_available" }, { status: 403 }) }
      return { viewer: {}, ctx }
    },
  }
})
vi.mock("@/lib/enterprise/portal/view-as", () => ({ rejectWhileViewingAs: () => (r.viewingAs ? Response.json({ error: "read_only" }, { status: 403 }) : null) }))
vi.mock("@/lib/enterprise/portal/lead-capture", async (orig) => ({ ...(await orig<typeof import("@/lib/enterprise/portal/lead-capture")>()), leadConsent: async () => r.consent }))
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: async () => ({ allowed: true }), clientIp: () => "1.2.3.4" }))
vi.mock("@/lib/email", () => ({
  sendNopAgentLeadNotification: async (i: Record<string, unknown>) => (r.notices.push(i), { sent: true }),
  sendEventReminder: async (i: Record<string, unknown>) => (r.reminders.push(i), { sent: true }),
  sendEventAgentReminder: async (i: Record<string, unknown>) => (r.agentReminders.push(i), { sent: true }),
  sendEventHiddenNotice: async (i: Record<string, unknown>) => (r.hiddenNotices.push(i), { sent: true }),
}))
vi.mock("@/lib/enterprise/program-admins", () => ({
  requireNopAdmin: async () => (r.admin ? { admin: "quinn@x.test", name: "Quinn", role: "program" } : { response: Response.json({ error: "Unauthorized" }, { status: 401 }) }),
  audit: async (_who: unknown, action: string, detail: string) => void r.audits.push(`${action} ${detail}`),
}))

beforeEach(() => {
  r.kv.clear(); r.z.clear(); r.lists.clear(); r.notices.length = 0; r.reminders.length = 0; r.agentReminders.length = 0; r.hiddenNotices.length = 0; r.audits.length = 0; r.admin = true
  Object.assign(r, { tier: "pro", active: true, viewingAs: false, features: { ...defaultOrgFeatures(true), events: true } })
  r.consent = { id: "approved-text:nop:leadConsent:en", text: "I agree that {agent_name} may contact me.", version: 2, pending: false }
})
afterEach(() => vi.useRealTimers())

const ev = () => import("@/lib/enterprise/portal/events")
const input = (over: Record<string, unknown> = {}) => ({ title: "Enrollment day", date: "2027-03-06", time: "10:00", timezone: "America/Chicago", durationMinutes: 120, locationName: "Library", address: "1 Main St, Bowling Green, KY", details: "Bring your ID.", ...over })
const NOW = new Date("2027-03-01T12:00:00Z")

describe("time and input", () => {
  it("wall-clock time in the event's zone, across daylight saving", async () => {
    const { zonedTimeToUtc } = await ev()
    expect(zonedTimeToUtc("2026-12-05", "10:00", "America/New_York").toISOString()).toBe("2026-12-05T15:00:00.000Z")
    expect(zonedTimeToUtc("2027-07-04", "10:00", "America/Chicago").toISOString()).toBe("2027-07-04T15:00:00.000Z")
    expect(zonedTimeToUtc("2027-07-04", "10:00", "America/Phoenix").toISOString()).toBe("2027-07-04T17:00:00.000Z")
  })

  it("checks every field; refuses a time that has passed", async () => {
    const { checkEventInput } = await ev()
    const ok = checkEventInput(input(), NOW)
    expect(ok).toMatchObject({ ok: true, value: { startsAt: "2027-03-06T16:00:00.000Z", endsAt: "2027-03-06T18:00:00.000Z" } })
    const bad = checkEventInput(input({ title: "", time: "25:00", timezone: "Europe/Paris", durationMinutes: 5, locationName: "" }), NOW)
    expect(!bad.ok && Object.keys(bad.errors).sort()).toEqual(["durationMinutes", "locationName", "time", "timezone", "title"])
    expect(checkEventInput(input({ date: "2027-02-01" }), NOW)).toEqual({ ok: false, errors: { date: "event.err_past" } })
  })

  it("title up to 80 characters, details up to 500", async () => {
    const { checkEventInput } = await ev()
    expect(checkEventInput(input({ title: "t".repeat(80), details: "d".repeat(500) }), NOW).ok).toBe(true)
    expect(checkEventInput(input({ title: "t".repeat(81), details: "d".repeat(501) }), NOW)).toEqual({ ok: false, errors: { title: "event.err_title", details: "event.err_details" } })
  })
})

async function call(mod: () => Promise<Record<string, unknown>>, method: string, body?: unknown, params?: Record<string, string>) {
  const m = (await mod()) as Record<string, (req: NextRequest, ctx?: unknown) => Promise<Response>>
  const res = await m[method](new NextRequest("http://x/api", { method, headers: { "content-type": "application/json" }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) }), params ? { params: Promise.resolve(params) } : undefined)
  return { status: res.status, json: await res.json().catch(() => null) }
}
const eventsRoute = () => import("@/app/api/enterprise/agent/events/route") as Promise<Record<string, unknown>>
const eventRoute = () => import("@/app/api/enterprise/agent/events/[id]/route") as Promise<Record<string, unknown>>
const rsvpRoute = () => import("@/app/api/enterprise/nop/events/[code]/rsvp/route") as Promise<Record<string, unknown>>

async function makeEvent(over: Record<string, unknown> = {}) {
  const res = await call(eventsRoute, "POST", input({ date: "2099-03-06", ...over }))
  expect(res.status).toBe(200)
  return res.json.event as { id: string; code: string; link: string }
}
const rsvp = (code: string, over: Record<string, unknown> = {}) => call(rsvpRoute, "POST", { name: "Ana Ruiz", phone: "(270) 555-0199", email: "ana@x.test", consent: true, consentVersion: 2, lang: "es", guests: 2, ...over }, { code })

describe("setting up events", () => {
  it("an active Pro agent creates one: a random code and a /e link", async () => {
    const e = await makeEvent()
    expect(e.code).toMatch(/^[23456789A-HJ-NP-Za-km-z]{8}$/)
    expect(e.link).toBe(`https://oneflyer.org/e/${e.code}`)
    expect((await call(eventsRoute, "GET")).json.events).toHaveLength(1)
  })

  it("Basic, inactive, events switched off, or an admin viewing: refused", async () => {
    r.tier = "basic"; expect((await call(eventsRoute, "POST", input({ date: "2099-03-06" }))).status).toBe(403)
    r.tier = "pro"; r.active = false; expect((await call(eventsRoute, "POST", input({ date: "2099-03-06" }))).status).toBe(403)
    r.active = true; r.features = { ...r.features, events: false }; expect((await call(eventsRoute, "POST", input({ date: "2099-03-06" }))).status).toBe(403)
    r.features = { ...r.features, events: true }; r.viewingAs = true; expect((await call(eventsRoute, "POST", input({ date: "2099-03-06" }))).status).toBe(403)
  })

  it("edit and cancel only the agent's own event; a cancelled event can't be edited", async () => {
    const e = await makeEvent()
    expect((await call(eventRoute, "PATCH", input({ date: "2099-03-07", title: "Moved" }), { id: e.id })).json.event.title).toBe("Moved")
    expect((await call(eventRoute, "GET", undefined, { id: "someone-else" })).status).toBe(404)
    expect((await call(eventRoute, "DELETE", undefined, { id: e.id })).json.event.cancelledAt).toBeTruthy()
    expect((await call(eventRoute, "PATCH", input({ date: "2099-03-07" }), { id: e.id })).status).toBe(409)
  })
})

describe("the event page and RSVPs", () => {
  it("an RSVP is a lead with the event, guests and consent as shown; the agent is told it's an RSVP", async () => {
    const e = await makeEvent()
    expect((await rsvp(e.code)).status).toBe(200)
    const { listAgentLeads } = await import("@/lib/enterprise/portal/agent-data")
    const [lead] = await listAgentLeads("858980")
    expect(lead).toMatchObject({ eventId: e.id, guests: 2, flyerId: `nop-event:${e.id}`, reminderSentAt: null, consent: { text: "I agree that Pat Lee may contact me.", version: 2, lang: "es" } })
    expect(r.notices[0]).toMatchObject({ to: "agent@x.test", lang: "es", event: { title: "Enrollment day", guests: 2 } })
    const { GET } = (await eventRoute()) as unknown as { GET: (req: NextRequest, c: unknown) => Promise<Response> }
    expect(await (await GET(new NextRequest("http://x"), { params: Promise.resolve({ id: e.id }) })).json()).toMatchObject({ rsvps: 1, guests: 3 })
  })

  it("no RSVPs when cancelled, over, closed (agent lost Pro), or while the consent text is a placeholder; guests 0-10", async () => {
    const e = await makeEvent()
    expect((await rsvp(e.code, { guests: 11 })).status).toBe(422)
    r.consent = { ...r.consent, pending: true }
    expect((await rsvp(e.code)).status).toBe(409)
    r.consent = { ...r.consent, pending: false }
    r.tier = "basic"
    const { eventPageFor } = await ev()
    expect((await eventPageFor(e.code))?.state).toBe("closed")
    expect((await rsvp(e.code)).status).toBe(404)
    r.tier = "pro"
    await call(eventRoute, "DELETE", undefined, { id: e.id })
    expect((await eventPageFor(e.code))?.state).toBe("cancelled")
    expect((await rsvp(e.code)).status).toBe(404)
    expect((await eventPageFor(e.code, new Date("2100-01-01")))?.state).toBe("cancelled")
    r.active = false
    expect(await eventPageFor(e.code)).toBeNull()
    expect(await eventPageFor("nonexistent")).toBeNull()
  })

  it("an event that's over shows as ended", async () => {
    const e = await makeEvent()
    const { eventPageFor } = await ev()
    expect((await eventPageFor(e.code, new Date("2099-03-07T00:00:00Z")))?.state).toBe("ended")
  })
})

describe("the day-before reminder", () => {
  it("tomorrow in the event's zone: one reminder per RSVP with an email, in their language; never twice; none for other days or cancelled events", async () => {
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(NOW)
    const e = await makeEvent({ date: "2027-03-02", time: "18:00", timezone: "America/Chicago" })
    const later = await makeEvent({ date: "2027-03-04" })
    const cancelled = await makeEvent({ date: "2027-03-02", title: "Called off" })
    await rsvp(e.code)
    await rsvp(e.code, { name: "No Email", email: "", lang: "en" })
    await rsvp(later.code)
    await rsvp(cancelled.code)
    await call(eventRoute, "DELETE", undefined, { id: cancelled.id })
    const { runEventReminders } = await import("@/lib/enterprise/portal/event-reminders")
    const run = await runEventReminders(new Date("2027-03-01T14:00:00Z"))
    expect(run).toMatchObject({ events: 1, sent: 1, noEmail: 1, failed: 0 })
    expect(r.reminders).toEqual([expect.objectContaining({ to: "ana@x.test", lang: "es", firstName: "Ana", title: "Enrollment day", place: "Library, 1 Main St, Bowling Green, KY", agentName: "Pat Lee", agentPhone: "(270) 555-0100", pageUrl: e.link })])
    expect(String(r.reminders[0].when)).toContain("2 de marzo")
    expect((await runEventReminders(new Date("2027-03-01T15:00:00Z"))).sent).toBe(0)
  })
})

describe("the agent's day-before email", () => {
  it("once per event, in the agent's language, with every RSVP (name, guests, phone, email)", async () => {
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(NOW)
    const e = await makeEvent({ date: "2027-03-02", time: "18:00" })
    await rsvp(e.code)
    await rsvp(e.code, { name: "No Email", email: "", lang: "en", guests: 0 })
    const { runEventReminders } = await import("@/lib/enterprise/portal/event-reminders")
    expect(await runEventReminders(new Date("2027-03-01T14:00:00Z"))).toMatchObject({ agentSent: 1, sent: 1 })
    expect(r.agentReminders).toEqual([expect.objectContaining({
      to: "agent@x.test", lang: "es", title: "Enrollment day", place: "Library, 1 Main St, Bowling Green, KY",
      rsvps: [{ name: "Ana Ruiz", phone: "(270) 555-0199", email: "ana@x.test", guests: 2 }, { name: "No Email", phone: "(270) 555-0199", email: null, guests: 0 }],
    })])
    expect(String(r.agentReminders[0].eventUrl)).toMatch(new RegExp(`/agent/events/${e.id}$`))
    await rsvp(e.code, { name: "Late Comer" })
    expect(await runEventReminders(new Date("2027-03-01T20:00:00Z"))).toMatchObject({ agentSent: 0, sent: 1 })
    expect(r.agentReminders).toHaveLength(1)
  })

  it("an event with no RSVPs still gets the agent's email (an empty list)", async () => {
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(NOW)
    await makeEvent({ date: "2027-03-02" })
    const { runEventReminders } = await import("@/lib/enterprise/portal/event-reminders")
    await runEventReminders(new Date("2027-03-01T14:00:00Z"))
    expect(r.agentReminders).toEqual([expect.objectContaining({ rsvps: [] })])
  })
})

describe("admin: Events list, Hide and Unhide", () => {
  const admin = () => import("@/app/api/admin/enterprise/nop/events/route") as Promise<Record<string, unknown>>

  it("lists every event with its agent, RSVPs and status", async () => {
    const e = await makeEvent()
    await rsvp(e.code)
    const list = await call(admin, "GET")
    expect(list.json.events).toEqual([expect.objectContaining({ id: e.id, agentId: "858980", title: "Enrollment day", rsvps: 1, guests: 3, status: "upcoming" })])
  })

  it("hide: the page says only that it isn't available, no RSVPs, no reminders; agent emailed in their language; logged. Unhide puts it back", async () => {
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(NOW)
    const e = await makeEvent({ date: "2027-03-02" })
    await rsvp(e.code)
    expect((await call(admin, "POST", { id: e.id, action: "hide" })).json).toMatchObject({ ok: true, hidden: true, agentEmailed: true })
    const { eventPageFor } = await ev()
    expect((await eventPageFor(e.code))).toMatchObject({ state: "hidden", open: false })
    expect((await rsvp(e.code)).status).toBe(404)
    const { runEventReminders } = await import("@/lib/enterprise/portal/event-reminders")
    expect(await runEventReminders(new Date("2027-03-01T14:00:00Z"))).toMatchObject({ events: 0, sent: 0, agentSent: 0 })
    expect(r.hiddenNotices).toEqual([expect.objectContaining({ to: "agent@x.test", lang: "es", title: "Enrollment day", hidden: true })])
    expect(r.audits).toEqual([`event.hide "Enrollment day" (${e.code}), agent 858980`])
    expect((await call(admin, "GET")).json.events[0]).toMatchObject({ status: "hidden", hiddenBy: "quinn@x.test" })
    expect((await call(admin, "POST", { id: e.id, action: "hide" })).status).toBe(409)

    expect((await call(admin, "POST", { id: e.id, action: "unhide" })).json).toMatchObject({ ok: true, hidden: false })
    expect((await eventPageFor(e.code))?.state).toBe("open")
    expect(r.hiddenNotices[1]).toMatchObject({ hidden: false })
    expect(r.audits[1]).toMatch(/^event\.unhide /)
  })

  it("admins only", async () => {
    const e = await makeEvent()
    r.admin = false
    expect((await call(admin, "GET")).status).toBe(401)
    expect((await call(admin, "POST", { id: e.id, action: "hide" })).status).toBe(401)
    const { eventPageFor } = await ev()
    expect((await eventPageFor(e.code))?.state).toBe("open")
  })
})
