import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { NextRequest } from "next/server"

/**
 * The signup conversion (GTM `sign_up` for the Meta tag, GA4 `sign_up` via
 * gtag) fires exactly once per NEW account and carries nothing personal.
 */

const store = vi.hoisted(() => ({
  hash: null as string | null,
  client: null as object | null,
  createdAt: null as string | null,
}))
vi.mock("@/lib/store", () => ({
  getClientPasswordHash: async () => store.hash,
  getClient: async () => store.client,
  getClientCreatedAt: async () => store.createdAt,
  setClientPasswordHash: async () => {},
  recordClientCreatedAtIfUnset: async () => {},
  verifyAndConsumePasswordResetToken: async () => true,
}))
vi.mock("@/lib/auth", () => ({
  createSessionToken: async () => "session",
  hashPassword: async () => "hashed",
  SESSION_COOKIE: "session",
  SESSION_MAX_AGE_SECONDS: 60,
}))

const post = (url: string, body: object) =>
  new NextRequest(url, { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } })

describe("trackSignup", () => {
  let win: { dataLayer?: unknown[]; gtag?: (...a: unknown[]) => void; sessionStorage: Storage }
  const gtagCalls: unknown[][] = []
  // As on the site: gtag() pushes its arguments onto the shared dataLayer.

  beforeEach(() => {
    vi.resetModules()
    gtagCalls.length = 0
    const data = new Map<string, string>()
    win = {
      gtag: (...a: unknown[]) => {
        gtagCalls.push(a)
        ;(win.dataLayer ??= []).push(a)
      },
      sessionStorage: {
        getItem: (k: string) => data.get(k) ?? null,
        setItem: (k: string, v: string) => void data.set(k, v),
        removeItem: (k: string) => void data.delete(k),
      } as Storage,
    }
    vi.stubGlobal("window", win)
  })
  afterEach(() => vi.unstubAllGlobals())

  it("makes exactly one dataLayer entry: the gtag event, which GA4 and GTM's Meta tag both read", async () => {
    const { trackSignup } = await import("@/lib/analytics")
    trackSignup("email", "id-1")
    expect(gtagCalls).toEqual([["event", "sign_up", { method: "email" }]])
    // No separate { event: 'sign_up' } object: GTM would fire the Meta tag for it a second time.
    expect(win.dataLayer).toEqual([["event", "sign_up", { method: "email" }]])
  })

  it("ignores a second call for the same signup, even after a reload", async () => {
    const first = await import("@/lib/analytics")
    first.trackSignup("email", "id-1")
    first.trackSignup("email", "id-1")
    vi.resetModules() // a reload: fresh module state, same sessionStorage
    const reloaded = await import("@/lib/analytics")
    reloaded.trackSignup("email", "id-1")
    expect(win.dataLayer).toHaveLength(1)
    expect(gtagCalls).toHaveLength(1)
  })

  it("a signup queued before a full navigation fires once on the next page, and never again", async () => {
    const { queueSignup } = await import("@/lib/analytics")
    queueSignup("email", "id-3")
    expect(win.dataLayer).toBeUndefined() // nothing on the page that's about to unload
    vi.resetModules() // the next page load
    const next = await import("@/lib/analytics")
    next.flushPendingSignup()
    next.flushPendingSignup() // StrictMode's second effect run, a route change
    vi.resetModules() // a reload of that page
    ;(await import("@/lib/analytics")).flushPendingSignup()
    expect(gtagCalls).toEqual([["event", "sign_up", { method: "email" }]])
  })

  it("pushes the plain GTM event when GA4 isn't loaded, and never throws on blocked storage", async () => {
    delete win.gtag
    win.sessionStorage.getItem = () => {
      throw new Error("blocked")
    }
    const { trackSignup } = await import("@/lib/analytics")
    expect(() => trackSignup("email_link", "id-2")).not.toThrow()
    trackSignup("email_link", "id-2")
    expect(win.dataLayer).toEqual([{ event: "sign_up", method: "email_link" }])
  })
})

describe("the server marks only new accounts", () => {
  beforeEach(() => {
    store.hash = null
    store.client = null
    store.createdAt = null
  })

  it("email signup returns a one-time signupId", async () => {
    const { POST } = await import("@/app/api/auth/signup/route")
    const a = await (await POST(post("http://x/api/auth/signup", { email: "a@b.co", password: "12345678" }))).json()
    const b = await (await POST(post("http://x/api/auth/signup", { email: "c@d.co", password: "12345678" }))).json()
    expect(a.signupId).toMatch(/^[0-9a-f-]{36}$/)
    expect(b.signupId).not.toBe(a.signupId)
  })

  it("an existing email gets a 409, so no signupId", async () => {
    store.hash = "existing"
    const { POST } = await import("@/app/api/auth/signup/route")
    const res = await POST(post("http://x/api/auth/signup", { email: "a@b.co", password: "12345678" }))
    expect(res.status).toBe(409)
    expect((await res.json()).signupId).toBeUndefined()
  })

  it("a reset link counts only when it creates a brand-new account", async () => {
    const { POST } = await import("@/app/api/auth/reset-password/route")
    const reset = async () => (await POST(post("http://x/api/auth/reset-password", { email: "a@b.co", token: "t", password: "12345678" }))).json()
    expect((await reset()).signupId).toMatch(/^[0-9a-f-]{36}$/)
    store.hash = "existing" // an ordinary password reset
    expect((await reset()).signupId).toBeUndefined()
    store.hash = null
    store.client = { plan: "trial" } // a pre-password-era account claiming its first password
    expect((await reset()).signupId).toBeUndefined()
  })
})
