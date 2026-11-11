import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextRequest } from "next/server"
import { defaultOrgFeatures, entitlements, portalTabs } from "@/lib/enterprise/portal/features"
import type { LeadRecord, RosterRecord } from "@/lib/types"

/**
 * The daily follow-up reminder: active Pro agents with the switch on, only
 * when something is due (the Leads tab's rule), once per day, opt-out in the
 * profile, in their language, each lead linked; admins can only dry-run it.
 */

const r = vi.hoisted(() => ({
  kv: new Map<string, unknown>(),
  lists: new Map<string, unknown[]>(),
  roster: [] as (RosterRecord & { lockedTo: string | null })[],
  tiers: new Map<string, string>(),
  profiles: new Map<string, Record<string, unknown>>(),
  leads: new Map<string, LeadRecord[]>(),
  features: {} as Record<string, boolean>,
  mails: [] as Record<string, unknown>[],
  mailFails: false,
}))
vi.mock("@upstash/redis", () => {
  const fake = {
    set: async (k: string, v: unknown, o?: { nx?: boolean }) => { if (o?.nx && r.kv.has(k)) return null; r.kv.set(k, v); return "OK" },
    del: async (k: string) => (r.kv.delete(k) ? 1 : 0),
    lpush: async (k: string, v: unknown) => r.lists.set(k, [v, ...(r.lists.get(k) ?? [])]).get(k)!.length,
    ltrim: async () => "OK",
    lrange: async (k: string, a: number, b: number) => (r.lists.get(k) ?? []).slice(a, b + 1),
  }
  return { Redis: { fromEnv: () => fake } }
})
vi.mock("@/lib/enterprise/agents-store", () => ({ listRoster: async () => r.roster }))
vi.mock("@/lib/store", () => ({ getAgentProfile: async (e: string) => r.profiles.get(e) ?? null }))
vi.mock("@/lib/enterprise/portal/agent-data", () => ({ listAgentLeads: async (id: string) => r.leads.get(id) ?? [] }))
vi.mock("@/lib/email", () => ({ sendFollowUpReminder: async (i: Record<string, unknown>) => (r.mailFails ? { sent: false, reason: "down" } : (r.mails.push(i), { sent: true })) }))
vi.mock("@/lib/enterprise/portal/context", () => ({
  loadPortalContext: async (email: string) => {
    const rec = r.roster.find((x) => x.lockedTo === email)
    if (!rec) return null
    const base = { tier: r.tiers.get(email) ?? "basic", orgFeatures: r.features, active: rec.status === "active" }
    return { email, agent: { agentId: rec.agentId, profile: { name: rec.agentName, preferredLanguage: "es" } }, orgId: "nop", ...base, can: entitlements(base as never), tabs: portalTabs(base as never) }
  },
}))
vi.mock("@/lib/enterprise/program-admins", () => ({ requireNopAdmin: async () => ({ admin: "quinn@x.test", name: "Quinn", role: "program" }) }))

const lead = (id: string, over: Partial<LeadRecord> = {}): LeadRecord => ({ id, flyerId: "f", code: "c", name: `Lead ${id}`, phone: "1", email: null, message: null, createdAt: "2026-11-09T15:00:00Z", ...over } as LeadRecord)
const NOW = new Date("2026-11-11T14:00:00Z") // 9am Eastern, 11 Nov
const agent = (agentId: string, email: string, tier: string, status: RosterRecord["status"] = "active") => {
  r.roster.push({ agentId, companyName: "", agentName: email, rosterEmail: email, rosterPhone: "", referralCode: "", enrollmentUrl: "", enrollmentUrlMismatch: false, status, importedAt: "", lockedTo: email })
  r.tiers.set(email, tier)
}

beforeEach(() => {
  r.kv.clear(); r.lists.clear(); r.roster.length = 0; r.tiers.clear(); r.profiles.clear(); r.leads.clear(); r.mails.length = 0; r.mailFails = false
  r.features = { ...defaultOrgFeatures(true) }
  agent("100001", "pro@x.test", "pro")
  agent("100002", "basic@x.test", "basic")
  agent("100003", "quiet@x.test", "pro")
  r.leads.set("100001", [
    lead("today", { status: "contacted", followUpOn: "2026-11-11" }),
    lead("waiting", { createdAt: "2026-11-08T12:00:00Z" }),
    lead("late", { status: "appointment", followUpOn: "2026-11-05" }),
    lead("done", { status: "enrolled", followUpOn: "2026-11-01" }),
    lead("later", { status: "contacted", followUpOn: "2026-11-20" }),
  ])
  r.leads.set("100002", [lead("b", { createdAt: "2026-11-01T00:00:00Z" })])
  r.leads.set("100003", [lead("q", { status: "contacted" })])
})
const job = () => import("@/lib/enterprise/portal/followup-reminders")

