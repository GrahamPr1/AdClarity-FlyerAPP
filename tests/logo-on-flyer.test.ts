import { describe, it, expect } from "vitest"
import { substituteLogo, logoPresentIn, LOGO_PLACEHOLDER, QR_PLACEHOLDER, substituteQr } from "@/lib/agent-pipeline/flyer-html"
import { FlyerAgentInputSchema } from "@/lib/agent-pipeline/schemas/flyer"
import { FLYER_AGENT_SYSTEM_PROMPT } from "@/lib/agent-pipeline/prompts/flyer"

/**
 * An uploaded logo never reached a flyer. It was dropped three times over:
 * the file input captured only `file.name` and discarded the File, nothing
 * carried a logo URL into generation, and the Flyer Agent had no logo field
 * or instruction at all.
 *
 * These assert the OUTPUT contains the logo — the thing a client actually
 * looks at — not that an upload endpoint returned 200.
 */
const LOGO = "https://example.test/api/photos/abc/logo.png"
const PAGE = (body: string) => `<html><head><title>t</title></head><body>${body}</body></html>`

describe("the logo reaches the rendered flyer", () => {
  it("substitutes the token the agent was told to emit", () => {
    const html = PAGE(`<header><img src="${LOGO_PLACEHOLDER}" alt="" /></header><h1>Spring Offer</h1>`)
    const out = substituteLogo(html, LOGO)
    expect(out).toContain(LOGO)
    expect(out).not.toContain(LOGO_PLACEHOLDER)
    expect(logoPresentIn(out, LOGO)).toBe(true)
  })

  it("INJECTS the logo when the agent omitted the token entirely", () => {
    // The guarantee. A prompt is a request; the agent composes fresh every
    // call and cannot see what the last one left out.
    const html = PAGE(`<h1>Spring Offer</h1><p>Call 555-0142</p>`)
    expect(html).not.toContain(LOGO_PLACEHOLDER)
    const out = substituteLogo(html, LOGO)
    expect(logoPresentIn(out, LOGO)).toBe(true)
    expect(out).toMatch(/<img[^>]+src="https:\/\/example\.test[^"]+"/)
  })

  it("places an injected logo inside <body>, not adrift outside it", () => {
    const out = substituteLogo(PAGE(`<h1>Offer</h1>`), LOGO)
    const bodyStart = out.toLowerCase().indexOf("<body")
    const bodyEnd = out.toLowerCase().indexOf("</body>")
    expect(out.indexOf(LOGO)).toBeGreaterThan(bodyStart)
    expect(out.indexOf(LOGO)).toBeLessThan(bodyEnd)
  })

  it("leaves a flyer with no logo completely untouched", () => {
    const html = PAGE(`<h1>Offer</h1>`)
    expect(substituteLogo(html, null)).toBe(html)
  })

  it("never lets a literal token reach a flyer when there is no logo", () => {
    // The model emitting the token despite hasLogo:false must not print
    // "{{LOGO_SRC}}" on a piece someone hands to a customer.
    const html = PAGE(`<img src="${LOGO_PLACEHOLDER}" alt="" /><h1>Offer</h1>`)
    const out = substituteLogo(html, null)
    expect(out).not.toContain(LOGO_PLACEHOLDER)
  })

  it("does not disturb the QR substitution that shares the pipeline", () => {
    const html = PAGE(`<img src="${LOGO_PLACEHOLDER}"><img src="${QR_PLACEHOLDER}">`)
    const out = substituteLogo(substituteQr(html, "data:image/png;base64,AAA"), LOGO)
    expect(out).toContain(LOGO)
    expect(out).toContain("data:image/png;base64,AAA")
    expect(out).not.toContain(LOGO_PLACEHOLDER)
    expect(out).not.toContain(QR_PLACEHOLDER)
  })

  it("is idempotent — re-running cannot double-inject", () => {
    const once = substituteLogo(PAGE(`<h1>Offer</h1>`), LOGO)
    const twice = substituteLogo(once, LOGO)
    expect(twice.split(LOGO).length - 1).toBe(1)
  })
})

describe("the contract that gets a logo there at all", () => {
  it("the flyer agent input carries hasLogo", () => {
    const parsed = FlyerAgentInputSchema.safeParse({
      brandProfile: {},
      contact: { phone: "1", address: null, website: null, social: null },
      photos: [],
      hasLogo: true,
      flyerRequests: [],
      batchSize: 1,
      includeRepurposing: false,
    })
    expect(parsed.success).toBe(true)
  })

  it("rejects an input that forgot hasLogo, so a caller cannot silently drop it", () => {
    const parsed = FlyerAgentInputSchema.safeParse({
      brandProfile: {},
      contact: { phone: "1", address: null, website: null, social: null },
      photos: [],
      flyerRequests: [],
      batchSize: 1,
      includeRepurposing: false,
    })
    expect(parsed.success).toBe(false)
  })

  it("the prompt tells the agent the exact token to emit", () => {
    expect(FLYER_AGENT_SYSTEM_PROMPT).toContain(LOGO_PLACEHOLDER)
    expect(FLYER_AGENT_SYSTEM_PROMPT).toMatch(/hasLogo/)
  })
})
