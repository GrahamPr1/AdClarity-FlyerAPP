import { NextRequest, NextResponse } from "next/server"
import { verifySessionToken, SESSION_COOKIE } from "@/lib/auth"

export async function middleware(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value
  const session = await verifySessionToken(token)

  // /app is a vanity path whose destination depends on who's asking, so it
  // can't be a static redirect in next.config.mjs (where the others live).
  // Signed in -> the dashboard; signed out -> log in, and then on to the
  // dashboard rather than dumping them on the marketing page.
  if (req.nextUrl.pathname === "/app" || req.nextUrl.pathname.startsWith("/app/")) {
    if (session) return NextResponse.redirect(new URL("/dashboard", req.url))
    const loginUrl = new URL("/login", req.url)
    loginUrl.searchParams.set("next", "/dashboard")
    return NextResponse.redirect(loginUrl)
  }

  if (!session) {
    const loginUrl = new URL("/login", req.url)
    // Sends them back to exactly where they were headed (e.g.
    // /onboarding?plan=pro) once they've signed in, instead of always
    // landing on /dashboard regardless of what they were trying to reach.
    loginUrl.searchParams.set("next", req.nextUrl.pathname + req.nextUrl.search)
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
}

export const config = {
  // /onboarding now requires signing in first too — a client answers
  // questions and submits as their own authenticated email, not a
  // free-text field anyone could type any address into.
  //
  // /admin/* requires a valid session at minimum (checked here) — the
  // finer-grained "is this session actually an admin" check happens in
  // app/admin/layout.tsx, since that needs a Redis lookup middleware
  // doesn't do for the other two routes.
  // /app is matched so the auth-dependent redirect above can run. It is
  // deliberately NOT gated by the !session check below it — an anonymous
  // visitor typing /app gets sent to login with a sensible destination, not
  // bounced back to /app.
  matcher: ["/app", "/app/:path*", "/dashboard/:path*", "/onboarding/:path*", "/profile/:path*", "/admin/:path*"],
}
