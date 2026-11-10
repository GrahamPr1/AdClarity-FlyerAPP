import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextRequest } from "next/server"

/**
 * The SMS opt-out list (groundwork; nothing texts yet): US numbers normalized,
 * add-only, admins only; canText() is the single check any future texting
 * must pass: agreed to texts, for that same number, not opted out.
 */

const r = vi.hoisted(() => ({ h: new Map<string, Record<string, unknown>>(), lists: new Map<string, unknown[]>(), admin: true, audits: [] as string[] }))
vi.mock("@upstash/redis", () => {
  const fake = {
    hget: async (k: string, f: string) => r.h.get(k)?.[f] ?? null,
    hset: async (k: string, v: Record<string, unknown>) => void r.h.set(k, { ...(r.h.get(k) ?? {}), ...v }),
    hgetall: async (k: string) => r.h.get(k) ?? null,
    lpush: async (k: string, v: unknown) => r.lists.set(k, [v, ...(r.lists.get(k) ?? [])]).get(k)!.length,
  }
  return { Redis: { fromEnv: () => fake } }
})
vi.mock("@/lib/enterprise/program-admins", () => ({
  requireNopAdmin: async () => (r.admin ? { admin: "quinn@x.test", name: "Quinn", role: "program" } : { response: Response.json({ error: "Unauthorized" }, { status: 401 }) }),
  audit: async (_w: unknown, a: string, d: string) => void r.audits.push(`${a} ${d}`),
}))

beforeEach(() => { r.h.clear(); r.lists.clear(); r.admin = true; r.audits.length = 0 })
const lib = () => import("@/lib/enterprise/sms-optout")
const consent = (agreed: boolean, phone = "(270) 555-0199") => ({ agreed, text: "t", textId: "x", version: 2, lang: "en" as const, at: "t", phone })

describe("sms opt-outs", () => {
  it("normalizes US numbers; refuses anything else", async () => {
    const { normalizeUsPhone } = await lib()
    expect(normalizeUsPhone("(270) 555-0199")).toBe("+12705550199")
    expect(normalizeUsPhone("+1 270.555.0199")).toBe("+12705550199")
    expect(normalizeUsPhone("555-0199")).toBeNull()
    expect(normalizeUsPhone("(070) 555-0199")).toBeNull()
  })

  it("canText: only a yes, for the same number, not opted out", async () => {
    const { canText, addSmsOptOut } = await lib()
    expect(await canText({ phone: "270-555-0199", smsConsent: consent(true) })).toBe(true)
    expect(await canText({ phone: "270-555-0199", smsConsent: consent(false) })).toBe(false)
    expect(await canText({ phone: "270-555-0199", smsConsent: null })).toBe(false)
    expect(await canText({ phone: "270-555-0100", smsConsent: consent(true) })).toBe(false)
    await addSmsOptOut("2705550199", "admin", "Replied STOP")
    expect(await canText({ phone: "270-555-0199", smsConsent: consent(true) })).toBe(false)
  })

  it("admin adds a number (once), it's listed, the admin log keeps only the last 4 digits; others get 401", async () => {
    const route = await import("@/app/api/admin/enterprise/nop/sms-optouts/route")
    const post = (body: unknown) => route.POST(new NextRequest("http://x", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }))
    expect((await (await post({ phone: "(270) 555-0199", note: "Replied STOP" })).json())).toMatchObject({ ok: true, already: false, optOut: { phone: "+12705550199", by: "quinn@x.test", note: "Replied STOP" } })
    expect((await (await post({ phone: "270 555 0199" })).json()).already).toBe(true)
    expect((await post({ phone: "12345" })).status).toBe(422)
    expect((await (await route.GET(new NextRequest("http://x"))).json()).optOuts).toHaveLength(1)
    expect(r.audits).toEqual(["sms_optout.add number ending 0199"])
    r.admin = false
    expect((await post({ phone: "2705550100" })).status).toBe(401)
  })
})
