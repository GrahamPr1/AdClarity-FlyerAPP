import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { ADMIN_SUB, getSessionIdentity } from "@/lib/auth"
import { isAdminSession } from "@/lib/admin"
import { nopLangForPage } from "@/lib/enterprise/nop-i18n/server"
import type { NopLang, NopLangSource } from "@/lib/enterprise/nop-i18n"
import { loadPortalContext, type PortalContext } from "./context"
import { resolvePortalViewer, type PortalViewer } from "./view-as"
import { touchLastActive } from "./store"

export interface PortalPage {
  viewer: PortalViewer
  ctx: PortalContext
  lang: NopLang
  source: NopLangSource
  readOnly: boolean
}

/**
 * The gate for every portal page. Returns the agent the page is for, or
 * redirects: signed out -> /agent (the front door); an SMB customer -> their
 * dashboard; an admin not viewing anyone -> the admin agent list.
 */
export async function requirePortalPage(): Promise<PortalPage> {
  const page = await portalPageOrNull()
  if (page) return page
  const session = await getSessionIdentity({ cookies: await cookies() })
  if (!session) redirect("/agent")
  if (session.sub === ADMIN_SUB || (await isAdminSession(session.sub))) redirect("/admin/enterprise/agents")
  redirect("/dashboard")
}

/** The same, without redirecting: null when this request isn't for an agent's portal. */
export async function portalPageOrNull(): Promise<PortalPage | null> {
  const cookieStore = await cookies()
  const viewer = await resolvePortalViewer({ cookies: cookieStore })
  if (!viewer) return null
  const ctx = await loadPortalContext(viewer.email)
  if (!ctx) return null
  if (!viewer.viewAs) await touchLastActive(viewer.email).catch(() => {})
  const { lang, source } = await nopLangForPage(viewer.email)
  return { viewer, ctx, lang, source, readOnly: viewer.viewAs !== null }
}
