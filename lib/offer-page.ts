/**
 * True on a QR offer page (/r/<code>).
 *
 * Offer pages load no analytics or advertising tags: not GA4, not GTM (which
 * carries the Meta tag), not Vercel Analytics. They are a business's page for
 * its own customers, and they hold a lead form — a tag that reads forms (Meta's
 * automatic advanced matching does) could pick up a visitor's phone number.
 * Each tag component checks this itself, so nothing about the tags reaches an
 * offer page's HTML at all.
 */
export function isOfferPagePath(pathname: string | null | undefined): boolean {
  return !!pathname && (pathname === "/r" || pathname.startsWith("/r/"))
}

/** Agent and program pages: the agent portal, their public pages (/p, /e, /a) and /program. */
const AGENT_PROGRAM_PREFIXES = ["/p", "/e", "/a", "/agent", "/agente", "/program", "/enterprise/nop"]

/**
 * True on a NOP agent or program page: the agent portal (/agent/*, /agente,
 * /enterprise/nop/*), agents' public pages (/p, /e, /a) and the program
 * admin (/program/*). These load no Google Analytics and no GTM (so no Meta
 * tag): they are the program's pages, not OneFlyer's marketing site, and
 * several hold lead forms. The SMB site keeps its tags.
 */
export function isAgentProgramPath(pathname: string | null | undefined): boolean {
  return !!pathname && AGENT_PROGRAM_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))
}

/** No GA4, no GTM / Meta: offer pages and agent/program pages. */
export function isUntrackedPath(pathname: string | null | undefined): boolean {
  return isOfferPagePath(pathname) || isAgentProgramPath(pathname)
}
