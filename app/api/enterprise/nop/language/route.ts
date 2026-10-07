import { NextRequest, NextResponse } from "next/server"
import { ADMIN_SUB, getSessionIdentity } from "@/lib/auth"
import { getAgentProfile, saveAgentProfile } from "@/lib/store"
import { NOP_LANG_COOKIE, NOP_LANG_COOKIE_MAX_AGE, parseNopLang } from "@/lib/enterprise/nop-i18n"
import { getAccountAgentId } from "@/lib/enterprise/agents-store"

// POST /api/enterprise/nop/language { lang: "en" | "es" }
//
// The EN/ES toggle. Works signed out (the sign-in page shows it to NOP
// visitors), so the cookie is always set; a registered agent's saved
// preference is updated too, so their choice follows them to a new device.
export async function POST(request: NextRequest) {
  let lang: ReturnType<typeof parseNopLang>
  try {
    lang = parseNopLang(((await request.json()) as { lang?: unknown }).lang)
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }
  if (!lang) return NextResponse.json({ error: "lang must be en or es" }, { status: 422 })

  const session = await getSessionIdentity(request)
  if (session && session.sub !== ADMIN_SUB && (await getAccountAgentId(session.sub))) {
    const profile = await getAgentProfile(session.sub)
    if (profile && profile.preferredLanguage !== lang) {
      const { savedAt: _savedAt, ...rest } = profile
      await saveAgentProfile(session.sub, { ...rest, preferredLanguage: lang })
    }
  }

  const res = NextResponse.json({ ok: true, lang })
  res.cookies.set(NOP_LANG_COOKIE, lang, {
    // Read by the sign-in page in the browser, so not httpOnly. Not sensitive.
    httpOnly: false,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: NOP_LANG_COOKIE_MAX_AGE,
    path: "/",
  })
  return res
}
