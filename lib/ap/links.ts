import { CANONICAL_SITE_URL } from "@/lib/site-url"
import { CODE_RE } from "./store"
import type { ApOrg } from "./types"

// Absolute links the platform hands out. On the agent-platform branch the base
// is NEXT_PUBLIC_SITE_URL (the branch URL), so anything printed from here is
// test-only. At launch the base becomes oneflyer.org (printed codes must
// outlive any deployment URL, as NOP's do).

export function siteBase(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL?.trim() || CANONICAL_SITE_URL).replace(/\/+$/, "")
}

export const qrLink = (code: string) => `${siteBase()}/ap/q/${code}`
export const recruitLink = (org: ApOrg, code: string) => `${siteBase()}/ap/${org.slug}/join?ref=${code}`
export const signupLink = (org: ApOrg) => `${siteBase()}/ap/${org.slug}/join?${org.agentIdParam}=`

export function isQrCode(v: string): boolean {
  return CODE_RE.test(v)
}
