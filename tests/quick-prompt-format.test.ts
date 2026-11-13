import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextRequest } from "next/server"

/**
 * The format chosen in Quick Prompt reaches the generator. The route built the
 * intake with the right formatId but handed the pipeline a request without
 * one, which reads as "flyer": a door hanger came back as a letter flyer.
 */

const s = vi.hoisted(() => ({ requests: [] as { id: string; formatId?: string }[][] }))
vi.mock("@/lib/auth", () => ({ ADMIN_SUB: "admin", getSessionIdentity: async () => ({ sub: "basic@x.test" }) }))
vi.mock("@/lib/enterprise/generation-guard", () => ({ nopAgentGenerationBlock: async () => null }))
vi.mock("@vercel/functions", () => ({ waitUntil: () => {} }))
vi.mock("@/lib/store", () => ({
  getOrCreateClient: async (email: string) => ({ email, plan: "basic", pausedAt: null, flyersCreated: 0, businessCategory: "Contractor" }),
  reserveFlyerQuota: async () => ({ ok: true }),
  getSavedBrandProfile: async () => null,
  getCampaignDefaults: async () => null,
}))
vi.mock("@/lib/agent-pipeline/agents/quickPromptAgent", () => ({
  runQuickPromptAgent: async () => ({
    blocked: false,
    clarifyingQuestion: null,
    purpose: "Spring roof inspection",
    industry: "Roofing",
    targetAudience: "Homeowners",
    targetAudienceStated: true,
    styleCues: [],
    businessNameGuess: "Pearl Roofing",
  }),
}))
vi.mock("@/lib/agent-pipeline/pipeline", () => ({
  continuePipelineFromIntake: async (_email: string, _intake: unknown, requests: { id: string; formatId?: string }[]) => void s.requests.push(requests),
}))

beforeEach(() => {
  s.requests = []
})

async function generate(format: string) {
  const { POST } = await import("@/app/api/quick-prompt/route")
  const res = await POST(
    new NextRequest("https://oneflyer.org/api/quick-prompt", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ prompt: "Spring roof inspection, free estimate", format, useSavedBrand: false, businessName: "Pearl Roofing", phone: "270-555-0100", attempt: 0 }),
    }),
  )
  return res.status
}

describe("Quick Prompt: the chosen format reaches the generator", () => {
  for (const [label, formatId] of [
    ["Door Hanger", "door-hanger"],
    ["Social Post", "social-post"],
    ["One-Pager", "one-pager"],
    ["Proposal", "proposal"],
    ["Flyer", "flyer"],
  ] as const) {
    it(`${label} -> ${formatId}`, async () => {
      expect(await generate(label)).toBe(201)
      expect(s.requests).toHaveLength(1)
      expect(s.requests[0]).toEqual([expect.objectContaining({ formatId })])
    })
  }
})
