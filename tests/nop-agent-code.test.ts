import { describe, it, expect } from "vitest"
import { NextRequest } from "next/server"
import { agentCodeParam, withAgentCode } from "@/lib/enterprise/nop-roster"

/**
 * Basic Benefits' "Open OneFlyer" link: ?agent_code=<Agent ID>. It only
 * prefills the Agent ID on Get started (and is carried between the agent front
 * door, Get started and Sign in). Nothing is looked up, so an unknown or
 * inactive ID gives exactly the normal screen; a malformed value is dropped.
 */

describe("agentCodeParam", () => {
  it.each([["858980", "858980"], [" 858980 ", "858980"], ["1", "1"], ["1234567890", "1234567890"]])("accepts %j", (v, want) => {
    expect(agentCodeParam(v)).toBe(want)
  })
  it.each([null, undefined, "", "85898O", "858980x", "#858980", "12345678901", "-1", "858 980", "<script>", "858980&next=/admin", ["858980", "1"]])("drops %j", (v) => {
    expect(agentCodeParam(v as string | string[] | null | undefined)).toBeNull()
  })
  it("carries only a valid code onto a link", () => {
    expect(withAgentCode("/agent/start", "858980")).toBe("/agent/start?agent_code=858980")
    expect(withAgentCode("/agent/start", null)).toBe("/agent/start")
  })
})

describe("/agente (Spanish front door)", () => {
  const get = async (q: string) => {
    const { GET } = await import("@/app/agente/route")
    const res = GET(new NextRequest(`http://x/agente${q}`))
    return { location: res.headers.get("location"), lang: res.cookies.get("nop-lang")?.value ?? res.headers.get("set-cookie") }
  }
  it("chooses Spanish and carries a valid agent_code to /agent", async () => {
    const r = await get("?agent_code=858980")
    expect(r.location).toBe("/agent?agent_code=858980")
    expect(String(r.lang)).toContain("es")
  })
  it("drops a malformed one, and anything else in the query", async () => {
    expect((await get("?agent_code=85898O")).location).toBe("/agent")
    expect((await get("?agent_code=858980&next=https://evil.example")).location).toBe("/agent?agent_code=858980")
    expect((await get("")).location).toBe("/agent")
  })
})
