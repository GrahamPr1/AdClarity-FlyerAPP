import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { NextRequest } from "next/server"
import { defaultOrgFeatures } from "@/lib/enterprise/portal/features"

/**
 * Phase 3, the agent's personal page (/p/{code}):
 *  - exists only for an active Pro/Leader agent whose org has the agent page
 *    on; every other case is the same "not found" as a made-up code;
 *  - the photo appears only while the org's photo switch is on (off by default);
 *  - booking links: Calendly, Acuity and Google Calendar only, checked on the server;
 *  - settings writes are refused while an admin views as the agent, whose view never issues a code;
 *  - the page's lead form saves under the Agent ID only while the page and lead capture are on.
 */

const s = vi.hoisted(() => ({
  tier: "pro", active: true, features: {} as Record<string, boolean>, owner: "agent@x.test" as string | null,
  roster: { status: "active" } as { status: string } | null,
  settings: { bookingUrl: null as string | null, photo: null as null | { path: string; contentType: string; updatedAt: string }, updatedAt: null },
  issued: [] as string[], saved: [] as { agentId: string; lead: Record<string, unknown> }[], emails: [] as Record<string, unknown>[],
  puts: [] as string[], dels: [] as string[], texts: {} as Record<string, string>,
}))
vi.mock("@/lib/enterprise/nop-enroll-domain", () => ({ getEnrollDomain: async () => "neighbor.basicbenefits.com" }))
vi.mock("@/lib/admin", () => ({ isAdminSession: async (sub: string | null | undefined) => sub === "admin" }))
vi.mock("@/lib/enterprise/portal/store", () => ({ getAgentTier: async () => s.tier, getOrgFeatures: async () => s.features, touchLastActive: async () => {} }))
vi.mock("@/lib/enterprise/nop-render/agent-context", () => ({
  loadNopAgent: async (email: string) => (email === "agent@x.test"
    ? { agentId: "858980", profile: { orgId: "nop", name: "Pat Lee", displayName: "Pat Lee", displayPhone: "(270) 555-0100", displayEmail: "pat@x.test", phone: "", email: "", licenseStates: [], preferredLanguage: "es" }, status: s.active ? "active" : "suspended", active: s.active }
    : null),
}))
vi.mock("@/lib/enterprise/agents-store", () => ({
  getRosterRecord: async (id: string) => (id === "858980" ? s.roster : null),
  getAgentIdOwner: async (id: string) => (id === "858980" ? s.owner : null),
}))
vi.mock("@/lib/enterprise/nop-qr-code", () => ({
  agentIdForQrCode: async (code: string) => (code === "k7Q2mXp" ? "858980" : null),
  getAgentQrCode: async (id: string) => (id === "858980" && s.issued.length ? "k7Q2mXp" : null),
  getOrIssueAgentQrCode: async (id: string) => (s.issued.push(id), "k7Q2mXp"),
}))
vi.mock("@upstash/redis", () => ({
  Redis: { fromEnv: () => ({
    get: async (k: string) => (k === "nop-agent:858980:page" ? s.settings : null),
    set: async (k: string, v: typeof s.settings) => { if (k === "nop-agent:858980:page") s.settings = v },
  }) },
}))
vi.mock("@/lib/enterprise/portal/approved-text", async (orig) => {
  const real = await orig<typeof import("@/lib/enterprise/portal/approved-text")>()
  return {
    ...real,
    getApprovedText: async (_o: string, key: string, lang: string) => {
      const text = s.texts[`${key}:${lang}`] ?? `[PENDING ORG APPROVAL — ${key}]`
      return { id: `approved-text:nop:${key}:${lang}`, key, lang, text, version: 2, pending: real.isPendingText(text), updatedBy: "admin", updatedAt: "x" }
    },
  }
})
vi.mock("@/lib/enterprise/portal/agent-data", () => ({ saveAgentLead: async (agentId: string, lead: Record<string, unknown>) => void s.saved.push({ agentId, lead }) }))
vi.mock("@/lib/email", () => ({ sendNopAgentLeadNotification: async (e: Record<string, unknown>) => (s.emails.push(e), { sent: true }) }))
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: async () => ({ allowed: true }), clientIp: () => "1.2.3.4" }))
vi.mock("@vercel/blob", () => ({
  put: async (p: string) => void s.puts.push(p),
  del: async (p: string) => void s.dels.push(p),
  get: async () => ({ stream: new Blob(["img"]).stream(), blob: { contentType: "image/png" } }),
}))

