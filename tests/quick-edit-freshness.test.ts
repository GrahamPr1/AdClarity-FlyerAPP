import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextRequest } from "next/server"
import { fillTemplate, TEMPLATES } from "@/lib/agent-pipeline/template-mode"
import { encodeFlyerHtml } from "@/lib/flyer-data-url"

// ---- In-memory stand-ins for Redis, so the REAL route handlers run ----------
const db = vi.hoisted(() => ({
  flyers: [] as Record<string, unknown>[],
  snapshots: new Map<string, string>(),
  tracking: new Map<string, Record<string, unknown>>(),
  trackingUpdates: [] as { flyerId: string; code: string | undefined; patch: Record<string, unknown> }[],
  pdfInputs: [] as string[],
}))

vi.mock("@/lib/auth", () => ({ ADMIN_SUB: "admin", getSessionIdentity: vi.fn(async () => ({ sub: "owner@example.com" })) }))
vi.mock("@/lib/store", () => ({
  getDeliverablesForEmail: vi.fn(async () => ({ flyers: structuredClone(db.flyers) })),
  updateDeliverable: vi.fn(async (_email: string, patch: Record<string, unknown>) => {
    const f = db.flyers.find((x) => x.id === patch.id)!
    const { type: _t, ...rest } = patch
    Object.assign(f, rest)
  }),
  savePreEditSnapshot: vi.fn(async (id: string, url: string) => void db.snapshots.set(id, url)),
  getPreEditSnapshot: vi.fn(async (id: string) => db.snapshots.get(id) ?? null),
  clearPreEditSnapshot: vi.fn(async (id: string) => void db.snapshots.delete(id)),
  getTrackingRecord: vi.fn(async (code: string) => db.tracking.get(code) ?? null),
  updateTrackingContentForFlyer: vi.fn(async (flyerId: string, code: string | undefined, patch: Record<string, unknown>) => {
    db.trackingUpdates.push({ flyerId, code, patch })
    return []
  }),
  recordFlyerExport: vi.fn(async () => {}),
}))
vi.mock("@/lib/pdf/flyer-pdf", () => ({
  renderFlyerPdf: vi.fn(async (html: string) => {
    db.pdfInputs.push(html)
    return { pdf: Buffer.from("%PDF-1.7 stub"), ms: 1 }
  }),
}))

import { PATCH, POST } from "@/app/api/flyers/[id]/edit/route"
import { GET as VIEW } from "@/app/api/flyers/[id]/view/route"
import { GET as PDF } from "@/app/api/flyers/[id]/pdf/route"

const ctx = { params: Promise.resolve({ id: "f1" }) }
const req = (path: string, init?: { method?: string; body?: unknown }) =>
  new NextRequest(`http://localhost${path}`, {
    method: init?.method ?? "GET",
    ...(init?.body ? { body: JSON.stringify(init.body), headers: { "content-type": "application/json" } } : {}),
  })

function doc(template: (typeof TEMPLATES)[number]) {
  return fillTemplate({
    template,
    headline: "Fall Furnace Tune-Up",
    supporting: "21-point safety check for $89.",
    businessName: "Miller Heating & Air",
    phone: "(502) 555-0142",
    address: null,
    hasLogo: false,
    hasQr: false,
    photoUrl: null,
    colors: { primary: "#12314f", secondary: "#e8edf2", accent: "#e39a2b" },
    fonts: { heading: "Georgia, serif", body: "Georgia, serif" },
  }).html
}

beforeEach(() => {
  const square = TEMPLATES.find((t) => /square|social|instagram/i.test(`${t.id} ${(t as { formatId?: string }).formatId ?? ""}`)) ?? TEMPLATES[0]
  db.flyers = [
    {
      id: "f1",
      title: "Fall tune-up",
      status: "Ready",
      trackingCode: "code1",
      downloadUrl: encodeFlyerHtml(doc(TEMPLATES[0])),
      repurposed: { instagramDownloadUrl: encodeFlyerHtml(doc(square)), instagramCaption: "c", textBlurb: "t", nextdoorPost: "n" },
    },
  ]
  db.snapshots.clear()
  db.tracking.clear()
  db.tracking.set("code1", { flyerId: "f1", headline: "Fall Furnace Tune-Up", offer: "21-point safety check for $89.", cta: null, phone: "(502) 555-0142" })
  db.trackingUpdates = []
  db.pdfInputs = []
})

