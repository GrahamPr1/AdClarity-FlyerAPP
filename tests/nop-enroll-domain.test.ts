import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { NextRequest } from "next/server"

/**
 * The NOP enrollment setting, in three parts: the forward URL template (where
 * QRs go), the printed address (a short template, or oneflyer.org/a/<code>),
 * and the program page. Until saved, it's derived from the old single
 * enrollment domain, unchanged. A save is kept only when it's valid, fits
 * both kits, its URLs load right now, and the test agent's page shows a real
 * partner (or the admin saves anyway); each save is logged. Plus the name-fit
 * flag on roster import and profile changes.
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
// The page check needs a browser (tested against the real pages by hand); here it answers r.page.
const pg = vi.hoisted(() => ({ page: (url: string) => ({ url, ok: true, problem: null as string | null, text: "Enroll with Jordan" }), opened: [] as string[] }))
vi.mock("@/lib/enterprise/nop-enroll-check", () => ({ checkEnrollPage: async (url: string) => (pg.opened.push(url), pg.page(url)) }))

const notFoundDns = () => Object.assign(new TypeError("fetch failed"), { cause: { code: "ENOTFOUND" } })

beforeEach(() => {
  vi.stubEnv("SESSION_SECRET", "test-secret")
  r.h.clear(); r.l.clear(); r.fetched.length = 0; pg.opened.length = 0
  pg.page = (url) => ({ url, ok: true, problem: null, text: "Enroll with Jordan" })
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

const NEW = {
  forwardTemplate: "https://neighbor.basicbenefits.com/member-enrollment?agent_code={id}",
  printed: "short",
  printedTemplate: "join.basicbenefits.com/{id}",
  programUrl: "https://neighbor.basicbenefits.com/",
}

describe("the setting", () => {
  it("until saved, it's the old domain as three parts: exactly the URLs and printed address as before", async () => {
    const { getEnrollTargets, getSavedEnrollSettings } = await lib()
    const { qrDestinationFor, programEnrollmentUrl, printedEnrollAddress } = await import("@/lib/enterprise/nop-roster")
    expect(await getSavedEnrollSettings()).toBeNull()
    r.h.set("nop-flyers:settings", { enrollDomain: "join.basicbenefits.com" })
    const t = await getEnrollTargets()
    expect(t).toEqual({ forwardTemplate: "https://join.basicbenefits.com/{id}", printed: "short", printedTemplate: "join.basicbenefits.com/{id}", programUrl: "https://join.basicbenefits.com/" })
    expect(qrDestinationFor("123456", t)).toBe(qrDestinationFor("123456", "join.basicbenefits.com"))
    expect(qrDestinationFor("123456", t)).toBe("https://join.basicbenefits.com/123456")
    expect(programEnrollmentUrl(t)).toBe("https://join.basicbenefits.com/")
    expect(printedEnrollAddress("123456", "Ab3dEf7", t)).toEqual({ prefix: "join.basicbenefits.com/", slot: "123456", text: "join.basicbenefits.com/123456", href: "https://join.basicbenefits.com/123456" })
  })

  it("the three parts: forward URL with the ID in the query, a short printed address, or the agent's own link", async () => {
    const { qrDestinationFor, printedEnrollAddress, nopQrTarget } = await import("@/lib/enterprise/nop-roster")
    const t = { ...NEW, printed: "short" as const }
    expect(qrDestinationFor("123456", t)).toBe("https://neighbor.basicbenefits.com/member-enrollment?agent_code=123456")
    expect(nopQrTarget("123456", { status: "active" }, t)).toBe("https://neighbor.basicbenefits.com/member-enrollment?agent_code=123456")
    expect(nopQrTarget("123456", { status: "suspended" }, t)).toBe("https://neighbor.basicbenefits.com/")
    expect(printedEnrollAddress("123456", "Ab3dEf7", t).text).toBe("join.basicbenefits.com/123456")
    const code = { ...t, printed: "code" as const, printedTemplate: null }
    expect(printedEnrollAddress("123456", "Ab3dEf7", code)).toEqual({ prefix: "oneflyer.org/a/", slot: "Ab3dEf7", text: "oneflyer.org/a/Ab3dEf7", href: "https://oneflyer.org/a/Ab3dEf7" })
  })

  it.each([
    ["forwardTemplate", { forwardTemplate: "https://evil.com/{id}" }],
    ["forwardTemplate", { forwardTemplate: "http://join.basicbenefits.com/{id}" }],
    ["forwardTemplate", { forwardTemplate: "https://join.basicbenefits.com/" }],
    ["forwardTemplate", { forwardTemplate: "https://join.basicbenefits.com/{id}/{id}" }],
    ["forwardTemplate", { forwardTemplate: "https://basicbenefits.com.evil.com/{id}" }],
    ["printed", { printed: "long" }],
    ["printedTemplate", { printedTemplate: "join.basicbenefits.com/?id={id}" }],
    ["printedTemplate", { printedTemplate: "join.basicbenefits.com/{id}/x" }],
    ["printedTemplate", { printedTemplate: "evil.com/{id}" }],
    ["printedTemplate", { printedTemplate: "a-very-long-enrollment-subdomain.neighbor.basicbenefits.com/{id}" }],
    ["programUrl", { programUrl: "https://evil.com/" }],
    ["programUrl", { programUrl: "https://join.basicbenefits.com/{id}" }],
  ])("refuses a bad %s: %j", async (field, change) => {
    expect((await lib()).checkEnrollInput({ ...NEW, ...change })).toMatchObject({ ok: false, field })
  })

  it("accepts the short template with or without https://, and the code option without one", async () => {
    const { checkEnrollInput } = await lib()
    expect(checkEnrollInput({ ...NEW, printedTemplate: " HTTPS://Join.BasicBenefits.com/{id} " })).toEqual({ ok: true, targets: { ...NEW, printed: "short" } })
    expect(checkEnrollInput({ ...NEW, printed: "code", printedTemplate: "ignored" })).toEqual({ ok: true, targets: { ...NEW, printed: "code", printedTemplate: null } })
  })

  it("the URLs a save checks: the test agent's forward URL, their short printed address, and the program page", async () => {
    const { enrollUrlsToCheck, checkEnrollTargets } = await lib()
    const t = { ...NEW, printed: "short" as const }
    expect(enrollUrlsToCheck(t)).toEqual({ agent: "https://neighbor.basicbenefits.com/member-enrollment?agent_code=858980", printed: "https://join.basicbenefits.com/858980", program: "https://neighbor.basicbenefits.com/" })
    expect(enrollUrlsToCheck({ ...t, printed: "code", printedTemplate: null }).printed).toBeNull()
    r.answer = (u) => new Response("", { status: u.includes("join.") ? 404 : 200 })
    const out = await checkEnrollTargets(t)
    expect(out.ok).toBe(false)
    expect(out.checks.find((c) => !c.ok)).toMatchObject({ url: "https://join.basicbenefits.com/858980", error: "HTTP 404" })
  })
})

describe("admin route", () => {
  async function call(method: "GET" | "POST", who: string, body?: unknown) {
    const { createSessionToken, SESSION_COOKIE } = await import("@/lib/auth")
    const mod = await import("@/app/api/admin/enterprise/nop/enroll-settings/route")
    const req = new NextRequest("http://x/api", { method, headers: { cookie: `${SESSION_COOKIE}=${await createSessionToken(who)}`, "content-type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) })
    const res = await mod[method](req)
    return { status: res.status, json: await res.json() }
  }

  it("GET before any save: derived from the old domain, not saved, what a test agent's QR forwards to and prints", async () => {
    r.answer = () => notFoundDns()
    const g = await call("GET", "admin@x.test")
    expect(g.json).toMatchObject({ saved: null, derivedFromDomain: "neighbor.basicbenefits.com", testAgentId: "858980", urls: { agent: "https://neighbor.basicbenefits.com/858980", program: "https://neighbor.basicbenefits.com/" }, printedExample: "neighbor.basicbenefits.com/858980" })
    expect(g.json.live.ok).toBe(false)
  })

  it("POST saves when everything loads and the test agent's page shows a partner; logged and audited", async () => {
    const ok = await call("POST", "admin@x.test", NEW)
    expect(ok.status).toBe(200)
    expect(pg.opened).toEqual(["https://neighbor.basicbenefits.com/member-enrollment?agent_code=858980", "https://join.basicbenefits.com/858980"])
    expect(ok.json).toMatchObject({ saved: { admin: "admin@x.test" }, derivedFromDomain: null, urls: { agent: "https://neighbor.basicbenefits.com/member-enrollment?agent_code=858980" }, printedExample: "join.basicbenefits.com/858980" })
    expect(ok.json.log[0]).toMatchObject({ admin: "admin@x.test", to: NEW, savedDespiteWarning: false, from: { forwardTemplate: "https://neighbor.basicbenefits.com/{id}" } })
    const { getSavedEnrollSettings } = await lib()
    expect(await getSavedEnrollSettings()).toMatchObject(NEW)
  })

  it("POST refuses invalid input (422, nothing fetched) and URLs that don't load (422, nothing saved)", async () => {
    const bad = await call("POST", "admin@x.test", { ...NEW, forwardTemplate: "https://join.basicbenefits.com/" })
    expect(bad).toMatchObject({ status: 422, json: { error: "invalid", field: "forwardTemplate" } })
    expect(r.fetched).toEqual([])
    r.answer = () => notFoundDns()
    const dead = await call("POST", "admin@x.test", NEW)
    expect(dead.status).toBe(422)
    expect(dead.json.checks).toHaveLength(3)
    expect(pg.opened).toEqual([])
    expect(r.h.size).toBe(0)
  })

  it("'Partner Not Found' on the test agent's page: not saved unless the admin saves anyway, and the log says so", async () => {
    pg.page = (url) => ({ url, ok: false, problem: "not_found", text: "Partner Not Found We couldn't find the enrollment portal you're looking for." })
    const warn = await call("POST", "admin@x.test", NEW)
    expect(warn).toMatchObject({ status: 409, json: { error: "page_warning" } })
    expect(warn.json.message).toContain("Save anyway only if that's expected")
    expect(r.h.size).toBe(0)
    const anyway = await call("POST", "admin@x.test", { ...NEW, saveDespiteWarning: true })
    expect(anyway.status).toBe(200)
    expect(anyway.json.log[0]).toMatchObject({ savedDespiteWarning: true, page: { problem: "not_found" } })
  })

  it("POST { check: true } opens the current test agent's page and saves nothing", async () => {
    const c = await call("POST", "admin@x.test", { check: true })
    expect(c.json.pages).toEqual([expect.objectContaining({ url: "https://neighbor.basicbenefits.com/858980", ok: true })])
    expect(r.h.size).toBe(0)
  })

  it("non-admins can't read or change it", async () => {
    expect((await call("GET", "agent@x.test")).status).toBe(401)
    expect((await call("POST", "agent@x.test", NEW)).status).toBe(401)
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
