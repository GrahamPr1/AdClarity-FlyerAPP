import { NextRequest, NextResponse } from "next/server"
import { getSessionIdentity, ADMIN_SUB } from "@/lib/auth"
import { getClientTheme, setClientTheme } from "@/lib/store"
import { DEFAULT_THEME, THEME_PREFERENCES, type ThemePreference } from "@/lib/types"

// GET/PUT /api/account/theme — the signed-in account's app-interface theme.
//
// Server-side rather than localStorage so the choice follows the person
// between devices. Admin is excluded: ADMIN_SUB is a shared site-owner
// credential, not a person, so there is no "their" preference to store.
export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  const session = await getSessionIdentity(request)
  if (!session || session.sub === ADMIN_SUB) {
    return NextResponse.json({ theme: DEFAULT_THEME }, { headers: { "Cache-Control": "no-store" } })
  }
  return NextResponse.json(
    { theme: (await getClientTheme(session.sub)) ?? DEFAULT_THEME },
    { headers: { "Cache-Control": "no-store" } },
  )
}

export async function PUT(request: NextRequest) {
  const session = await getSessionIdentity(request)
  if (!session || session.sub === ADMIN_SUB) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let body: { theme?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const theme = body.theme as ThemePreference
  if (!THEME_PREFERENCES.includes(theme)) {
    return NextResponse.json({ error: `theme must be one of: ${THEME_PREFERENCES.join(", ")}` }, { status: 422 })
  }

  await setClientTheme(session.sub, theme)
  return NextResponse.json({ ok: true, theme })
}