describe("a quick edit reaches every place the flyer is shown", () => {
  it("full-screen view and PDF both show the edit, and the view is never cached", async () => {
    const before = await VIEW(req("/api/flyers/f1/view?v=1"), ctx)
    expect(await before.text()).toContain("$89")

    const edit = await PATCH(req("/api/flyers/f1/edit", { method: "PATCH", body: { fields: { supporting: "21-point safety check for $79." } } }), ctx)
    expect(edit?.status).toBe(200)

    const view = await VIEW(req("/api/flyers/f1/view?v=1"), ctx)
    const html = await view.text()
    expect(html).toContain("$79")
    expect(html).not.toContain("$89")
    // The cause: max-age=300 on a URL that never changes served the pre-edit copy.
    expect(view.headers.get("cache-control")).toBe("private, no-store")
    // Same sandbox as before the edit.
    expect(view.headers.get("content-security-policy")).toBe("sandbox allow-same-origin allow-modals;")

    const pdf = await PDF(req("/api/flyers/f1/pdf"), ctx)
    expect(pdf.status).toBe(200)
    expect(db.pdfInputs.at(-1)).toContain("$79")
    expect(db.pdfInputs.at(-1)).not.toContain("$89")
  })

  it("the Instagram version gets the edit too", async () => {
    await PATCH(req("/api/flyers/f1/edit", { method: "PATCH", body: { fields: { headline: "Winter Furnace Check" } } }), ctx)
    const view = await VIEW(req("/api/flyers/f1/view?v=1&variant=instagram"), ctx)
    expect(await view.text()).toContain("Winter Furnace Check")
    await PDF(req("/api/flyers/f1/pdf?variant=instagram"), ctx)
    expect(db.pdfInputs.at(-1)).toContain("Winter Furnace Check")
  })

  it("the QR offer page gets the changed headline, phone and offer", async () => {
    await PATCH(
      req("/api/flyers/f1/edit", {
        method: "PATCH",
        body: { fields: { headline: "Winter Furnace Check", phone: "(502) 555-0199", supporting: "21-point safety check for $79." } },
      }),
      ctx,
    )
    expect(db.trackingUpdates).toEqual([
      { flyerId: "f1", code: "code1", patch: { headline: "Winter Furnace Check", cta: undefined, phone: "(502) 555-0199", offer: "21-point safety check for $79." } },
    ])
  })

  it("an offer-page summary that differs from the flyer text is left alone", async () => {
    db.tracking.set("code1", { flyerId: "f1", offer: "Book your tune-up today", headline: "x" })
    await PATCH(req("/api/flyers/f1/edit", { method: "PATCH", body: { fields: { supporting: "21-point safety check for $79." } } }), ctx)
    expect(db.trackingUpdates[0].patch.offer).toBeUndefined()
  })

  it("undo restores the old text everywhere, including the offer page", async () => {
    await PATCH(req("/api/flyers/f1/edit", { method: "PATCH", body: { fields: { headline: "Winter Furnace Check" } } }), ctx)
    const undo = await POST(req("/api/flyers/f1/edit?action=revert", { method: "POST" }), ctx)
    expect(undo?.status).toBe(200)
    expect(await (await VIEW(req("/api/flyers/f1/view?v=1"), ctx)).text()).toContain("Fall Furnace Tune-Up")
    expect(await (await VIEW(req("/api/flyers/f1/view?v=1&variant=instagram"), ctx)).text()).toContain("Fall Furnace Tune-Up")
    expect(db.trackingUpdates.at(-1)?.patch.headline).toBe("Fall Furnace Tune-Up")
  })

  it("edited text is inserted as text, not markup", async () => {
    await PATCH(req("/api/flyers/f1/edit", { method: "PATCH", body: { fields: { headline: '<img src=x onerror="alert(1)">' } } }), ctx)
    const html = await (await VIEW(req("/api/flyers/f1/view?v=1"), ctx)).text()
    expect(html).not.toContain("<img src=x")
    expect(html).toContain("&lt;img src=x")
  })
})
