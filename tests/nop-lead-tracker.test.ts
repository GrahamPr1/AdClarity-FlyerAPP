import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextRequest } from "next/server"
import type { LeadRecord } from "@/lib/types"

/**
 * The lead tracker: a status (New, Contacted, Appointment set, Enrolled, Not
 * interested), private notes and an optional follow-up date per lead. Leads
 * marked "contacted" before statuses existed are Contacted. "Needs
 * follow-up": a follow-up date today or earlier (unless Enrolled or Not
 * interested), or New and untouched 2+ days. Only the agent's own leads;
 * never while an admin views as them.
 */

const r = vi.hoisted(() => ({ kv: new Map<string, unknown>(), z: new Map<string, Set<string>>(), viewingAs: false }))
vi.mock("@upstash/redis", () => {
  const fake = {
    get: async (k: string) => r.kv.get(k) ?? null,
    set: async (k: string, v: unknown) => (r.kv.set(k, v), "OK"),
    zscore: async (k: string, m: string) => (r.z.get(k)?.has(m) ? 1 : null),
  }
  return { Redis: { fromEnv: () => fake } }
})
vi.mock("@/lib/enterprise/portal/api", () => ({ requireAgentFeature: async () => ({ viewer: {}, ctx: { agent: { agentId: "858980" } } }) }))
vi.mock("@/lib/enterprise/portal/view-as", () => ({ rejectWhileViewingAs: () => (r.viewingAs ? Response.json({ error: "read_only" }, { status: 403 }) : null) }))

const lead = (over: Partial<LeadRecord> = {}): LeadRecord => ({ id: "L1", flyerId: "f", code: "c", name: "Ana", phone: "1", email: null, message: null, createdAt: "2026-11-01T15:00:00Z", ...over } as LeadRecord)
beforeEach(() => {
  r.kv.clear(); r.z.clear(); r.viewingAs = false
  r.z.set("nop-agent:858980:leads", new Set(["L1"]))
  r.kv.set("nop-lead:L1", lead())
  r.kv.set("nop-lead:L2", lead({ id: "L2" }))
})
const tracker = () => import("@/lib/enterprise/portal/lead-tracker")

describe("rules", () => {
  it("status: stored, else Contacted for leads marked contacted before statuses, else New", async () => {
    const { leadStatus } = await tracker()
    expect(leadStatus(lead())).toBe("new")
    expect(leadStatus(lead({ contactedAt: "2026-11-02T00:00:00Z" }))).toBe("contacted")
    expect(leadStatus(lead({ contactedAt: "x", status: "enrolled" }))).toBe("enrolled")
  })

  it("checks the patch: known statuses, notes up to 2000, real dates; the old 'contacted' flag maps to a status", async () => {
    const { checkTrackerPatch } = await tracker()
    expect(checkTrackerPatch({ status: "appointment", notes: "  call after 5  ", followUpOn: "2026-11-20" })).toEqual({ ok: true, patch: { status: "appointment", notes: "call after 5", followUpOn: "2026-11-20" } })
    expect(checkTrackerPatch({ status: "won" })).toEqual({ ok: false, field: "status" })
    expect(checkTrackerPatch({ notes: "x".repeat(2001) })).toEqual({ ok: false, field: "notes" })
    expect(checkTrackerPatch({ followUpOn: "2026-02-30" })).toEqual({ ok: false, field: "followUpOn" })
    expect(checkTrackerPatch({ followUpOn: "" })).toEqual({ ok: true, patch: { followUpOn: null } })
    expect(checkTrackerPatch({ contacted: true })).toEqual({ ok: true, patch: { status: "contacted" } })
    expect(checkTrackerPatch({ contacted: false })).toEqual({ ok: true, patch: { status: "new" } })
  })

  it("needs follow-up: due today or overdue (not for Enrolled / Not interested), or New and untouched 2+ days", async () => {
    const { followUpReason } = await tracker()
    const now = new Date("2026-11-10T15:00:00Z")
    expect(followUpReason(lead({ followUpOn: "2026-11-10", status: "contacted" }), "2026-11-10", now)).toEqual({ kind: "today" })
    expect(followUpReason(lead({ followUpOn: "2026-11-08", status: "appointment" }), "2026-11-10", now)).toEqual({ kind: "overdue", on: "2026-11-08" })
    expect(followUpReason(lead({ followUpOn: "2026-11-08", status: "enrolled" }), "2026-11-10", now)).toBeNull()
    expect(followUpReason(lead({ followUpOn: "2026-11-12", status: "contacted" }), "2026-11-10", now)).toBeNull()
    expect(followUpReason(lead({ createdAt: "2026-11-08T14:00:00Z" }), "2026-11-10", now)).toEqual({ kind: "untouched", days: 2 })
    expect(followUpReason(lead({ createdAt: "2026-11-09T16:00:00Z" }), "2026-11-10", now)).toBeNull()
    expect(followUpReason(lead({ createdAt: "2026-11-01T00:00:00Z", trackedAt: "2026-11-02T00:00:00Z" }), "2026-11-10", now)).toBeNull()
  })
})

describe("the API", () => {
  const patch = async (id: string, body: unknown) => {
    const { PATCH } = await import("@/app/api/enterprise/agent/leads/[id]/route")
    const res = await PATCH(new NextRequest("http://x", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }), { params: Promise.resolve({ id }) })
    return { status: res.status, json: await res.json() }
  }

  it("saves status, notes and follow-up on the agent's own lead; keeps contactedAt and the touched time in step", async () => {
    const res = await patch("L1", { status: "appointment", notes: "Prefers Spanish", followUpOn: "2026-11-20" })
    expect(res.status).toBe(200)
    const saved = r.kv.get("nop-lead:L1") as LeadRecord
    expect(saved).toMatchObject({ status: "appointment", notes: "Prefers Spanish", followUpOn: "2026-11-20" })
    expect(saved.statusAt).toBeTruthy(); expect(saved.contactedAt).toBeTruthy(); expect(saved.trackedAt).toBeTruthy()
    await patch("L1", { status: "new" })
    expect((r.kv.get("nop-lead:L1") as LeadRecord).contactedAt).toBeNull()
    await patch("L1", { followUpOn: null, notes: "" })
    expect(r.kv.get("nop-lead:L1")).toMatchObject({ followUpOn: null, notes: null, status: "new" })
  })

  it("another agent's lead: 404; bad input: 400; an admin viewing as the agent: 403, nothing saved", async () => {
    expect((await patch("L2", { status: "enrolled" })).status).toBe(404)
    expect((await patch("L1", { status: "won" })).status).toBe(400)
    expect((await patch("L1", {})).status).toBe(400)
    r.viewingAs = true
    expect((await patch("L1", { status: "enrolled" })).status).toBe(403)
    expect((r.kv.get("nop-lead:L1") as LeadRecord).status).toBeUndefined()
  })
})
