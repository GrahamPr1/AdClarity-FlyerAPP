import { NextRequest, NextResponse } from "next/server"
import { getSessionIdentity, ADMIN_SUB } from "@/lib/auth"
import { getSavedBrandProfile } from "@/lib/store"

// GET /api/brand-profile — a client's own saved brand (or null). See
// SavedBrandProfile in lib/types.ts — distinct from GET /api/business-profile
// (form-fill's saved info source). Available to any real client, not
// Pro-only — Quick Prompt itself is a Basic+/Pro feature, not Pro-only.
export async function GET(request: NextRequest) {
  const session = await getSessionIdentity(request)
  if (!session || session.sub === ADMIN_SUB) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const profile = await getSavedBrandProfile(session.sub)
  return NextResponse.json({ profile })
}
