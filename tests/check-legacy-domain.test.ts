import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { spawn } from "node:child_process"
import http from "node:http"
import type { AddressInfo } from "node:net"

/**
 * The hourly QR check must look at page content. A page that returns 200 for
 * the wrong business, or a 404, has to fail the run, not just a dead host.
 */

const pages: Record<string, { status: number; body: string }> = {
  "/r/GOOD234": { status: 200, body: '<p>Pearl &amp; Sons&#x27; Roofing</p><script src="/_next/static/a.js"></script>' },
  "/r/WRONG23": { status: 200, body: '<p>Some Other Business</p><script src="/_next/static/a.js"></script>' },
  "/r/DEAD234": { status: 200, body: "<p>This link isn&#x27;t valid.</p>" },
  "/r/GONE234": { status: 404, body: "<p>Not found</p>" },
}
let server: http.Server
let origin = ""

beforeAll(async () => {
  server = http.createServer((req, res) => {
    const url = req.url ?? ""
    if (url.startsWith("/_next/")) return res.writeHead(200).end("ok")
    if (url.startsWith("/api/tracking/click/")) return res.writeHead(405).end()
    const page = pages[url] ?? { status: 404, body: "" }
    res.writeHead(page.status, { "content-type": "text/html" }).end(page.body)
  })
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r))
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})
afterAll(() => void server.close())

function run(args: string[], env: Record<string, string> = {}) {
  return new Promise<{ code: number | null; out: string }>((resolve) => {
    const child = spawn(process.execPath, ["scripts/check-legacy-domain.mjs", "--canary", "--connect", origin, ...args], { env: { ...process.env, QR_CHECK_CODE: "", QR_CHECK_TEXT: "", ...env } })
    let out = ""
    child.stdout.on("data", (d) => (out += d))
    child.stderr.on("data", (d) => (out += d))
    child.on("close", (code) => resolve({ code, out }))
  })
}
const NAME = "Pearl & Sons' Roofing"

describe("the hourly QR check", () => {
  it("passes when the known code shows its business name, escaped as HTML", async () => {
    const r = await run(["--code", "GOOD234", "--expect", NAME])
    expect(r.code).toBe(0)
    expect(r.out).toContain(`shows "${NAME}"`)
  })

  it("takes the code and name from the workflow's variables", async () => {
    expect((await run([], { QR_CHECK_CODE: "GOOD234", QR_CHECK_TEXT: NAME })).code).toBe(0)
  })

  it("fails on a 200 that shows another business", async () => {
    const r = await run(["--code", "WRONG23", "--expect", NAME])
    expect(r.code).toBe(1)
    expect(r.out).toContain(`doesn't show "${NAME}"`)
  })

  it("fails on a 200 'This link isn't valid' page, the case a status check missed", async () => {
    expect((await run(["--code", "DEAD234", "--expect", NAME])).code).toBe(1)
  })

  it("fails on a 404, saying the code doesn't exist", async () => {
    const r = await run(["--code", "GONE234", "--expect", NAME])
    expect(r.code).toBe(1)
    expect(r.out).toContain(`HTTP 404: code "GONE234" doesn't exist`)
  })

  it("with no variables set, falls back to the canary and fails if it's missing", async () => {
    const r = await run([])
    expect(r.code).toBe(1)
    expect(r.out).toContain("health-canary")
  })
})
