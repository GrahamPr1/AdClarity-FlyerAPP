import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { NextRequest } from "next/server"

/**
 * The NOP enrollment domain: one admin setting behind every agent's
 * enrollment URL (QR forward and printed address). A save is kept only when
 * it's a basicbenefits.com host, the test agent's URL and the program page
 * load right now, and the printed link fits the kit-v2 footer; each save is
 * logged. Plus the name-fit flag on roster import and profile changes.
 */

const r = vi.hoisted(() => ({ h: new Map<string, Record<string, string>>(), l: new Map<string, unknown[]>(), fetched: [] as string[], answer: (_u: string): Response | Error => new Response("ok", { status: 200 }) }))
vi.mock("@upstash/redis", () => {
  const fake = {
    hget: async (k: string, f: string) => r.h.get(k)?.[f] ?? null,
    hgetall: async (k: string) => r.h.get(k) ?? null,
    hset: async (k: string, v: Record<string, string>) => void r.h.set(k, { ...(r.h.get(k) ?? {}), ...v }),
    lpush: async (k: string, v: unknown) => void r.l.set(k, [v, ...(r.l.get(k) ?? [])]),
    lrange: async (k: string, a: number, b: number) => (r.l.get(k) ?? []).slice(a, b + 1),
  }
  return { Redis: { fromEnv: () => fake } }
})
vi.mock("@/lib/admin", () => ({ isAdminSession: async (sub: string | null | undefined) => sub === "admin@x.test" }))

const notFoundDns = () => Object.assign(new TypeError("fetch failed"), { cause: { code: "ENOTFOUND" } })

beforeEach(() => {
  vi.stubEnv("SESSION_SECRET", "test-secret")
  r.h.clear(); r.l.clear(); r.fetched.length = 0
  r.answer = () => new Response("ok", { status: 200 })
  vi.stubGlobal("fetch", async (url: string) => {
    r.fetched.push(url)
    const a = r.answer(url)
    if (a instanceof Error) throw a
    return a
  })
})
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals() })

const lib = () => import("@/lib/enterprise/nop-enroll-domain")

describe("the setting", () => {
  it("defaults to the kit's domain", async () => {
    expect(await (await lib()).getEnrollDomain()).toBe("neighbor.basicbenefits.com")
  })

  it("saves a domain whose URLs load, logs it, and every URL follows it", async () => {
    const { setEnrollDomain, getEnrollDomain, listEnrollDomainLog } = await lib()
    const out = await setEnrollDomain("  https://Join.BasicBenefits.com/ ", "admin@x.test")
    expect(out.ok).toBe(true)
    expect(r.fetched.sort()).toEqual(["https://join.basicbenefits.com/", "https://join.basicbenefits.com/858980"])
    expect(await getEnrollDomain()).toBe("join.basicbenefits.com")
    const [entry] = await listEnrollDomainLog()
    expect(entry).toMatchObject({ admin: "admin@x.test", from: "neighbor.basicbenefits.com", to: "join.basicbenefits.com" })
    expect(entry.checks.every((c) => c.ok)).toBe(true)
  })

  it.each(["evil.com", "basicbenefits.com.evil.com", "join.basicbenefits.com/x", "join.basicbenefits.com:8443", "", "bad_host.basicbenefits.com"])("refuses %j without fetching or saving", async (d) => {
    const { setEnrollDomain, getEnrollDomain } = await lib()
    expect(await setEnrollDomain(d, "admin@x.test")).toEqual({ ok: false, reason: "invalid" })
    expect(r.fetched).toEqual([])
    expect(await getEnrollDomain()).toBe("neighbor.basicbenefits.com")
  })

  it("refuses a domain that doesn't resolve, or answers an error, and keeps the old one", async () => {
    const { setEnrollDomain, getEnrollDomain } = await lib()
    r.answer = () => notFoundDns()
    const a = await setEnrollDomain("neighbour.basicbenefits.com", "admin@x.test")
    expect(a).toMatchObject({ ok: false, reason: "not_loading" })
    expect(!a.ok && a.checks![0].error).toBe("the domain doesn't resolve (no DNS record)")
    r.answer = (u) => new Response("", { status: u.endsWith("/858980") ? 404 : 200 })
    const b = await setEnrollDomain("join.basicbenefits.com", "admin@x.test")
    expect(!b.ok && b.checks!.find((c) => !c.ok)).toMatchObject({ url: "https://join.basicbenefits.com/858980", status: 404, error: "HTTP 404" })
    expect(await getEnrollDomain()).toBe("neighbor.basicbenefits.com")
    expect(r.l.size).toBe(0)
  })

  it("refuses a domain whose printed link wouldn't fit the kit-v2 footer for a 10-digit Agent ID", async () => {
    const out = await (await lib()).setEnrollDomain("a-very-long-enrollment-subdomain.neighbor.basicbenefits.com", "admin@x.test")
    expect(out).toMatchObject({ ok: false, reason: "link_too_long" })
    expect(r.fetched).toEqual([])
  })
})

