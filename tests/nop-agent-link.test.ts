import { describe, it, expect, vi, beforeEach } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import { NextRequest } from "next/server"
import { agentIdParam, agentLinkView } from "@/lib/enterprise/nop-roster"

/**
 * The program's "Open OneFlyer" link, oneflyer.org/agent?AGENT_ID=CP-VLN-H5J
 * (also agent_ID, agent_id, and /agente), for every kind of visitor:
 *  - signed out: Get started / Sign in, the ID carried exactly as sent;
 *  - the agent whose ID it is: their Home;
 *  - a different agent: never their Home silently, a screen saying who is
 *    signed in and who the link is for (EN and ES);
 *  - admin, an admin viewing an agent, program admin, SMB customer: the normal
 *    agent front door with the ID carried, nothing else.
 * The link signs no one in.
 */

const ID = "CP-VLN-H5J"
const OTHER = "CP-ABC-123"

const s = vi.hoisted(() => ({
  sub: null as string | null,
  lang: "en" as "en" | "es",
  portal: null as null | { readOnly: boolean; ctx: { agent: { agentId: string } } },
  agents: {} as Record<string, { agentId: string; profile: { displayName?: string; name?: string } }>,
}))

vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }), headers: async () => new Headers() }))
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, refresh: () => {} }),
  redirect: (to: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { to })
  },
}))
vi.mock("@/lib/auth", () => ({ ADMIN_SUB: "admin", getSessionIdentity: async () => (s.sub ? { sub: s.sub } : null) }))
vi.mock("@/lib/enterprise/nop-i18n/server", () => ({ nopLangForPage: async () => ({ lang: s.lang, source: "cookie" }) }))
vi.mock("@/lib/enterprise/nop-render/agent-context", () => ({ loadNopAgent: async (sub: string) => s.agents[sub] ?? null }))
vi.mock("@/lib/enterprise/portal/page", () => ({ portalPageOrNull: async () => s.portal }))
vi.mock("@/app/agent/portal-home", () => ({ PortalHome: () => "PORTAL-HOME" }))

const agent = (agentId: string, name: string) => ({ agentId, profile: { displayName: name, name } })

/** Signed in as an agent with their portal, as portalPageOrNull returns it. */
function signInAgent(sub: string, agentId: string, name: string) {
  s.sub = sub
  s.agents[sub] = agent(agentId, name)
  s.portal = { readOnly: false, ctx: { agent: s.agents[sub] } }
}

async function agentPage(query: string): Promise<string> {
  const { default: Page } = await import("@/app/agent/page")
  const params = Object.fromEntries(new URLSearchParams(query))
  const el = await Page({ searchParams: Promise.resolve(params) })
  return renderToStaticMarkup(el)
}

