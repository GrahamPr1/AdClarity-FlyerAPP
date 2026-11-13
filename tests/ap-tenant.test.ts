import { describe, it, expect, beforeAll } from "vitest"
import type { ApAgent, ApOrg } from "@/lib/ap/types"

beforeAll(() => {
  process.env.SESSION_SECRET = "test-secret-for-ap-tenant-0123456789"
})

const org = (id: string) => ({ id, slug: id, status: "live" }) as ApOrg
const agent = (agentId: string, orgId: string, status: ApAgent["status"] = "active") => ({ agentId, orgId, status }) as ApAgent

describe("tenantDecision", () => {
  it("allows only an active agent of this org with a matching session", async () => {
    const { tenantDecision } = await import("@/lib/ap/tenant")
    const A = org("org_AAAAAAAA"), B = org("org_BBBBBBBB")
    const a1 = agent("ag_a1a1a1a1", A.id)
    expect(tenantDecision(A, { agentId: a1.agentId, orgId: A.id }, a1)).toBe(200)
    expect(tenantDecision(A, null, null)).toBe(401)
    // An org-B session asking for org A.
    expect(tenantDecision(A, { agentId: "ag_b1b1b1b1", orgId: B.id }, agent("ag_b1b1b1b1", B.id))).toBe(403)
    // A forged session claiming org A for an org-B agent.
    expect(tenantDecision(A, { agentId: "ag_b1b1b1b1", orgId: A.id }, agent("ag_b1b1b1b1", B.id))).toBe(403)
    // Session agent id doesn't match the loaded record.
    expect(tenantDecision(A, { agentId: "ag_other000", orgId: A.id }, a1)).toBe(403)
    expect(tenantDecision(A, { agentId: a1.agentId, orgId: A.id }, agent(a1.agentId, A.id, "pending"))).toBe(403)
    expect(tenantDecision(A, { agentId: a1.agentId, orgId: A.id }, agent(a1.agentId, A.id, "suspended"))).toBe(403)
    expect(tenantDecision(A, { agentId: a1.agentId, orgId: A.id }, null)).toBe(403)
  })
})

describe("ap_session", () => {
  it("round-trips, and rejects tampering, expiry and a OneFlyer session token", async () => {
    const { createApSessionToken, verifyApSessionToken } = await import("@/lib/ap/session")
    const tok = createApSessionToken("ag_a1a1a1a1", "org_AAAAAAAA", 1_000)
    expect(verifyApSessionToken(tok, 2_000)).toMatchObject({ agentId: "ag_a1a1a1a1", orgId: "org_AAAAAAAA" })
    const [p, s] = tok.split(".")
    const forged = Buffer.from(JSON.stringify({ agentId: "ag_a1a1a1a1", orgId: "org_BBBBBBBB", exp: 9e15 })).toString("base64url")
    expect(verifyApSessionToken(`${forged}.${s}`)).toBeNull()
    expect(verifyApSessionToken(`${p}.${s.slice(0, -2)}xx`)).toBeNull()
    expect(verifyApSessionToken(tok, 1_000 + 31 * 24 * 3600 * 1000)).toBeNull()
    const { createSessionToken } = await import("@/lib/auth")
    expect(verifyApSessionToken(await createSessionToken("someone@example.com"))).toBeNull()
  })
})

describe("admin allowlist", () => {
  it("passes the owner login and listed emails only", async () => {
    const { apAdminAllowed } = await import("@/lib/ap/tenant")
    expect(apAdminAllowed("admin", "")).toBe(true)
    expect(apAdminAllowed("admin", undefined)).toBe(true)
    expect(apAdminAllowed("ops@example.com", "ops@example.com, other@example.com")).toBe(true)
    expect(apAdminAllowed("OPS@example.com", "ops@example.com")).toBe(true)
    expect(apAdminAllowed("someone@example.com", "ops@example.com")).toBe(false)
    expect(apAdminAllowed("ops@example.com", undefined)).toBe(false)
  })
})
