import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextRequest } from "next/server"
import { NOP_QR_ALPHABET, NOP_QR_CODE_RE, NOP_QR_PATH, nopQrLink, nopQrTarget, programEnrollmentUrl, qrDestinationFor } from "@/lib/enterprise/nop-roster"
import type { AgentRosterStatus } from "@/lib/types"

/**
 * A NOP flyer's QR encodes oneflyer.org/a/{code}: a random code, never the
 * Agent ID. It forwards to the agent's own enrollment URL only while their
 * roster record is active, to the program's page otherwise or for an unknown
 * code, and to the QR lead page only when qrLanding says so (org switch on).
 */

const s = vi.hoisted(() => ({ landing: null as unknown, fail: false, scans: [] as string[], countFails: false }))
vi.mock("@/lib/enterprise/portal/lead-capture", () => ({
  qrLanding: async () => {
    if (s.fail) throw new Error("redis down")
    return s.landing
  },
}))
vi.mock("@/lib/enterprise/portal/agent-data", () => ({
  countAgentScan: async (id: string) => {
    if (s.countFails) throw new Error("redis down")
    s.scans.push(id)
  },
}))
beforeEach(() => { s.landing = null; s.fail = false; s.scans.length = 0; s.countFails = false })

describe("the QR code and link", () => {
  it("is oneflyer.org/a/{code}, 6 to 8 characters, none of them ambiguous", () => {
    expect(NOP_QR_PATH).toBe("/a")
    expect(nopQrLink("k7Q2mXp")).toBe("https://oneflyer.org/a/k7Q2mXp")
    for (const c of "0O1lIo") expect(NOP_QR_ALPHABET).not.toContain(c)
    expect(NOP_QR_CODE_RE.test("k7Q2mXp")).toBe(true)
    for (const bad of ["k7Q2m", "k7Q2mXpQ9", "k7Q2m0p", "858980/x", "k7Q-2mX"]) expect(NOP_QR_CODE_RE.test(bad), bad).toBe(false)
  })

  it("issues random 7-character codes from that alphabet", async () => {
    const { randomQrCode } = await import("@/lib/enterprise/nop-qr-code")
    const codes = new Set(Array.from({ length: 2000 }, () => randomQrCode()))
    expect(codes.size).toBe(2000)
    for (const c of codes) expect(NOP_QR_CODE_RE.test(c) && c.length === 7, c).toBe(true)
    const seen = new Set([...codes].join(""))
    expect(seen.size).toBe(NOP_QR_ALPHABET.length)
  })

  it("forwards an active agent to exactly the enrollment URL the QR used to encode", () => {
    expect(nopQrTarget("858980", { status: "active" })).toBe("https://neighbor.basicbenefits.com/858980")
    expect(nopQrTarget("858980", { status: "active" })).toBe(qrDestinationFor("858980"))
  })

  it.each<[string, AgentRosterStatus | null]>([["pending", "pending"], ["suspended", "suspended"], ["terminated", "terminated"], ["no roster record", null]])(
    "forwards %s to the program's enrollment page", (_l, status) => {
      expect(nopQrTarget("858980", status ? { status } : null)).toBe("https://neighbor.basicbenefits.com/")
    })

  it("an unknown code, or anything that isn't an Agent ID, goes to the program's page", () => {
    expect(nopQrTarget(null, null)).toBe(programEnrollmentUrl())
    expect(nopQrTarget("858980/../evil", { status: "active" })).toBe(programEnrollmentUrl())
  })
})

describe("GET /a/{code}", () => {
  const call = async (code: string, method = "GET") => {
    const mod = await import("@/app/a/[code]/route")
    const res = await mod[method as "GET"](new NextRequest(`https://oneflyer.org/a/${code}`, { method }), { params: Promise.resolve({ code }) })
    return { status: res.status, location: res.headers.get("location"), cache: res.headers.get("cache-control") }
  }
  const fwd = (agentId: string | null, onRoster: boolean, target: string) => ({ state: "forward", agentId, onRoster, target })

  it("302s to the forward target, uncached, and counts the scan for a roster agent", async () => {
    s.landing = fwd("858980", true, "https://neighbor.basicbenefits.com/858980")
    expect(await call("k7Q2mXp")).toEqual({ status: 302, location: "https://neighbor.basicbenefits.com/858980", cache: "no-store" })
    expect(s.scans).toEqual(["858980"])
  })

  it("counts inactive roster agents too, but not unknown codes or HEAD", async () => {
    s.landing = fwd("111", true, "https://neighbor.basicbenefits.com/"); await call("k7Q2mXp")
    s.landing = fwd(null, false, "https://neighbor.basicbenefits.com/"); expect((await call("zzzzzzz")).location).toBe("https://neighbor.basicbenefits.com/")
    s.landing = fwd("858980", true, "https://neighbor.basicbenefits.com/858980"); await call("k7Q2mXp", "HEAD")
    expect(s.scans).toEqual(["111"])
  })

  it("opens the lead page on the same host only when qrLanding says lead_page, and counts it", async () => {
    s.landing = { state: "lead_page", agentId: "858980" }
    expect((await call("k7Q2mXp")).location).toBe("https://oneflyer.org/a/k7Q2mXp/contact")
    expect(s.scans).toEqual(["858980"])
  })

  it("still forwards when counting fails, and goes to the program's page when the lookup fails", async () => {
    s.landing = fwd("858980", true, "https://neighbor.basicbenefits.com/858980"); s.countFails = true
    expect((await call("k7Q2mXp")).location).toBe("https://neighbor.basicbenefits.com/858980")
    s.fail = true
    expect((await call("k7Q2mXp")).location).toBe("https://neighbor.basicbenefits.com/")
  })
})
