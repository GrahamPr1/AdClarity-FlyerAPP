import { describe, it, expect, vi, beforeEach } from "vitest"
import { fillTemplate, TEMPLATES } from "@/lib/agent-pipeline/template-mode"
import { substituteQr, substituteLogo, toDataUrl } from "@/lib/agent-pipeline/flyer-html"
import { readEditableFields } from "@/lib/agent-pipeline/flyer-edit"
import { decodeFlyerHtml } from "@/lib/flyer-data-url"

const QR = "data:image/png;base64,QRQRQR"
const LOGO = "https://oneflyer.org/api/photos/onboarding-photos/rehosted/logo/a.png"

const t = vi.hoisted(() => ({
  updates: [] as Record<string, unknown>[],
  refunds: 0,
  proposal: null as unknown,
  agentThrows: false,
  layout: { before: { pages: 1, clipped: [] as string[] }, after: { pages: 1, clipped: [] as string[] } },
  layoutCalls: 0,
  synced: [] as unknown[],
  stored: null as Record<string, unknown> | null,
}))

vi.mock("@/lib/store", () => ({
  updateDeliverable: vi.fn(async (_e: string, p: Record<string, unknown>) => void t.updates.push(p)),
  releaseFlyerQuota: vi.fn(async () => void t.refunds++),
  getDeliverablesForEmail: vi.fn(async () => ({ flyers: t.stored ? [t.stored] : [] })),
}))
vi.mock("@/lib/agent-pipeline/agents/quickEditAgent", () => ({
  runQuickEditAgent: vi.fn(async () => {
    if (t.agentThrows) throw new Error("model unavailable")
    return t.proposal
  }),
}))
vi.mock("@/lib/agent-pipeline/qrTracking", () => ({
  qrDataUrlForCode: vi.fn(async () => QR),
  backfillTrackingContent: vi.fn(),
  createFlyerTrackingCode: vi.fn(),
}))
vi.mock("@/lib/agent-pipeline/offer-page-sync", () => ({ syncOfferPage: vi.fn(async (...args: unknown[]) => void t.synced.push(args)) }))
vi.mock("@/lib/pdf/flyer-pdf", () => ({
  // Called before-then-after (Promise.all order), so alternate.
  measureLayout: vi.fn(async () => (t.layoutCalls++ % 2 === 0 ? t.layout.before : t.layout.after)),
}))

import { refineFlyer } from "@/lib/agent-pipeline/pipeline"

const doc = (template: (typeof TEMPLATES)[number]) =>
  substituteLogo(
    substituteQr(
      fillTemplate({
        template,
        headline: "Fall Furnace Tune-Up for $89",
        supporting: "21-point safety check before the cold hits.",
        businessName: "Miller Heating & Air",
        phone: "(502) 555-0142",
        address: null,
        hasLogo: true,
        hasQr: true,
        photoUrl: null,
        colors: { primary: "#12314f", secondary: "#e8edf2", accent: "#e39a2b" },
        fonts: { heading: "Georgia, serif", body: "Georgia, serif" },
      }).html,
      QR,
    ),
    LOGO,
  )
const current = doc(TEMPLATES[0])
const square = doc(TEMPLATES.find((x) => x.id === "social-square") ?? TEMPLATES[0])
const brand = {
  businessName: "Miller Heating & Air",
  positioning: "HVAC repair in Louisville",
  targetAudience: ["Homeowners"],
  brandVoice: ["friendly"],
} as unknown as Parameters<typeof refineFlyer>[1]

const proposal = (fields: Record<string, string | null>, style = { look: "unchanged", emphasis: "unchanged" }) => ({
  fields: { headline: null, supporting: null, phone: null, address: null, ...fields },
  style,
  cannotApply: null,
  summary: "Added 24/7 emergency service to the supporting line.",
})

const run = (instruction: string, paid = false) =>
  refineFlyer("owner@example.com", brand, {} as never, { id: "f1", purpose: "Fall tune-up", notes: null } as never, current, instruction, "code1", true, LOGO, paid)

const last = () => t.updates.at(-1)!

beforeEach(() => {
  t.updates = []
  t.refunds = 0
  t.agentThrows = false
  t.layoutCalls = 0
  t.layout = { before: { pages: 1, clipped: [] }, after: { pages: 1, clipped: [] } }
  t.synced = []
  t.stored = { id: "f1", repurposed: { instagramDownloadUrl: toDataUrl(square), instagramCaption: "c", textBlurb: "t", nextdoorPost: "n" } }
})

describe("refineFlyer on a template flyer", () => {
  it("saves a good edit to the flyer and its Instagram version, and updates the QR page", async () => {
    t.proposal = proposal({ supporting: "24/7 emergency service. 21-point safety check." })
    await run("add 24/7 emergency service")
    const saved = last()
    expect(saved.status).toBe("Ready")
    const html = decodeFlyerHtml(saved.downloadUrl as string)!
    expect(readEditableFields(html).find((f) => f.field === "supporting")?.value).toBe("24/7 emergency service. 21-point safety check.")
    expect(html).toContain(QR)
    expect(html).toContain(LOGO)
    expect(decodeFlyerHtml((saved.repurposed as { instagramDownloadUrl: string }).instagramDownloadUrl)).toContain("24/7 emergency service")
    expect(saved.lastEdit).toMatchObject({ outcome: "applied" })
    expect(saved.generationMode).toBeUndefined() // still a template flyer
    expect(t.synced).toHaveLength(1)
  })

  it("rejects an edit that breaks the phone number, keeps the previous version, and refunds a paid edit", async () => {
    t.proposal = proposal({ phone: "Call us today" })
    await run("make it feel more premium", true)
    const saved = last()
    expect(saved.status).toBe("Ready")
    expect(saved.downloadUrl).toBeUndefined() // nothing written: the previous version stays
    expect(saved.lastEdit).toMatchObject({ outcome: "rejected" })
    expect(String((saved.lastEdit as { message: string }).message)).toContain("phone number")
    expect(t.refunds).toBe(1)
    expect(t.synced).toHaveLength(0)
  })

  it("rejects an edit that would print onto an extra page or clip text", async () => {
    t.proposal = proposal({ supporting: "A slightly longer supporting line about the tune-up." })
    t.layout.after = { pages: 2, clipped: [] }
    await run("add more detail")
    expect(last().lastEdit).toMatchObject({ outcome: "rejected" })
    expect(String((last().lastEdit as { message: string }).message)).toContain("extra page")

    t.layoutCalls = 0
    t.layout.after = { pages: 1, clipped: ["A slightly longer supporting line"] }
    await run("add more detail")
    expect(String((last().lastEdit as { message: string }).message)).toContain("cut off some text")
  })

  it("an agent failure leaves the flyer Ready as it was — never Failed", async () => {
    t.agentThrows = true
    await run("shorten the text", true)
    expect(t.updates.some((u) => u.status === "Failed")).toBe(false)
    expect(last()).toMatchObject({ status: "Ready", lastEdit: { outcome: "rejected" } })
    expect(t.refunds).toBe(1)
  })
})