describe("admin route", () => {
  async function call(method: "GET" | "POST", who: string, body?: unknown) {
    const { createSessionToken, SESSION_COOKIE } = await import("@/lib/auth")
    const mod = await import("@/app/api/admin/enterprise/nop/enroll-domain/route")
    const req = new NextRequest("http://x/api", { method, headers: { cookie: `${SESSION_COOKIE}=${await createSessionToken(who)}`, "content-type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) })
    const res = await mod[method](req)
    return { status: res.status, json: await res.json() }
  }

  it("GET: the domain, the URL a test agent's QR forwards to, and whether it loads now", async () => {
    r.answer = () => notFoundDns()
    const g = await call("GET", "admin@x.test")
    expect(g.json).toMatchObject({ domain: "neighbor.basicbenefits.com", testAgentId: "858980", urls: { agent: "https://neighbor.basicbenefits.com/858980", program: "https://neighbor.basicbenefits.com/" } })
    expect(g.json.live.ok).toBe(false)
  })

  it("POST saves with a live check and answers the new forward URL; refusals are 422 with the checks", async () => {
    const ok = await call("POST", "admin@x.test", { domain: "join.basicbenefits.com" })
    expect(ok.status).toBe(200)
    expect(ok.json.urls.agent).toBe("https://join.basicbenefits.com/858980")
    r.answer = () => notFoundDns()
    const bad = await call("POST", "admin@x.test", { domain: "neighbor.basicbenefits.com" })
    expect(bad.status).toBe(422)
    expect(bad.json.checks.length).toBe(2)
  })

  it("non-admins can't read or change it", async () => {
    expect((await call("GET", "agent@x.test")).status).toBe(401)
    expect((await call("POST", "agent@x.test", { domain: "join.basicbenefits.com" })).status).toBe(401)
    expect(r.h.size).toBe(0)
  })
})

describe("name fit (kit-v2 footer)", () => {
  it("estimates within the measured widths: ordinary names fit, very long ones are flagged", async () => {
    const { footerNameWidth, nameFitsKitV2Footer, FOOTER_SPACE_PX } = await import("@/lib/enterprise/nop-render/footer-fit")
    // Measured in the real renderer with Poppins: 299.88px.
    expect(footerNameWidth("Maria Guadalupe Hernandez-Villanueva")).toBeCloseTo(299.9, 0)
    expect(nameFitsKitV2Footer("Quinn Pearl")).toBe(true)
    expect(nameFitsKitV2Footer("Brandi Ray")).toBe(true)
    expect(nameFitsKitV2Footer("Maria Guadalupe Hernandez-Villanueva de la Cruz Rodriguez")).toBe(false)
    expect(FOOTER_SPACE_PX).toBeGreaterThan(350)
  })

  it("roster import flags a name that may not fit, and still accepts the row", async () => {
    const { validateRosterCsv } = await import("@/lib/enterprise/nop-roster")
    const head = "agent_id,company_name,agent_name,roster_email,roster_phone,referral_code,enrollment_url,status"
    const long = "Maria Guadalupe Hernandez-Villanueva de la Cruz Rodriguez"
    const out = validateRosterCsv(`${head}\n858980,Co,${long},a@x.test,(270) 555-0101,R1,https://neighbor.basicbenefits.com/858980,active\n858981,Co,Brandi Ray,b@x.test,(270) 555-0102,R2,https://neighbor.basicbenefits.com/858981,active`, "neighbor.basicbenefits.com")
    expect(out.accepted).toHaveLength(2)
    expect(out.flagged).toEqual([expect.objectContaining({ agentId: "858980", reason: expect.stringContaining("kit-v2 footer") })])
  })

  it("registration and profile changes flag (for admin) only a name that may not fit", async () => {
    const { flagNameIfTooLongForFooter } = await import("@/lib/enterprise/agents-store")
    await flagNameIfTooLongForFooter("858980", "a@x.test", "Quinn Pearl")
    expect(r.l.size).toBe(0)
    await flagNameIfTooLongForFooter("858980", "a@x.test", "Maria Guadalupe Hernandez-Villanueva de la Cruz Rodriguez")
    const [flag] = [...r.l.values()][0] as Record<string, unknown>[]
    expect(flag).toMatchObject({ type: "name_too_long_for_footer", agentId: "858980", account: "a@x.test", spacePx: 357 })
    expect(flag.nameWidthPx).toBeGreaterThan(357)
  })
})
