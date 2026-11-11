import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextRequest } from "next/server"

/**
 * "Save my contact" (/p/{code}/contact) and the signature's QR image
 * (/p/{code}/qr): public, but only exactly when the personal page exists
 * (agentPageFor), else the same 404 as an unknown code. The contact card has
 * name, phone, email and page link; the photo only while the photo switch is
 * on (agentPageFor gives photo: null otherwise). Escaped and folded as vCard
 * requires.
 */

const r = vi.hoisted(() => ({ page: null as Record<string, unknown> | null, blob: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]) }))
vi.mock("@/lib/enterprise/portal/agent-page", () => ({
  AGENT_PHOTO_PREFIX: "nop-agent-photos/",
  agentPageFor: async (code: string) => (code === "AAfx4vZ" ? r.page : null),
  nopPageLink: (code: string) => `https://oneflyer.org/p/${code}`,
}))
vi.mock("@vercel/blob", () => ({ get: async () => ({ stream: new Response(r.blob).body }) }))

beforeEach(() => {
  r.page = { name: "Ana María Ruiz", phone: "(270) 555-0100", email: "ana@x.test", photo: null }
})

const call = async (route: string, code: string) => {
  const mod = route === "contact" ? await import("@/app/p/[code]/contact/route") : await import("@/app/p/[code]/qr/route")
  return mod.GET(new NextRequest(`http://x/p/${code}/${route}`), { params: Promise.resolve({ code }) })
}

describe("the contact card", () => {
  it("name, phone, email, page link, program; a safe file name; never cached or indexed", async () => {
    const res = await call("contact", "AAfx4vZ")
    expect(res.headers.get("content-type")).toBe("text/vcard; charset=utf-8")
    expect(res.headers.get("content-disposition")).toBe('attachment; filename="Ana-Maria-Ruiz.vcf"')
    expect(res.headers.get("cache-control")).toBe("no-store")
    const card = await res.text()
    expect(card).toContain("BEGIN:VCARD\r\nVERSION:3.0\r\n")
    expect(card).toContain("N:Ruiz;Ana María;;;")
    expect(card).toContain("FN:Ana María Ruiz")
    expect(card).toContain("TEL;TYPE=CELL,VOICE:2705550100")
    expect(card).toContain("EMAIL;TYPE=INTERNET:ana@x.test")
    expect(card).toContain("URL:https://oneflyer.org/p/AAfx4vZ")
    expect(card).toContain("ORG:Neighborhood Outreach Program")
    expect(card).not.toContain("PHOTO")
    expect(card).not.toMatch(/basic benefits/i)
  })

  it("the photo only while the page has one (the photo switch on)", async () => {
    r.page = { ...r.page, photo: { path: "nop-agent-photos/x.jpg", contentType: "image/jpeg", updatedAt: "t" } }
    const card = await (await call("contact", "AAfx4vZ")).text()
    expect(card).toContain(`PHOTO;ENCODING=b;TYPE=JPEG:${r.blob.toString("base64")}`)
  })

  it("no page (Basic, switched off, inactive, unknown code): the same 404 for both routes", async () => {
    r.page = null
    expect((await call("contact", "AAfx4vZ")).status).toBe(404)
    expect((await call("qr", "AAfx4vZ")).status).toBe(404)
    expect((await call("contact", "zzzzzzz")).status).toBe(404)
  })

  it("escapes commas, semicolons and backslashes, and folds long lines", async () => {
    const { buildVCard } = await import("@/lib/enterprise/portal/vcard")
    const card = buildVCard({ name: "Pat; Lee, Jr\\", phone: "", email: "", pageUrl: "https://oneflyer.org/p/x", org: "", photo: { base64: "A".repeat(200), type: "PNG" } })
    expect(card).toContain("FN:Pat\\; Lee\\, Jr\\\\")
    expect(card).not.toContain("TEL")
    for (const line of card.split("\r\n")) expect(line.length).toBeLessThanOrEqual(75)
    expect(card).toMatch(/\r\n A{74}/)
  })
})

describe("the signature QR", () => {
  it("a PNG of the page link, while the page exists", async () => {
    const res = await call("qr", "AAfx4vZ")
    expect(res.status).toBe(200)
    expect(res.headers.get("content-type")).toBe("image/png")
    const { decodeQrFromPng } = await import("@/lib/enterprise/nop-render/qr-gate")
    expect(decodeQrFromPng(Buffer.from(await res.arrayBuffer()))).toBe("https://oneflyer.org/p/AAfx4vZ")
  })
})
