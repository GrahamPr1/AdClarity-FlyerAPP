import { describe, it, expect, vi, beforeEach } from "vitest"
import fs from "node:fs"
import path from "node:path"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { NextRequest } from "next/server"
import type { AgentProfile, ClientRecord, FlyerDeliverable, TrackingRecord } from "@/lib/types"
import { offerPageFeaturesEnabled, qrEnabled } from "@/lib/agent-pipeline/plan-features"

/**
 * Enterprise accounts (an agent profile with an org, like the Northstar demo
 * agent on Pro) stay as they were: no lead form and no offer-page editing,
 * while the QR still resolves and channel tracking still works. NOP agents
 * can't reach the editor page, and the admin roster shows no leads button.
 */

const s = vi.hoisted(() => ({
  sub: "dana@northstar.invalid" as string | null,
  client: null as unknown,
  agent: null as unknown,
  isNop: false,
  scans: 0,
  saved: [] as unknown[],
  edits: [] as unknown[],
  minted: [] as unknown[],
  redirected: [] as string[],
}))

const record: TrackingRecord = {
  email: "dana@northstar.invalid", flyerId: "flyer-1", businessName: "Dana Reyes, Northstar Mutual",
  headline: "Retirement income review", offer: "Approved offer text", cta: "Call Dana", disclaimer: "Licensed in KY and TN.",
  phone: "555-0142", website: null, createdAt: "2026-01-01T00:00:00.000Z", redeemUrl: "https://oneflyer.org/r/ABC2345",
}
vi.mock("@/lib/auth", () => ({ ADMIN_SUB: "admin", getSessionIdentity: async () => (s.sub ? { sub: s.sub } : null) }))
vi.mock("@/lib/rate-limit", () => ({ clientIp: () => "203.0.113.1", checkRateLimit: async () => ({ allowed: true, retryAfterSeconds: 0 }) }))
vi.mock("@/lib/email", () => ({ sendLeadNotification: async () => ({ sent: true }) }))
vi.mock("@/lib/offer-refresh", () => ({ markOfferPageTouched: async () => {} }))
vi.mock("next/headers", () => ({ cookies: async () => ({}) }))
vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
  redirect: (to: string) => { s.redirected.push(to); throw new Error(`redirect:${to}`) },
}))
vi.mock("@/lib/enterprise/agents-store", () => ({ isNopAgentAccount: async () => s.isNop }))
vi.mock("@/lib/agent-pipeline/qrTracking", () => ({
  redeemUrlFor: () => "https://oneflyer.org/r/ABC2345",
  createChannelTrackingCode: async (...args: unknown[]) => (s.minted.push(args), { code: "CHN2345", qrDataUrl: "data:", redeemUrl: "https://oneflyer.org/r/CHN2345" }),
}))
vi.mock("@/lib/store", async () => {
  const flyers = { flyers: [{ id: "flyer-1", trackingCode: "ABC2345" }], email: "dana@northstar.invalid" }
  return {
    getClient: async () => s.client,
    getAgentProfile: async () => s.agent,
    getTrackingRecord: async () => ({ ...record }),
    incrementTrackingScan: async () => ++s.scans,
    saveLead: async (...a: unknown[]) => void s.saved.push(a),
    getDeliverables: async () => flyers,
    getDeliverablesForEmail: async () => flyers,
    listFlyerChannelCodes: async () => [],
    hasOfferPageUndo: async () => false,
    saveOfferPageEdit: async (...a: unknown[]) => (s.edits.push(a), true),
    undoOfferPageEdit: async (...a: unknown[]) => (s.edits.push(a), true),
    resetOfferPageToFlyer: async () => true,
  }
})

const pro = { email: "dana@northstar.invalid", plan: "pro", pausedAt: null } as ClientRecord
const profile = { name: "Dana Reyes", orgId: "northstar-mutual", phone: "555-0142", email: "dana@northstar.invalid" } as AgentProfile
const params = Promise.resolve({ code: "ABC2345" })
const json = (url: string, method: string, body: unknown) => new NextRequest(`http://x${url}`, { method, body: JSON.stringify(body), headers: { "content-type": "application/json" } })
const edit = { headline: "Rewritten claim", cta: "Call", phone: "5550100142" }

beforeEach(() => {
  s.sub = "dana@northstar.invalid"; s.client = pro; s.agent = profile; s.isNop = false; s.scans = 0
  s.saved.length = 0; s.edits.length = 0; s.minted.length = 0; s.redirected.length = 0
})

