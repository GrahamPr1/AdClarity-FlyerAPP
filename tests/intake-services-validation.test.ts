import { describe, it, expect, vi } from "vitest"
import { NextRequest } from "next/server"

// The route is called for real; everything past validation is mocked so a
// request that gets that far does nothing and is easy to tell apart.
vi.mock("@/lib/auth", () => ({ ADMIN_SUB: "admin", getSessionIdentity: vi.fn(async () => ({ sub: "owner@example.com" })) }))
vi.mock("@/lib/enterprise/generation-guard", () => ({ nopAgentGenerationBlock: vi.fn(async () => null) }))
vi.mock("@/lib/store", () => ({}))
vi.mock("@/lib/plans", () => ({}))
vi.mock("@/lib/rehost-image", () => ({ rehostExternalImage: vi.fn() }))
vi.mock("@/lib/agent-pipeline/pipeline", () => ({ MAX_FLYERS_PER_BATCH: 10 }))
vi.mock("@/lib/agent-pipeline/plan-features", () => ({}))
vi.mock("@vercel/functions", () => ({ waitUntil: vi.fn() }))

import { POST } from "@/app/api/intake/route"
import { servicesProblem, MAX_SERVICES } from "@/lib/intake-validation"

const base = {
  contact: { email: "owner@example.com", phone: "(502) 555-0199" },
  businessCategory: "Other",
  businessName: "Miller Heating & Air",
  industry: "HVAC",
  // targetAudience deliberately absent: a body that passes the services check
  // then stops at the existing "missing fields" 422, before any side effect.
}

async function post(body: unknown) {
  const res = await POST(
    new NextRequest("http://localhost/api/intake", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } }),
  )
  return { status: res.status, body: await res.json() }
}

describe("POST /api/intake — malformed services", () => {
  it.each([
    ["plain strings", ["Furnace repair", "AC installation"]],
    ["a single string", "Furnace repair"],
    ["an object instead of a list", { name: "Furnace repair" }],
    ["items without a name", [{ id: "s1" }]],
    ["a non-text name", [{ id: "s1", name: 42 }]],
    ["a null item", [null]],
  ])("answers 400, not 500, for %s", async (_label, services) => {
    const r = await post({ ...base, services })
    expect(r.status).toBe(400)
    expect(r.body.error).toBe("invalid_services")
    expect(typeof r.body.message).toBe("string")
  })

  it("lets well-formed services through to the existing checks", async () => {
    const r = await post({ ...base, services: [{ id: "s1", name: "Furnace repair" }] })
    expect(r.status).toBe(422)
    expect(r.body.missing).toEqual(["targetAudience"])
  })

  it("still reports absent or empty services as missing (422), as before", async () => {
    for (const services of [undefined, []]) {
      const r = await post({ ...base, services })
      expect(r.status).toBe(422)
      expect(r.body.missing).toContain("services")
    }
  })
})

describe("servicesProblem", () => {
  it("caps the list and name length", () => {
    expect(servicesProblem(Array.from({ length: MAX_SERVICES + 1 }, (_, i) => ({ id: `${i}`, name: "x" })))).toMatch(/at most/)
    expect(servicesProblem([{ id: "s1", name: "x".repeat(201) }])).toMatch(/longer than/)
    expect(servicesProblem([{ name: "Furnace repair" }])).toBeNull() // id is optional
    expect(servicesProblem([{ id: 7, name: "x" }])).toMatch(/id must be text/)
  })
})
