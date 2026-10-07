import type { NextRequest } from "next/server"
import { cookies, headers } from "next/headers"
import { getAgentProfile } from "@/lib/store"
import { NOP_LANG_COOKIE, parseNopLang, resolveNopLang, type NopLang, type NopLangSource } from "./index"

// Server side of NOP language choice. The saved preference is only looked
// up when there is no cookie, so the common case costs no Redis read.

async function preferredFor(account: string | null | undefined): Promise<string | null> {
  if (!account) return null
  return (await getAgentProfile(account))?.preferredLanguage ?? null
}

/** For API routes: the language this request's messages (and any email it sends) should use. */
export async function nopLangForRequest(request: NextRequest, account?: string | null): Promise<NopLang> {
  const cookie = request.cookies.get(NOP_LANG_COOKIE)?.value ?? null
  const fromCookie = parseNopLang(cookie)
  if (fromCookie) return fromCookie
  return resolveNopLang({ preferred: await preferredFor(account), acceptLanguage: request.headers.get("accept-language") }).lang
}

/** For the NOP server pages: the language to render, and where it came from. */
export async function nopLangForPage(account: string | null): Promise<{ lang: NopLang; source: NopLangSource }> {
  const cookie = (await cookies()).get(NOP_LANG_COOKIE)?.value ?? null
  if (parseNopLang(cookie)) return resolveNopLang({ cookie })
  return resolveNopLang({ preferred: await preferredFor(account), acceptLanguage: (await headers()).get("accept-language") })
}