describe("an enterprise account on Pro", () => {
  it("/r/ shows the offer and counts the scan, with no lead form", async () => {
    const { default: RedeemPage } = await import("@/app/r/[code]/page")
    const html = renderToStaticMarkup(await RedeemPage({ params }))
    expect(html).toContain("Retirement income review")
    expect(html).toContain("Approved offer text")
    expect(html).toContain('href="tel:5550142"')
    expect(html).not.toContain("By submitting, you agree")
    expect(html).not.toContain("Request a quote")
    expect(s.scans).toBe(1)
  })

  it("POST /api/leads: 403, nothing saved", async () => {
    const { POST } = await import("@/app/api/leads/[code]/route")
    const res = await POST(json("/api/leads/ABC2345", "POST", { name: "Sam", phone: "5550102030" }), { params })
    expect(res.status).toBe(403)
    expect(s.saved).toHaveLength(0)
  })

  it("saving or undoing the offer page: 403, nothing changed; the editor is told it can't edit", async () => {
    const route = await import("@/app/api/offer-page/[flyerId]/route")
    const ctx = { params: Promise.resolve({ flyerId: "flyer-1" }) }
    const put = (await route.PUT(json("/api/offer-page/flyer-1", "PUT", edit), ctx))!
    expect(put.status).toBe(403)
    expect((await put.json()).error).toBe("upgrade_required")
    expect((await route.POST(new NextRequest("http://x/api/offer-page/flyer-1?action=undo", { method: "POST" }), ctx))!.status).toBe(403)
    expect(s.edits).toHaveLength(0)
    const get = (await route.GET(new NextRequest("http://x/api/offer-page/flyer-1"), ctx))!
    expect((await get.json()).canEdit).toBe(false)
  })

  it("Track by channel still works", async () => {
    const { POST } = await import("@/app/api/tracking/channel/route")
    const res = (await POST(json("/api/tracking/channel", "POST", { flyerId: "flyer-1", label: "Email blast" })))!
    expect(res.status).toBe(200)
    expect(s.minted).toEqual([["ABC2345", "Email blast"]])
  })

  it("the same Pro account without an org keeps the lead form and editor", async () => {
    s.agent = null
    const { default: RedeemPage } = await import("@/app/r/[code]/page")
    expect(renderToStaticMarkup(await RedeemPage({ params }))).toContain("By submitting, you agree")
    const { POST } = await import("@/app/api/leads/[code]/route")
    expect((await POST(json("/api/leads/ABC2345", "POST", { name: "Sam", phone: "5550102030" }), { params })).status).toBe(200)
    const route = await import("@/app/api/offer-page/[flyerId]/route")
    expect((await route.PUT(json("/api/offer-page/flyer-1", "PUT", edit), { params: Promise.resolve({ flyerId: "flyer-1" }) }))!.status).toBe(200)
  })

  it("the rule itself: active paid plan and no org", () => {
    expect(offerPageFeaturesEnabled({ plan: "pro", pausedAt: null }, true)).toBe(false)
    expect(offerPageFeaturesEnabled({ plan: "basic", pausedAt: null }, true)).toBe(false)
    expect(offerPageFeaturesEnabled({ plan: "pro", pausedAt: null }, false)).toBe(true)
    expect(offerPageFeaturesEnabled({ plan: "trial", pausedAt: null }, false)).toBe(false)
  })
})

describe("the flyer card", () => {
  const flyer = { id: "flyer-1", title: "Retirement review", status: "Ready", trackingCode: "ABC2345", downloadUrl: "data:text/html;charset=utf-8,%3Ch1%3Ex%3C%2Fh1%3E" } as FlyerDeliverable
  const card = async (props: Record<string, unknown>) => {
    const { FlyerCard } = await import("@/components/dashboard-client")
    return renderToStaticMarkup(createElement(FlyerCard, { flyer, onRetry: async () => ({ ok: true }), ...props }))
  }

  it("enterprise on Pro: no 'Edit offer page' link and no leads button; 'Track by channel' stays", async () => {
    const canEditOfferPage = offerPageFeaturesEnabled({ plan: "pro", pausedAt: null }, true)
    const html = await card({ canEditOfferPage, leadsOff: true })
    expect(html).not.toContain("Edit offer page")
    expect(html).not.toContain("Leads (")
    expect(html).toContain("Track by channel")
  })

  it("an ordinary Pro client still gets all three", async () => {
    const html = await card({ canEditOfferPage: offerPageFeaturesEnabled({ plan: "pro", pausedAt: null }, false) })
    expect(html).toContain("Edit offer page")
    expect(html).toContain("Leads (0)")
    expect(html).toContain("Track by channel")
  })

  it("the admin roster (ownerEmail set) shows no leads button: that API is the client's own", async () => {
    expect(await card({ ownerEmail: "someone@example.test" })).not.toContain("Leads (")
  })
})

describe("the offer-page editor route", () => {
  const load = async () => (await import("@/app/dashboard/offer/[flyerId]/page")).default({ params: Promise.resolve({ flyerId: "flyer-1" }) })

  it("sends a NOP agent to the NOP dashboard, even by typed URL", async () => {
    s.isNop = true
    await expect(load()).rejects.toThrow("redirect:/enterprise/nop/dashboard")
  })

  it("still opens for anyone else", async () => {
    await expect(load()).resolves.toBeTruthy()
    expect(s.redirected).toEqual([])
  })
})

describe("QR codes for enterprise accounts", () => {
  it("Trial gets none, keeping the older rule, so a retry adds no QR", () => {
    expect(qrEnabled("trial", true, true)).toBe(false)
    expect(qrEnabled(undefined, true, true)).toBe(false)
  })

  it("a paid enterprise account still gets one when it asks", () => {
    expect(qrEnabled("pro", true, true)).toBe(true)
    expect(qrEnabled("basic", true, true)).toBe(true)
    expect(qrEnabled("pro", false, true)).toBe(false)
  })

  it("an ordinary Trial account keeps its QR", () => {
    expect(qrEnabled("trial", true)).toBe(true)
    expect(qrEnabled("trial", true, false)).toBe(true)
  })

  it("both pipeline paths (first run and retry) pass the enterprise flag", () => {
    // pipeline.ts builds a Redis client on import, so its wiring is read, not run.
    const src = fs.readFileSync(path.join(process.cwd(), "lib/agent-pipeline/pipeline.ts"), "utf8")
    expect(src.match(/wantsQr\(plan, intake, isEnterpriseAccount\)/g)).toHaveLength(2)
    expect(src.match(/wantsQr\(plan, intake\)/g)).toBeNull()
    expect(src).toContain("isEnterpriseAccount: !!agentProfile?.orgId")
  })
})
