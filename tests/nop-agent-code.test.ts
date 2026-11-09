import { describe, it, expect } from "vitest"
import { NextRequest } from "next/server"
import { agentIdParam, withAgentId } from "@/lib/enterprise/nop-roster"

/**
 * The program's "Open OneFlyer" link: ?agent_ID=<Agent ID> (any case), and the
 * older ?agent_code= still read. It only prefills the Agent ID on Get started
 * (and is carried, as agent_ID, between the agent front door, Get started and
 * Sign in). Nothing is looked up, so an unknown or inactive ID gives exactly
 * the normal screen; a malformed or ambiguous value is dropped.
 */

describe("agentIdParam", () => {
  it.each([
    [{ agent_ID: "858980" }, "858980"],
    [{ agent_id: "858980" }, "858980"],
    [{ AGENT_ID: " 858980 " }, "858980"],
    [{ Agent_Id: "1234567890" }, "1234567890"],
    [{ agent_code: "858980" }, "858980"],
    [{ AGENT_CODE: "858980" }, "858980"],
    [{ agent_ID: "858980", agent_code: "111" }, "858980"],
    [{ agent_ID: "85898O", agent_code: "111" }, "111"],
  ])("%j -> %s", (q, want) => {
    expect(agentIdParam(q)).toBe(want)
  })

  it.each([
    {},
    { agent_ID: "" },
    { agent_ID: "85898O" },
    { agent_ID: "#858980" },
    { agent_ID: "12345678901" },
    { agent_ID: "<script>" },
    { agent_ID: ["858980", "1"] },
    { agent_id: "858980", agent_ID: "1" },
    { agentid: "858980" },
    { partner: "858980" },
  ])("drops %j", (q) => {
    expect(agentIdParam(q as Record<string, string | string[]>)).toBeNull()
  })

  it("reads URLSearchParams the same way, repeated keys included", () => {
    expect(agentIdParam(new URLSearchParams("agent_ID=858980"))).toBe("858980")
    expect(agentIdParam(new URLSearchParams("agent_ID=858980&agent_ID=1"))).toBeNull()
    expect(agentIdParam(new URLSearchParams("agent_code=858980"))).toBe("858980")
  })

  it("carries only a valid ID onto a link, as agent_ID", () => {
    expect(withAgentId("/agent/start", "858980")).toBe("/agent/start?agent_ID=858980")
    expect(withAgentId("/agent/start", null)).toBe("/agent/start")
  })
})

describe("/agente (Spanish front door)", () => {
  const get = async (q: string) => {
    const { GET } = await import("@/app/agente/route")
    const res = GET(new NextRequest(`http://x/agente${q}`))
    return { location: res.headers.get("location"), lang: res.cookies.get("nop_lang")?.value ?? res.headers.get("set-cookie") }
  }
  it("chooses Spanish and carries a valid ID to /agent as agent_ID", async () => {
    for (const q of ["?agent_ID=858980", "?agent_id=858980", "?agent_code=858980"]) {
      const r = await get(q)
      expect(r.location, q).toBe("/agent?agent_ID=858980")
      expect(String(r.lang)).toContain("es")
    }
  })
  it("drops a malformed one, and anything else in the query", async () => {
    expect((await get("?agent_ID=85898O")).location).toBe("/agent")
    expect((await get("?agent_ID=858980&next=https://evil.example")).location).toBe("/agent?agent_ID=858980")
    expect((await get("")).location).toBe("/agent")
  })
})
