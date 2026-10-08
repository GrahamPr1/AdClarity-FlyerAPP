import { NextRequest, NextResponse } from "next/server"
import { NOP_LANG_COOKIE, NOP_LANG_COOKIE_MAX_AGE } from "@/lib/enterprise/nop-i18n"

// oneflyer.org/agente: the Spanish front door. Chooses Spanish (the same
// cookie the EN/ES toggle sets) and shows /agent.
export function GET(request: NextRequest) {
  const res = NextResponse.redirect(new URL("/agent", request.url))
  res.cookies.set(NOP_LANG_COOKIE, "es", {
    httpOnly: false,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: NOP_LANG_COOKIE_MAX_AGE,
    path: "/",
  })
  return res
}
