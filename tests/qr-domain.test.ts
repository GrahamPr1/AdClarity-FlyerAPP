import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import fs from "node:fs"
import path from "node:path"
import QRCode from "qrcode"
import type { TrackingRecord } from "@/lib/types"
import type { Redirect } from "next/dist/lib/load-custom-routes"

/**
 * New QR codes point at https://oneflyer.org/r/<code>. Codes already printed
 * point at https://ad-clarity-landing-page.vercel.app/r/<code> and must keep
 * resolving forever: nothing may redirect, block or rewrite /r/ on that host,
 * and re-rendering an old code's QR must reproduce the URL that was printed.
 */

const db = vi.hoisted(() => ({ records: new Map<string, unknown>(), channelCodes: [] as string[] }))
vi.mock("@/lib/store", () => ({
  createTrackingRecord: async (code: string, record: unknown) => void db.records.set(code, record),
  getTrackingRecord: async (code: string) => db.records.get(code) ?? null,
  addFlyerChannelCode: async (_flyerId: string, code: string) => void db.channelCodes.push(code),
  updateTrackingContentForFlyer: async () => [],
}))

const LEGACY = "https://ad-clarity-landing-page.vercel.app"
const intake = { businessName: "Pearl Roofing", contact: { phone: "555-0142", website: null } } as never
const qr = (url: string) => QRCode.toDataURL(url, { margin: 1, width: 512 })

beforeEach(() => {
  db.records.clear(); db.channelCodes.length = 0
  // Production's value today: printed codes point here.
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", LEGACY)
})
afterEach(() => vi.unstubAllEnvs())

describe("new codes", () => {
  it("encode https://oneflyer.org/r/<code>, whatever NEXT_PUBLIC_SITE_URL says", async () => {
    const { createFlyerTrackingCode } = await import("@/lib/agent-pipeline/qrTracking")
    const { code, qrDataUrl } = await createFlyerTrackingCode("owner@example.test", "flyer-1", intake)
    const url = `https://oneflyer.org/r/${code}`
    expect((db.records.get(code) as TrackingRecord).redeemUrl).toBe(url)
    expect(qrDataUrl).toBe(await qr(url))
  })

  it("a channel code encodes its OWN oneflyer.org URL, not its parent's", async () => {
    const { createFlyerTrackingCode, createChannelTrackingCode } = await import("@/lib/agent-pipeline/qrTracking")
    const parent = await createFlyerTrackingCode("owner@example.test", "flyer-1", intake)
    const child = await createChannelTrackingCode(parent.code, "Email blast")
    expect(child).not.toBeNull()
    expect(child!.redeemUrl).toBe(`https://oneflyer.org/r/${child!.code}`)
    expect((db.records.get(child!.code) as TrackingRecord).redeemUrl).toBe(child!.redeemUrl)
    expect(child!.qrDataUrl).toBe(await qr(child!.redeemUrl))
  })
})

describe("codes already printed", () => {
  it("re-render byte-identical: a record without redeemUrl keeps the legacy-host URL", async () => {
    const { qrDataUrlForCode } = await import("@/lib/agent-pipeline/qrTracking")
    db.records.set("OLD2345", { email: "owner@example.test", flyerId: "f", businessName: "B", headline: null, offer: null, cta: null, disclaimer: null, phone: "1", website: null, createdAt: "2026-01-01T00:00:00.000Z" })
    expect(await qrDataUrlForCode("OLD2345")).toBe(await qr(`${LEGACY}/r/OLD2345`))
  })

  it("a new code re-renders to its stored oneflyer.org URL", async () => {
    const { createFlyerTrackingCode, qrDataUrlForCode } = await import("@/lib/agent-pipeline/qrTracking")
    const { code, qrDataUrl } = await createFlyerTrackingCode("owner@example.test", "flyer-1", intake)
    expect(await qrDataUrlForCode(code)).toBe(qrDataUrl)
  })

  // The old host's PAGES now redirect to oneflyer.org (legacy-redirects.mjs),
  // so rules do match on host — but none may ever catch a QR scan. Checked by
  // running every rule through Next's own route compiler, on every host a
  // printed or new code can point at.
  it("/r/ is never redirected, on the legacy host or any other: no next.config rule matches a scan", async () => {
    const { default: config } = await import("@/next.config.mjs")
    const { buildCustomRoute } = await import("next/dist/lib/build-custom-route")
    const rules = (await config.redirects!()) as Redirect[]
    const paths = ["/r/OLD2345", "/r/OLD2345?src=flyer", "/api/tracking/OLD2345/click", "/api/photos/onboarding-photos/a.jpg"]
    for (const host of ["ad-clarity-landing-page.vercel.app", "oneflyer.org", "oneflyer-git-x-grahampr1s-projects.vercel.app"]) {
      for (const rule of rules) {
        const route = buildCustomRoute("redirect", rule, ["/_next"]) as unknown as { regex: string }
        const hostOk = !rule.has?.length || rule.has.every((h) => h.type !== "host" || new RegExp(`^${h.value ?? ""}$`).test(host))
        for (const p of paths) {
          const matched = hostOk && new RegExp(route.regex).test(p.split("?")[0])
          expect(matched, `${rule.source} on ${host} caught ${p}`).toBe(false)
        }
      }
    }
  })

  it("/r/ is never intercepted by middleware (sign-in checks), on any host", () => {
    const src = fs.readFileSync(path.join(process.cwd(), "middleware.ts"), "utf8")
    const matcher = JSON.parse(src.match(/matcher:\s*(\[[^\]]*\])/)![1]) as string[]
    for (const m of matcher) {
      expect(m === "/r" || m.startsWith("/r/"), m).toBe(false)
      expect(m.startsWith("/:") || m.startsWith("/("), `${m} would catch /r/`).toBe(false)
    }
  })

  it("the offer page reads no host header, so both hosts render the same page", () => {
    const src = fs.readFileSync(path.join(process.cwd(), "app/r/[code]/page.tsx"), "utf8")
    expect(src).not.toMatch(/headers\(\)|\bhost\b/)
  })
})
