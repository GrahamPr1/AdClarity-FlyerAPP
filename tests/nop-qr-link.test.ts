import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextRequest } from "next/server"
import { NOP_QR_PATH, nopQrLink, nopQrTarget, programEnrollmentUrl, qrDestinationFor } from "@/lib/enterprise/nop-roster"
import type { AgentRosterStatus } from "@/lib/types"

/**
 * A NOP flyer's QR encodes oneflyer.org/a/{agentId}, which forwards to the
 * agent's own enrollment URL only while their roster record is active, and
 * to the program's enrollment page otherwise.
 */

const s = vi.hoisted(() => ({ roster: new Map<string, { status: string }>(), fail: false }))
vi.mock("@/lib/enterprise/agents-store", () => ({
  getRosterRecord: async (id: string) => {
    if (s.fail) throw new Error("redis down")
    return s.roster.get(id) ?? null
  },
}))
beforeEach(() => { s.roster.clear(); s.fail = false })

describe("the QR link and where it forwards", () => {
  it("is a fixed oneflyer.org link per Agent ID", () => {
    expect(NOP_QR_PATH).toBe("/a")
    expect(nopQrLink("858980")).toBe("https://oneflyer.org/a/858980")
  })

  it("forwards an active agent to exactly the enrollment URL the QR used to encode", () => {
    expect(nopQrTarget("858980", { status: "active" })).toBe("https://neighbor.basicbenefits.com/858980")
    expect(nopQrTarget("858980", { status: "active" })).toBe(qrDestinationFor("858980"))
  })

  it.each<[string, AgentRosterStatus | null]>([["pending", "pending"], ["suspended", "suspended"], ["terminated", "terminated"], ["no roster record", null]])(
    "forwards %s to the program's enrollment page", (_l, status) => {
      expect(nopQrTarget("858980", status ? { status } : null)).toBe("https://neighbor.basicbenefits.com/")
    })

  it("never builds a destination from something that isn't an Agent ID", () => {
    expect(nopQrTarget("858980/../evil", { status: "active" })).toBe(programEnrollmentUrl())
    expect(nopQrTarget("abc", { status: "active" })).toBe(programEnrollmentUrl())
  })
})

describe("GET /a/{agentId}", () => {
  const call = async (id: string, method = "GET") => {
    const mod = await import("@/app/a/[agentId]/route")
    const res = await mod[method as "GET"](new NextRequest(`https://oneflyer.org/a/${id}`, { method }), { params: Promise.resolve({ agentId: id }) })
    return { status: res.status, location: res.headers.get("location"), cache: res.headers.get("cache-control") }
  }

  it("302s an active agent to their enrollment URL, uncached", async () => {
    s.roster.set("858980", { status: "active" })
    expect(await call("858980")).toEqual({ status: 302, location: "https://neighbor.basicbenefits.com/858980", cache: "no-store" })
    expect((await call("858980", "HEAD")).location).toBe("https://neighbor.basicbenefits.com/858980")
  })

  it("302s an inactive, unknown or malformed agent to the program's page", async () => {
    s.roster.set("111", { status: "suspended" })
    for (const id of ["111", "222", "x1"]) expect((await call(id)).location).toBe("https://neighbor.basicbenefits.com/")
  })

  it("forwards to the program's page when the roster can't be read", async () => {
    s.roster.set("858980", { status: "active" })
    s.fail = true
    expect((await call("858980")).location).toBe("https://neighbor.basicbenefits.com/")
  })
})
