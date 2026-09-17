import { NextRequest, NextResponse } from "next/server"
import { getSessionIdentity, ADMIN_SUB } from "@/lib/auth"

// GET /api/auth/session — "is this browser signed in, and as whom".
//
// Exists because the marketing pages are STATICALLY CACHED at the CDN
// (x-vercel-cache: HIT on /). Rendering the signed-in state on the server
// would either defeat that cache or, worse, let one visitor's avatar be
// cached and served to everyone. So the header ships signed-out and the
// account menu fills itself in after hydration from this route.
//
// Returns only the caller's OWN identity, never anyone else's, and is
// explicitly uncacheable.
export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  const session = await getSessionIdentity(request)
  if (!session) {
    return NextResponse.json({ signedIn: false }, { headers: { "Cache-Control": "no-store" } })
  }
  const isAdmin = session.sub === ADMIN_SUB
  return NextResponse.json(
    { signedIn: true, email: isAdmin ? null : session.sub, isAdmin },
    { headers: { "Cache-Control": "no-store" } },
  )
}
