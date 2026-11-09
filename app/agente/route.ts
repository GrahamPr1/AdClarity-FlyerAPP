import { NextRequest, NextResponse } from "next/server"
import { NOP_LANG_COOKIE, NOP_LANG_COOKIE_MAX_AGE } from "@/lib/enterprise/nop-i18n"
import { agentIdParam, withAgentId } from "@/lib/enterprise/nop-roster"

// oneflyer.org/agente: the Spanish front door. Chooses Spanish (the same
// cookie the EN/ES toggle sets) and shows /agent, carrying a valid
// ?agent_ID= (or the older ?agent_code=) from the "Open OneFlyer" link, as ?agent_ID=, and nothing else.
export function GET(request: NextRequest) {
  const agentCode = agentIdParam(request.nextUrl.searchParams)
  // Relative Location: correct behind any proxy, whatever host it was asked on.
  const res = new NextResponse(null, { status: 307, headers: { Location: withAgentId("/agent", agentCode) } })
  res.cookies.set(NOP_LANG_COOKIE, "es", {
    httpOnly: false,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: NOP_LANG_COOKIE_MAX_AGE,
    path: "/",
  })
  return res
}
