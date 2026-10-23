import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { generateImage, MODEL_ID, MAX_PROMPT_CHARS } from "@/lib/agent-pipeline/higgsfield"
import { buildAiPhotoPrompt } from "@/lib/agent-pipeline/pipeline"
import type { NormalizedIntake } from "@/lib/agent-pipeline/schemas/intake"
import type { FlyerRequest } from "@/lib/agent-pipeline/schemas/flyer"

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })

describe("generateImage", () => {
  let fetchMock: ReturnType<typeof vi.fn>
  let errors: string[]

  beforeEach(() => {
    vi.stubEnv("HF_API_KEY", "test-key")
    vi.stubEnv("HF_API_SECRET", "test-secret")
    fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    errors = []
    vi.spyOn(console, "error").mockImplementation((msg: string) => void errors.push(msg))
    vi.spyOn(console, "log").mockImplementation(() => {})
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it("submits to the current endpoint with the documented body and headers", async () => {
    fetchMock.mockResolvedValueOnce(json(200, { status: "completed", request_id: "r1", images: [{ url: "https://cdn.example.com/a.png" }] }))
    const result = await generateImage({ prompt: "an empty workshop", context: "t" })

    expect(result).toEqual({ ok: true, url: "https://cdn.example.com/a.png", creditsUsed: null })
    const [url, init] = fetchMock.mock.calls[0]
    // The legacy platform.higgsfield.ai/z_image endpoint is what returned 404.
    expect(url).toBe("https://api.higgsfield.ai/z-image/turbo")
    expect(MODEL_ID).toBe("z-image/turbo")
    expect(init.headers.Authorization).toBe("Key test-key:test-secret")
    expect(init.headers["Idempotency-Key"]).toMatch(/^[0-9a-f-]{36}$/)
    expect(JSON.parse(init.body)).toEqual({ prompt: "an empty workshop", resolution: "1k", aspect_ratio: "4:3", prompt_extend: false })
  })

  it("turns a 404 into a clear FAILED log line and a reason, not a silent null", async () => {
    fetchMock.mockResolvedValueOnce(json(404, { detail: "Not found" }))
    const result = await generateImage({ prompt: "x", context: 'flyer "Promo"' })

    expect(result).toMatchObject({ ok: false, reason: "submit_rejected" })
    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('[higgsfield] FAILED flyer "Promo": submit_rejected — HTTP 404')
    expect(errors[0]).toContain("z-image/turbo")
    expect(errors[0]).toContain("Not found")
    // Credentials never reach the log.
    expect(errors[0]).not.toContain("test-secret")
  })

  it("polls the returned status_url on Higgsfield's host until completion", async () => {
    vi.useFakeTimers()
    try {
      fetchMock
        .mockResolvedValueOnce(json(200, { status: "queued", request_id: "r2", status_url: "https://api.higgsfield.ai/requests/r2/status" }))
        .mockResolvedValueOnce(json(200, { status: "in_progress", request_id: "r2" }))
        .mockResolvedValueOnce(json(200, { status: "completed", request_id: "r2", images: [{ url: "https://cdn.example.com/b.png" }], credits_used: 0.15 }))
      const pending = generateImage({ prompt: "x", context: "t" })
      await vi.runAllTimersAsync()
      expect(await pending).toEqual({ ok: true, url: "https://cdn.example.com/b.png", creditsUsed: 0.15 })
      expect(fetchMock.mock.calls[1][0]).toBe("https://api.higgsfield.ai/requests/r2/status")
    } finally {
      vi.useRealTimers()
    }
  })

  it("never sends credentials to a status_url on another host", async () => {
    vi.useFakeTimers()
    try {
      fetchMock
        .mockResolvedValueOnce(json(200, { status: "queued", request_id: "r3", status_url: "https://attacker.example/steal" }))
        .mockResolvedValueOnce(json(200, { status: "completed", request_id: "r3", images: [{ url: "https://cdn.example.com/c.png" }] }))
      const pending = generateImage({ prompt: "x", context: "t" })
      await vi.runAllTimersAsync()
      await pending
      expect(fetchMock.mock.calls[1][0]).toBe("https://api.higgsfield.ai/requests/r3/status")
    } finally {
      vi.useRealTimers()
    }
  })

  it("reports nsfw / failed / canceled endings as unsuccessful", async () => {
    fetchMock.mockResolvedValueOnce(json(200, { status: "nsfw", request_id: "r4" }))
    expect(await generateImage({ prompt: "x", context: "t" })).toMatchObject({ ok: false, reason: "unsuccessful" })
    expect(errors[0]).toContain('ended with status "nsfw"')
  })

  it("logs a network failure instead of throwing", async () => {
    fetchMock.mockRejectedValueOnce(new Error("ECONNRESET"))
    expect(await generateImage({ prompt: "x", context: "t" })).toMatchObject({ ok: false, reason: "network_error", detail: "ECONNRESET" })
  })

  it("refuses to call the API without credentials or with an over-long prompt", async () => {
    expect(await generateImage({ prompt: "x".repeat(MAX_PROMPT_CHARS + 1), context: "t" })).toMatchObject({ ok: false, reason: "prompt_too_long" })
    vi.stubEnv("HF_API_SECRET", "")
    expect(await generateImage({ prompt: "x", context: "t" })).toMatchObject({ ok: false, reason: "not_configured" })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe("buildAiPhotoPrompt", () => {
  const intake = {
    industry: "HVAC",
    services: ["Furnace repair"],
    targetAudience: "Homeowners",
  } as unknown as NormalizedIntake

  it("stays within the API's prompt limit and keeps the no-people / no-text constraints", () => {
    const request = { id: "f1", purpose: "Fall tune-up", notes: "very long note ".repeat(200) } as unknown as FlyerRequest
    const prompt = buildAiPhotoPrompt(intake, request)
    expect(prompt.length).toBeLessThanOrEqual(MAX_PROMPT_CHARS)
    expect(prompt).toContain("Absolutely no people")
    expect(prompt).toContain("no lettering of any kind")
    expect(prompt.startsWith("HVAC business, Fall tune-up")).toBe(true)
  })

  it("leaves a normal prompt untouched", () => {
    const request = { id: "f1", purpose: "Fall tune-up", notes: null } as unknown as FlyerRequest
    expect(buildAiPhotoPrompt(intake, request)).toMatch(/^HVAC business, Fall tune-up, offering Furnace repair, for an audience of Homeowners\. Empty scene/)
  })
})