beforeEach(() => {
  vi.stubEnv("SESSION_SECRET", "test-secret")
  Object.assign(s, { tier: "pro", active: true, features: defaultOrgFeatures(true), owner: "agent@x.test", roster: { status: "active" }, texts: {} })
  s.settings = { bookingUrl: null, photo: null, updatedAt: null }
  for (const a of [s.issued, s.saved, s.emails, s.puts, s.dels]) a.length = 0
})
afterEach(() => vi.unstubAllEnvs())

const lib = () => import("@/lib/enterprise/portal/agent-page")

describe("booking links", () => {
  it.each([
    "https://calendly.com/pat-lee/30min",
    "https://www.calendly.com/pat-lee",
    "https://app.acuityscheduling.com/schedule.php?owner=12345",
    "https://patlee.as.me/",
    "https://patlee.acuityscheduling.com/schedule.php",
    "https://calendar.app.google/AbCdEf123",
    "https://calendar.google.com/calendar/appointments/schedules/AcZssZ0abc",
    "https://calendar.google.com/calendar/u/0/appointments/schedules/AcZssZ0abc",
  ])("allowed: %s", async (url) => {
    expect((await lib()).checkBookingUrl(url)).toEqual({ ok: true, url: new URL(url).toString() })
  })

  it.each([
    ["http, not https", "http://calendly.com/pat"],
    ["a look-alike host", "https://calendly.com.evil.test/pat"],
    ["a subdomain of calendly", "https://evil.calendly.com/pat"],
    ["a different site", "https://example.com/book"],
    ["credentials in the URL", "https://pat@calendly.com/pat"],
    ["a port", "https://calendly.com:8443/pat"],
    ["calendly's home page, not a booking page", "https://calendly.com/"],
    ["a non-appointment Google Calendar page", "https://calendar.google.com/calendar/embed?src=x"],
    ["a nested acuity subdomain", "https://a.b.as.me/"],
    ["javascript:", "javascript:alert(1)"],
    ["not a URL", "calendly"],
    ["too long", `https://calendly.com/${"a".repeat(600)}`],
    ["not a string", 42],
  ])("refused: %s", async (_l, url) => {
    expect((await lib()).checkBookingUrl(url)).toEqual({ ok: false })
  })

  it("blank clears it", async () => {
    expect((await lib()).checkBookingUrl("  ")).toEqual({ ok: true, url: null })
    expect((await lib()).checkBookingUrl(null)).toEqual({ ok: true, url: null })
  })
})

describe("photo bytes", () => {
  it("JPEG, PNG and WebP by their bytes; anything else (SVG, GIF, text) is refused", async () => {
    const { sniffPhotoType } = await lib()
    expect(sniffPhotoType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg")
    expect(sniffPhotoType(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]))).toBe("image/png")
    expect(sniffPhotoType(new TextEncoder().encode("RIFF\0\0\0\0WEBPVP8 "))).toBe("image/webp")
    expect(sniffPhotoType(new TextEncoder().encode("<svg xmlns='http://www.w3.org/2000/svg'/>"))).toBeNull()
    expect(sniffPhotoType(new TextEncoder().encode("GIF89a"))).toBeNull()
  })
})

