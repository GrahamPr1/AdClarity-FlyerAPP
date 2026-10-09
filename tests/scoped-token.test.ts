import { describe, it, expect, beforeAll, vi, afterEach } from "vitest"
import { createScopedToken, createSessionToken, verifyScopedToken, verifySessionToken } from "@/lib/auth"

beforeAll(() => {
  process.env.SESSION_SECRET = "test-secret-for-scoped-tokens"
})
afterEach(() => vi.useRealTimers())

describe("purpose-scoped tokens", () => {
  it("verify for their own purpose and return the claims", async () => {
    const t = await createScopedToken("nop-org-admin", { email: "a@bb.com" }, 60)
    expect(await verifyScopedToken("nop-org-admin", t)).toMatchObject({ email: "a@bb.com", purpose: "nop-org-admin" })
  })
  it("never verify for another purpose", async () => {
    const t = await createScopedToken("health-check", { route: "business-pdf" }, 60)
    expect(await verifyScopedToken("nop-org-admin", t)).toBeNull()
  })
  it("never pass as a dashboard session, and a session never passes as one", async () => {
    const scoped = await createScopedToken("nop-org-admin", { email: "a@bb.com", sub: "admin" }, 60)
    expect(await verifySessionToken(scoped)).toBeNull()
    const session = await createSessionToken("admin")
    expect(await verifyScopedToken("nop-org-admin", session)).toBeNull()
    expect(await verifyScopedToken("health-check", session)).toBeNull()
  })
  it("reject tampered claims", async () => {
    const t = await createScopedToken("health-check", { flyerId: "a" }, 60)
    const [payload, sig] = t.split(".")
    const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(payload, "base64url").toString()), flyerId: "b" })).toString("base64url")
    expect(await verifyScopedToken("health-check", `${forged}.${sig}`)).toBeNull()
    expect(await verifyScopedToken("health-check", `${t}.extra`)).toBeNull()
    expect(await verifyScopedToken("health-check", "")).toBeNull()
  })
  it("expire", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-10-09T12:00:00Z"))
    const t = await createScopedToken("health-check", { route: "x" }, 120)
    vi.setSystemTime(new Date("2026-10-09T12:02:01Z"))
    expect(await verifyScopedToken("health-check", t)).toBeNull()
  })
})