describe("the daily follow-up reminder", () => {
  it("is on by default for the program (Pro)", () => {
    expect(defaultOrgFeatures(true).followUpReminders).toBe(true)
  })

  it("lists what's due, overdue first, then today, then waiting New leads; Enrolled and future dates left out", async () => {
    const { dueLeads } = await job()
    expect(dueLeads(r.leads.get("100001")!, "2026-11-11", NOW).map((d) => [d.id, d.reason.kind])).toEqual([["late", "overdue"], ["today", "today"], ["waiting", "untouched"]])
  })

  it("emails only Pro agents with something due, in their language, linking each lead; nothing for Basic or a quiet day", async () => {
    const run = await (await job()).runFollowUpReminders({ live: true, by: "daily job", now: NOW })
    expect(run).toMatchObject({ day: "2026-11-11", withLeads: 1, sent: 1, nothingDue: 1, failed: 0 })
    expect(r.mails).toHaveLength(1)
    const m = r.mails[0] as { to: string; lang: string; leads: { id: string }[]; more: number; leadUrl: (id: string) => string }
    expect(m).toMatchObject({ to: "pro@x.test", lang: "es", more: 0 })
    expect(m.leads.map((l) => l.id)).toEqual(["late", "today", "waiting"])
    expect(m.leadUrl("late")).toBe("https://oneflyer.org/agent/leads#lead-late")
  })

  it("never twice a day; a failed send is retried on the next run", async () => {
    const { runFollowUpReminders } = await job()
    r.mailFails = true
    expect(await runFollowUpReminders({ live: true, by: "x", now: NOW })).toMatchObject({ failed: 1, sent: 0 })
    r.mailFails = false
    expect(await runFollowUpReminders({ live: true, by: "x", now: NOW })).toMatchObject({ sent: 1 })
    expect(await runFollowUpReminders({ live: true, by: "x", now: NOW })).toMatchObject({ sent: 0, already: 1 })
    expect(await runFollowUpReminders({ live: true, by: "x", now: new Date("2026-11-12T14:00:00Z") })).toMatchObject({ sent: 1 })
  })

  it("turned off by the agent, or the org switch off, or lead capture off: no email; a dry run sends nothing", async () => {
    const { runFollowUpReminders } = await job()
    expect(await runFollowUpReminders({ live: false, by: "admin", now: NOW })).toMatchObject({ mode: "dry_run", withLeads: 1, sent: 0 })
    expect(r.mails).toEqual([])
    r.profiles.set("pro@x.test", { followUpReminders: false })
    expect(await runFollowUpReminders({ live: true, by: "x", now: NOW })).toMatchObject({ optedOut: 1, sent: 0 })
    r.profiles.clear()
    r.features.followUpReminders = false
    expect(await runFollowUpReminders({ live: true, by: "x", now: NOW })).toMatchObject({ withLeads: 0, sent: 0 })
    r.features.followUpReminders = true; r.features.leads = false
    expect(await runFollowUpReminders({ live: true, by: "x", now: NOW })).toMatchObject({ withLeads: 0, sent: 0 })
  })

  it("lists at most 25, and says how many more", async () => {
    r.leads.set("100001", Array.from({ length: 30 }, (_, i) => lead(`n${i}`, { createdAt: "2026-11-01T00:00:00Z" })))
    await (await job()).runFollowUpReminders({ live: true, by: "x", now: NOW })
    expect(r.mails[0]).toMatchObject({ more: 5 })
    expect((r.mails[0].leads as unknown[]).length).toBe(25)
  })

  it("admins can only dry-run it; the cron needs the secret", async () => {
    const admin = await import("@/app/api/admin/enterprise/nop/followup-reminders/route")
    expect((await (await admin.POST(new NextRequest("http://x", { method: "POST" }))).json()).run).toMatchObject({ mode: "dry_run", by: "quinn@x.test" })
    expect(r.mails).toEqual([])
    vi.stubEnv("CRON_SECRET", "s")
    const { GET } = await import("@/app/api/cron/nop-followup-reminders/route")
    expect((await GET(new NextRequest("http://x"))).status).toBe(401)
    vi.unstubAllEnvs()
  })
})

describe("the email", () => {
  it("text part, From OneFlyer, a link per lead, the reason in the agent's language, how to turn it off", async () => {
    vi.resetModules()
    vi.doUnmock("@/lib/email")
    const sent: Record<string, unknown>[] = []
    vi.doMock("resend", () => ({ Resend: class { emails = { send: async (m: Record<string, unknown>) => (sent.push(m), { error: null }) } } }))
    vi.stubEnv("RESEND_API_KEY", "re_test")
    vi.stubEnv("RESEND_FROM_ADDRESS", "OneFlyer <noreply@oneflyer.org>")
    const { sendFollowUpReminder } = await import("@/lib/email")
    await sendFollowUpReminder({
      to: "pro@x.test", lang: "es", more: 2,
      leads: [{ id: "a", name: "Ana Ruiz", reason: { kind: "overdue", on: "2026-11-05" } }, { id: "b", name: "Bo", reason: { kind: "untouched", days: 3 } }],
      leadUrl: (id) => `https://oneflyer.org/agent/leads#lead-${id}`, leadsUrl: "https://oneflyer.org/agent/leads", profileUrl: "https://oneflyer.org/agent/profile",
    })
    const m = sent[0] as { subject: string; text: string; html: string; from: string }
    expect(m.from).toBe("OneFlyer <noreply@oneflyer.org>")
    expect(m.subject).toBe("4 contactos para dar seguimiento hoy")
    expect(m.text).toContain("Ana Ruiz — El seguimiento era para el 5 nov: https://oneflyer.org/agent/leads#lead-a")
    expect(m.text).toContain("Bo — Nuevo, esperando desde hace 3 días: https://oneflyer.org/agent/leads#lead-b")
    expect(m.text).toContain("Y 2 más en su pestaña Contactos.")
    expect(m.text).toContain("desactívelos en su perfil: https://oneflyer.org/agent/profile")
    expect(m.html).toContain('href="https://oneflyer.org/agent/leads#lead-a"')
    vi.unstubAllEnvs()
  })
})