describe("who has a page", () => {
  it("an active Pro agent, page on: their display details and enrollment URL, never the Agent ID in the link", async () => {
    const page = await (await lib()).agentPageFor("k7Q2mXp")
    expect(page).toMatchObject({ name: "Pat Lee", phone: "(270) 555-0100", email: "pat@x.test", enrollUrl: expect.stringContaining("858980"), photo: null, leads: true })
    expect((await lib()).nopPageLink("k7Q2mXp")).toBe("https://oneflyer.org/p/k7Q2mXp")
  })

  it.each([
    ["a made-up code", () => {}, "zzzzzzz"],
    ["the bare Agent ID", () => {}, "858980"],
    ["a Basic agent", () => { s.tier = "basic" }],
    ["a suspended agent", () => { s.roster = { status: "suspended" }; s.active = false }],
    ["a pending agent", () => { s.roster = { status: "pending" }; s.active = false }],
    ["a terminated agent", () => { s.roster = { status: "terminated" }; s.active = false }],
    ["an ID off the roster", () => { s.roster = null }],
    ["an ID no account holds", () => { s.owner = null }],
    ["the org's agent page switched off", () => { s.features = { ...defaultOrgFeatures(true), agentPage: false } }],
  ])("%s: null (the page answers not found)", async (_l, setup, code = "k7Q2mXp") => {
    setup()
    expect(await (await lib()).agentPageFor(code)).toBeNull()
  })

  it("the photo appears only while the org's photo switch is on", async () => {
    s.settings.photo = { path: "nop-agent-photos/a.png", contentType: "image/png", updatedAt: "t" }
    expect((await (await lib()).agentPageFor("k7Q2mXp"))!.photo).toBeNull()
    s.features = { ...defaultOrgFeatures(true), agentPhoto: true }
    expect((await (await lib()).agentPageFor("k7Q2mXp"))!.photo).toMatchObject({ path: "nop-agent-photos/a.png" })
  })

  it("packages: only org-approved text, verbatim, first line as the heading; placeholders hidden", async () => {
    s.texts = { "packageP2:en": "Complete Virtual Care\nLine one.\nLine two." }
    expect(await (await lib()).approvedPackages("nop", "en")).toEqual([{ pkg: "P2", heading: "Complete Virtual Care", body: "Line one.\nLine two." }])
    expect(await (await lib()).approvedPackages("nop", "es")).toEqual([])
  })
})

async function cookieFor(sub: string, viewAs?: string) {
  const { createSessionToken, SESSION_COOKIE } = await import("@/lib/auth")
  const { createViewAsToken, VIEW_AS_COOKIE } = await import("@/lib/enterprise/portal/view-as")
  return `${SESSION_COOKIE}=${await createSessionToken(sub)}${viewAs ? `; ${VIEW_AS_COOKIE}=${await createViewAsToken(sub, viewAs)}` : ""}`
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- route handlers take differently typed contexts
async function call(load: () => Promise<any>, method: string, url: string, opts: { who?: string; viewAs?: string; params?: Record<string, string>; body?: unknown; form?: FormData } = {}) {
  const mod = await load()
  const headers: Record<string, string> = opts.form ? {} : { "content-type": "application/json" }
  if (opts.who) headers.cookie = await cookieFor(opts.who, opts.viewAs)
  const body = opts.form ?? (opts.body !== undefined ? JSON.stringify(opts.body) : undefined)
  const res = await mod[method](new NextRequest(`http://x${url}`, { method, headers, ...(body !== undefined ? { body } : {}) }), opts.params ? { params: Promise.resolve(opts.params) } : undefined)
  return { status: res.status as number, headers: res.headers as Headers, json: await res.clone().json().catch(() => null), res: res as Response }
}

const settings = () => import("@/app/api/enterprise/agent/page/route")
const photo = () => import("@/app/api/enterprise/agent/page/photo/route")
const qr = () => import("@/app/api/enterprise/agent/page/qr/route")
const publicPhoto = () => import("@/app/p/[code]/photo/route")
const publicLead = () => import("@/app/api/enterprise/nop/leads/[code]/route")
const png = () => { const f = new FormData(); f.set("file", new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2])], "me.png", { type: "image/png" })); return f }