const decode = (html: string) => html.replace(/&amp;/g, "&").replace(/&#x27;/g, "'")

beforeEach(() => {
  s.sub = null
  s.lang = "en"
  s.portal = null
  s.agents = {}
})

describe("agentLinkView", () => {
  it.each([
    [null, null, "door"],
    [ID, null, "door"],
    [null, { agentId: ID, viewingAs: false }, "home"],
    [ID, { agentId: ID, viewingAs: false }, "home"],
    [OTHER, { agentId: ID, viewingAs: false }, "mismatch"],
    ["cp-vln-h5j", { agentId: ID, viewingAs: false }, "mismatch"],
    [ID, { agentId: ID, viewingAs: true }, "door"],
    [null, { agentId: ID, viewingAs: true }, "home"],
  ] as const)("link %s, signed in %j -> %s", (link, signedIn, want) => {
    expect(agentLinkView(link, signedIn)).toBe(want)
  })

  it("reads the ID exactly, case and dashes kept, under every parameter spelling", () => {
    for (const k of ["AGENT_ID", "agent_ID", "agent_id"]) expect(agentIdParam({ [k]: ID }), k).toBe(ID)
    expect(agentIdParam({ AGENT_ID: "cp-vln-h5j" })).toBe("cp-vln-h5j")
  })
})

describe("/agent?AGENT_ID=, signed out", () => {
  it.each(["AGENT_ID", "agent_ID", "agent_id"])("%s: Get started and Sign in carry the ID exactly", async (k) => {
    const html = decode(await agentPage(`${k}=${ID}`))
    expect(html).toContain(`href="/agent/start?agent_ID=${ID}"`)
    expect(html).toContain(`href="/agent/sign-in?agent_ID=${ID}"`)
    expect(html).not.toContain("PORTAL-HOME")
  })

  it("/agente carries it to /agent the same way", async () => {
    const { GET } = await import("@/app/agente/route")
    for (const k of ["AGENT_ID", "agent_ID", "agent_id"]) {
      expect(GET(new NextRequest(`http://x/agente?${k}=${ID}`)).headers.get("location"), k).toBe(`/agent?agent_ID=${ID}`)
    }
  })
})

describe("/agent?AGENT_ID=, signed in as an agent", () => {
  it("whose ID it is: their Home", async () => {
    signInAgent("pat@x.test", ID, "Pat Lee")
    expect(await agentPage(`AGENT_ID=${ID}`)).toBe("PORTAL-HOME")
    expect(await agentPage("")).toBe("PORTAL-HOME")
  })

  it("with a different ID: says who is signed in and who the link is for, never their Home", async () => {
    signInAgent("sam@x.test", OTHER, "Sam Ortiz")
    const html = decode(await agentPage(`AGENT_ID=${ID}`))
    expect(html).not.toContain("PORTAL-HOME")
    expect(html).toContain('data-testid="agent-link-mismatch"')
    expect(html).toContain(`You're signed in as Sam Ortiz (${OTHER}). This link is for ${ID}.`)
    expect(html).toContain("Continue as Sam Ortiz")
    expect(html).toContain('href="/agent"')
    expect(html).toContain("Sign out and switch")
    // Nothing that signs in as the link's agent.
    expect(html).not.toContain("/agent/start")
  })

  it("in Spanish", async () => {
    signInAgent("sam@x.test", OTHER, "Sam Ortiz")
    s.lang = "es"
    const html = decode(await agentPage(`agent_ID=${ID}`))
    expect(html).toContain(`Ha iniciado sesión como Sam Ortiz (${OTHER}). Este enlace es para ${ID}.`)
    expect(html).toContain("Continuar como Sam Ortiz")
    expect(html).toContain("Cerrar sesión y cambiar")
  })

  it("the ID is compared exactly: a lower-case link is a different agent", async () => {
    signInAgent("pat@x.test", ID, "Pat Lee")
    expect(decode(await agentPage("AGENT_ID=cp-vln-h5j"))).toContain(`This link is for cp-vln-h5j.`)
  })

  it("Get started and Sign in send a signed-in agent back to /agent with the ID, so the check still applies", async () => {
    signInAgent("sam@x.test", OTHER, "Sam Ortiz")
    for (const path of ["start", "sign-in"]) {
      const { default: Page } = await import(`@/app/agent/${path}/page`)
      await expect(Page({ searchParams: Promise.resolve({ AGENT_ID: ID }) }), path).rejects.toMatchObject({ to: `/agent?agent_ID=${ID}` })
    }
  })
})

describe("/agent?AGENT_ID=, signed in as someone who isn't an agent", () => {
  async function expectFrontDoor() {
    const html = decode(await agentPage(`AGENT_ID=${ID}`))
    expect(html).not.toContain("PORTAL-HOME")
    expect(html).not.toContain("agent-link-mismatch")
    expect(html).toContain(`href="/agent/start?agent_ID=${ID}"`)
    expect(html).toContain(`href="/agent/sign-in?agent_ID=${ID}"`)
  }

  it("OneFlyer admin", async () => {
    s.sub = "admin"
    await expectFrontDoor()
  })

  it("an admin viewing an agent read-only (even that very agent)", async () => {
    s.sub = "staff@oneflyer.test"
    s.portal = { readOnly: true, ctx: { agent: agent(ID, "Pat Lee") } }
    await expectFrontDoor()
  })

  it("program admin (own /program session, no dashboard session)", async () => {
    s.sub = null
    await expectFrontDoor()
  })

  it("SMB customer", async () => {
    s.sub = "owner@bakery.test"
    await expectFrontDoor()
  })
})
