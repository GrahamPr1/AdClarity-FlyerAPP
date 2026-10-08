import { NextRequest, NextResponse } from "next/server"
import { ADMIN_SUB, getSessionIdentity } from "@/lib/auth"

/**
 * The signed-in client account for an agent-facing route, or the response to
 * return instead. Admin has no "own" account to register.
 */
export async function requireClientSession(request: NextRequest): Promise<{ email: string } | { response: NextResponse }> {
  const session = await getSessionIdentity(request)
  if (!session || session.sub === ADMIN_SUB) {
    return { response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }
  }
  return { email: session.sub }
}