describe("page settings routes", () => {
  it("the agent: GET issues their code and returns the /p link; PATCH saves an allowed booking link", async () => {
    const got = await call(settings, "GET", "/api/enterprise/agent/page", { who: "agent@x.test" })
    expect(got.json).toEqual({ link: "https://oneflyer.org/p/k7Q2mXp", bookingUrl: null, hasPhoto: false, photoAllowed: false })
    expect(s.issued).toEqual(["858980"])
    const saved = await call(settings, "PATCH", "/api/enterprise/agent/page", { who: "agent@x.test", body: { bookingUrl: "https://calendly.com/pat-lee" } })
    expect(saved.status).toBe(200)
    expect(s.settings.bookingUrl).toBe("https://calendly.com/pat-lee")
  })

  it("a booking link off the list: 422, nothing saved", async () => {
    const r = await call(settings, "PATCH", "/api/enterprise/agent/page", { who: "agent@x.test", body: { bookingUrl: "https://example.com/book" } })
    expect(r.status).toBe(422)
    expect(s.settings.bookingUrl).toBeNull()
  })

  it("an admin viewing as the agent: GET works and issues nothing; PATCH, photo upload and removal are refused", async () => {
    const got = await call(settings, "GET", "/api/enterprise/agent/page", { who: "admin", viewAs: "agent@x.test" })
    expect(got.status).toBe(200)
    expect(got.json.link).toBeNull()
    expect(s.issued).toEqual([])
    s.features = { ...defaultOrgFeatures(true), agentPhoto: true }
    expect((await call(settings, "PATCH", "/api/enterprise/agent/page", { who: "admin", viewAs: "agent@x.test", body: { bookingUrl: "https://calendly.com/x" } })).status).toBe(403)
    expect((await call(photo, "POST", "/api/enterprise/agent/page/photo", { who: "admin", viewAs: "agent@x.test", form: png() })).status).toBe(403)
    expect((await call(photo, "DELETE", "/api/enterprise/agent/page/photo", { who: "admin", viewAs: "agent@x.test" })).status).toBe(403)
    expect(s.settings.bookingUrl).toBeNull(); expect(s.puts).toEqual([])
  })

  it.each([
    ["Basic", () => { s.tier = "basic" }],
    ["suspended", () => { s.active = false }],
    ["page switched off", () => { s.features = { ...defaultOrgFeatures(true), agentPage: false } }],
  ])("%s: 403 on every settings route, no data", async (_l, setup) => {
    setup()
    for (const [load, method] of [[settings, "GET"], [settings, "PATCH"], [qr, "GET"], [photo, "POST"]] as const) {
      const r = await call(load, method, "/api/enterprise/agent/page", { who: "agent@x.test", body: method === "PATCH" ? { bookingUrl: "" } : undefined, form: method === "POST" ? png() : undefined })
      expect(r.status, `${method}`).toBe(403)
    }
    expect(s.issued).toEqual([])
  })

  it("photo upload needs the photo switch (off by default)", async () => {
    expect((await call(photo, "POST", "/api/enterprise/agent/page/photo", { who: "agent@x.test", form: png() })).status).toBe(403)
    expect(s.puts).toEqual([])
  })

  it("with photos on: a real image is stored privately under a random name; a fake one is refused; replacing deletes the old file", async () => {
    s.features = { ...defaultOrgFeatures(true), agentPhoto: true }
    const fake = new FormData(); fake.set("file", new File(["<svg/>"], "x.png", { type: "image/png" }))
    expect((await call(photo, "POST", "/api/enterprise/agent/page/photo", { who: "agent@x.test", form: fake })).status).toBe(422)
    expect((await call(photo, "POST", "/api/enterprise/agent/page/photo", { who: "agent@x.test", form: png() })).status).toBe(200)
    const first = s.settings.photo!.path
    expect(first).toMatch(/^nop-agent-photos\/[0-9a-f-]{36}\.png$/)
    await call(photo, "POST", "/api/enterprise/agent/page/photo", { who: "agent@x.test", form: png() })
    expect(s.dels).toEqual([first])
    await call(photo, "DELETE", "/api/enterprise/agent/page/photo", { who: "agent@x.test" })
    expect(s.settings.photo).toBeNull()
  })

  it("the public photo route serves it only while the photo switch is on", async () => {
    s.settings.photo = { path: "nop-agent-photos/a.png", contentType: "image/png", updatedAt: "t" }
    const off = await call(publicPhoto, "GET", "/p/k7Q2mXp/photo", { params: { code: "k7Q2mXp" } })
    expect(off.status).toBe(404)
    s.features = { ...defaultOrgFeatures(true), agentPhoto: true }
    const on = await call(publicPhoto, "GET", "/p/k7Q2mXp/photo", { params: { code: "k7Q2mXp" } })
    expect(on.status).toBe(200)
    expect(on.headers.get("cache-control")).toBe("no-store")
    expect((await call(publicPhoto, "GET", "/p/zzzzzzz/photo", { params: { code: "zzzzzzz" } })).status).toBe(404)
  })

  it("QR download: the /p link as a PNG or SVG attachment; none before a code exists", async () => {
    expect((await call(qr, "GET", "/api/enterprise/agent/page/qr", { who: "agent@x.test" })).status).toBe(404)
    s.issued.push("858980")
    const p = await call(qr, "GET", "/api/enterprise/agent/page/qr?format=png", { who: "agent@x.test" })
    expect(p.headers.get("content-type")).toBe("image/png")
    expect(p.headers.get("content-disposition")).toContain("attachment")
    const svg = await call(qr, "GET", "/api/enterprise/agent/page/qr?format=svg", { who: "agent@x.test" })
    expect(svg.headers.get("content-type")).toBe("image/svg+xml")
    expect(await svg.res.text()).toContain("<svg")
  })
})

