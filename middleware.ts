import { NextRequest, NextResponse } from "next/server"
import { verifySessionToken, SESSION_COOKIE } from "@/lib/auth"

export async function middleware(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value
  const session = await verifySessionToken(token)

  if (!session) {
    const loginUrl = new URL("/login", req.url)
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ["/dashboard/:path*"], // protects /dashboard and every sub-route
}
