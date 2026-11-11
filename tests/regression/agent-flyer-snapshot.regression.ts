import { describe, it, vi } from "vitest"
import { createHash } from "node:crypto"
import fs from "node:fs"
import path from "node:path"

/**
 * Agent-portal regression snapshot: renders real agent flyers and writes
 * what they produce to REGRESSION_OUT, so two runs (before and after a change
 * to shared code) can be diffed byte for byte.
 *
 * Not part of `npm test` — it launches Chromium and is meant to be run on
 * demand: `npm run test:agent-regression`, with REGRESSION_OUT set to a fresh
 * directory each time, then `diff -r` the two directories.
 *
 * Captured:
 *   - NOP kit v1: every template, preview and social PNGs (the renderer's
 *     own output, gates included).
 *   - NOP kit v2: every template, the agent HTML (v2AgentHtml) and the
 *     preview PNG.
 *   - Enterprise (non-NOP org) accounts that use the AI pipeline: the
 *     deterministic photo post-processing (applyPhotoObligations) on fixed
 *     HTML, plus every outbound request it makes.
 *
 * Only the Redis-backed lookups are replaced, with fixed values; everything
 * that decides what goes on the page runs as shipped.
 */

const AGENT = { agentId: "858980", displayName: "Pat Rivera", displayPhone: "(555) 010-2030", displayEmail: "pat@example.test" }
const QR_CODE = "R3gTest"

vi.mock("@/lib/enterprise/nop-enroll-domain", async (orig) => ({
  ...(await orig<typeof import("@/lib/enterprise/nop-enroll-domain")>()),
  getEnrollDomain: async () => (await import("@/lib/enterprise/nop-roster")).DEFAULT_ENROLL_DOMAIN,
}))
vi.mock("@/lib/enterprise/nop-qr-code", async (orig) => ({
  ...(await orig<typeof import("@/lib/enterprise/nop-qr-code")>()),
  getOrIssueAgentQrCode: async () => QR_CODE,
  agentIdForQrCode: async (code: string) => (code === QR_CODE ? AGENT.agentId : null),
}))
vi.mock("@/lib/enterprise/agents-store", async (orig) => ({
  ...(await orig<typeof import("@/lib/enterprise/agents-store")>()),
  getRosterRecord: async () => ({ agentId: AGENT.agentId, status: "active" }),
}))

const OUT = process.env.REGRESSION_OUT
const sha = (b: Buffer | string) => createHash("sha256").update(b).digest("hex")

function write(rel: string, body: Buffer | string) {
  const file = path.join(OUT!, rel)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, body)
}

describe.runIf(!!OUT)("agent flyer regression snapshot", () => {
  it("NOP kit v1: every template, preview and social", async () => {
    const { NOP_TEMPLATES } = await import("@/lib/enterprise/nop-render/kit")
    const { renderNopFlyer } = await import("@/lib/enterprise/nop-render/render")
    for (const id of NOP_TEMPLATES) {
      for (const format of ["preview", "social"] as const) {
        const r = await renderNopFlyer(id, AGENT, format)
        write(`nop-v1/${id}.${format}.png`, r.body)
        write(`nop-v1/${id}.${format}.qr.txt`, `${r.qr}\n`)
      }
    }
  }, 600_000)

  it("NOP kit v2: every template, agent HTML and preview", async () => {
    const { NOP_V2_TEMPLATES } = await import("@/lib/enterprise/nop-render/kit-v2")
    const { v2AgentHtml, renderNopV2ForAgent } = await import("@/lib/enterprise/nop-render/render-v2")
    const { qrDestinationFor, nopQrLink, DEFAULT_ENROLL_DOMAIN } = await import("@/lib/enterprise/nop-roster")
    const enrollment = qrDestinationFor(AGENT.agentId, DEFAULT_ENROLL_DOMAIN)
    for (const id of NOP_V2_TEMPLATES) {
      write(`nop-v2/${id}.letter.html`, await v2AgentHtml(id, "letter", AGENT, nopQrLink(QR_CODE), enrollment))
      // A gate refusing to render is behaviour too: record it rather than stop.
      try {
        const r = await renderNopV2ForAgent(id, "letter", AGENT, "preview")
        write(`nop-v2/${id}.letter.preview.${r.contentType.split("/")[1]}`, r.body)
      } catch (err) {
        write(`nop-v2/${id}.letter.preview.error.txt`, `${err instanceof Error ? err.message : err}\n`)
      }
    }
  }, 600_000)

  it("enterprise pipeline accounts: photo post-processing on fixed HTML", async () => {
    vi.stubEnv("UNSPLASH_ACCESS_KEY", "regression-key")
    const calls: string[] = []
    const realFetch = globalThis.fetch
    globalThis.fetch = (async (input: string | URL | Request) => {
      calls.push(String(input instanceof Request ? input.url : input))
      return new Response("{}", { status: 200 })
    }) as typeof fetch
    try {
      const { applyPhotoObligations } = await import("@/lib/agent-pipeline/pipeline")
      const photo = {
        provider: "unsplash" as const,
        id: "abc123",
        url: "https://images.unsplash.com/photo-1?crop=entropy&cs=tinysrgb&w=1080",
        photographerName: "Ana <Lopez>",
        photographerUrl: "https://unsplash.com/@ana",
        downloadLocation: "https://api.unsplash.com/photos/abc123/download?ixid=x",
        description: "roof",
      }
      const used = `<html><body><img src="${photo.url.replace(/&/g, "&amp;")}"><h1>Roof</h1></body></html>`
      const unused = `<html><body><h1>No photo</h1></body></html>`
      for (const [name, html, format] of [
        ["used-print", used, "flyer"],
        ["used-screen", used, "social-post"],
        ["unused-print", unused, "flyer"],
      ] as const) {
        calls.length = 0
        const out = await applyPhotoObligations(html, [photo], format, `regression ${name}`)
        write(`enterprise-pipeline/${name}.html`, out)
        write(`enterprise-pipeline/${name}.requests.txt`, calls.join("\n") + "\n")
      }
    } finally {
      globalThis.fetch = realFetch
      vi.unstubAllEnvs()
    }
  })

  it("writes a manifest", () => {
    const lines: string[] = []
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
        const p = path.join(dir, e.name)
        if (e.isDirectory()) walk(p)
        else if (e.name !== "MANIFEST.txt") lines.push(`${sha(fs.readFileSync(p))}  ${path.relative(OUT!, p)}`)
      }
    }
    walk(OUT!)
    write("MANIFEST.txt", lines.join("\n") + "\n")
  })
})