describe("the page's lead form", () => {
  const good = { name: "Ana Ruiz", phone: "(270) 555-0199", email: "ana@x.test", consent: true, consentVersion: 2, lang: "en", source: "page" }
  const submit = (body: unknown, code = "k7Q2mXp") => call(publicLead, "POST", `/api/enterprise/nop/leads/${code}`, { params: { code }, body })

  it("page on, lead capture on, consent approved: saved under the Agent ID, marked as from the page; the QR lead page switch isn't needed", async () => {
    s.texts = { "leadConsent:en": "I agree to be contacted." }
    expect((await submit(good)).status).toBe(200)
    expect(s.saved).toEqual([{ agentId: "858980", lead: expect.objectContaining({ flyerId: "nop-agent-page:858980", code: "k7Q2mXp", consent: expect.objectContaining({ text: "I agree to be contacted.", version: 2 }) }) }])
    expect(s.emails[0]).toMatchObject({ to: "agent@x.test", fromPage: true })
  })

  it("while the consent text is the placeholder: nothing accepted", async () => {
    expect((await submit(good)).status).toBe(409)
    expect(s.saved).toEqual([])
  })

  it.each([
    ["the page switched off", () => { s.features = { ...defaultOrgFeatures(true), agentPage: false } }],
    ["lead capture switched off", () => { s.features = { ...defaultOrgFeatures(true), leads: false } }],
    ["a Basic agent", () => { s.tier = "basic" }],
  ])("%s: 404, nothing saved", async (_l, setup) => {
    s.texts = { "leadConsent:en": "I agree to be contacted." }
    setup()
    expect((await submit(good)).status).toBe(404)
    expect(s.saved).toEqual([])
  })
})
