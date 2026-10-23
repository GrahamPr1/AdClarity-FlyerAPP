#!/usr/bin/env node
/**
 * Checks that printed QR codes still work on the legacy domain, and that its
 * pages redirect to oneflyer.org. Read-only: it never logs in and never
 * counts a click (the one request to the click counter is a GET, which that
 * route doesn't answer). Opening the canary's scan page does count a scan —
 * on the canary's own record, which exists for exactly this.
 *
 *   node scripts/check-legacy-domain.mjs             # full post-deploy check
 *   node scripts/check-legacy-domain.mjs --canary    # just what printed QR codes need
 *
 * Options
 *   --legacy <origin>     default https://ad-clarity-landing-page.vercel.app
 *   --canonical <origin>  default https://oneflyer.org
 *   --code <code>         canary QR code, default health-canary
 *                         (created by scripts/create-qr-canary.ts)
 *   --connect <origin>    send every request here instead, keeping the real
 *                         host (legacy or canonical) in the Host header — e.g.
 *                         http://localhost:3000 to test the rules on a dev server
 *
 * Exits 1 if any check fails. No dependencies, so the scheduled workflow
 * (.github/workflows/qr-canary.yml) runs it with plain Node.
 */
import http from "node:http"
import https from "node:https"

const args = process.argv.slice(2)
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback
}
const LEGACY = opt("legacy", "https://ad-clarity-landing-page.vercel.app").replace(/\/+$/, "")
const CANONICAL = opt("canonical", "https://oneflyer.org").replace(/\/+$/, "")
const CODE = opt("code", "health-canary")
const CONNECT = opt("connect", null)
const CANARY_ONLY = args.includes("--canary")
const CANARY_MARKER = "OneFlyer QR health check"

/** One request, no redirects followed. Returns status, headers and up to 512 KB of body. */
function request(origin, path, { method = "GET" } = {}) {
  const target = new URL(path, CONNECT ?? origin)
  const hostHeader = new URL(origin).host
  const lib = target.protocol === "http:" ? http : https
  return new Promise((resolve, reject) => {
    const req = lib.request(
      target,
      { method, headers: { host: hostHeader, "user-agent": "oneflyer-legacy-domain-check/1" }, timeout: 15_000 },
      (res) => {
        const chunks = []
        let size = 0
        res.on("data", (c) => {
          if (size < 512 * 1024) chunks.push(c)
          size += c.length
        })
        res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString("utf8") }))
        res.on("error", reject)
      },
    )
    req.on("timeout", () => req.destroy(new Error("timed out after 15s")))
    req.on("error", reject)
    req.end()
  })
}

const results = []
async function check(name, fn) {
  try {
    const detail = await fn()
    results.push({ ok: true, name, detail })
  } catch (err) {
    results.push({ ok: false, name, detail: err instanceof Error ? err.message : String(err) })
  }
}
const expect = (cond, msg) => {
  if (!cond) throw new Error(msg)
}
const notRedirect = (r, what) => expect(!(r.status >= 300 && r.status < 400), `${what} redirected (${r.status} → ${r.headers.location})`)

// ---- What every printed QR code needs, on the legacy host ----------------------
let scanHtml = ""
await check(`scan page ${LEGACY}/r/${CODE}`, async () => {
  const r = await request(LEGACY, `/r/${CODE}`)
  notRedirect(r, "scan page")
  expect(r.status === 200, `HTTP ${r.status}`)
  expect(r.body.includes(CANARY_MARKER), `200, but not the canary page (no "${CANARY_MARKER}") — is the canary record missing?`)
  scanHtml = r.body
  return "200, canary content"
})

await check("scan page assets (/_next/) served on the legacy host", async () => {
  const assets = [...new Set([...scanHtml.matchAll(/(?:src|href)="(\/_next\/[^"]+)"/g)].map((m) => m[1]))].slice(0, 3)
  expect(assets.length > 0, "no /_next/ assets found in the scan page")
  for (const a of assets) {
    const r = await request(LEGACY, a)
    notRedirect(r, a)
    expect(r.status === 200, `${a}: HTTP ${r.status}`)
  }
  return `${assets.length} asset(s) 200`
})

await check("click counter reachable on the legacy host (not redirected)", async () => {
  // GET, which the route doesn't implement: proves it's served here without counting a click.
  const r = await request(LEGACY, `/api/tracking/click/${CODE}`)
  notRedirect(r, "click counter")
  expect(r.status === 405, `expected 405 for GET, got ${r.status}`)
  return "405 (served; POST-only)"
})

if (!CANARY_ONLY) {
  // ---- Stored image URLs keep working on the legacy host -------------------------
  await check("photo route served on the legacy host", async () => {
    const r = await request(LEGACY, "/api/photos/onboarding-photos/__legacy-domain-check__.png")
    notRedirect(r, "photo route")
    expect(r.status === 404, `expected 404 for a missing photo, got ${r.status}`)
    return "404 for a missing photo (served, not redirected)"
  })

  // ---- Pages move to the canonical domain -------------------------------------------
  for (const [path, want] of [
    ["/", `${CANONICAL}/`],
    ["/pricing?utm_source=check", `${CANONICAL}/pricing?utm_source=check`],
  ]) {
    await check(`${LEGACY}${path} → ${want}`, async () => {
      const r = await request(LEGACY, path)
      expect(r.status === 308, `expected 308, got ${r.status}`)
      expect(r.headers.location === want, `Location is ${r.headers.location}`)
      return "308"
    })
  }

  await check(`canonical scan page ${CANONICAL}/r/${CODE}`, async () => {
    const r = await request(CANONICAL, `/r/${CODE}`)
    expect(r.status === 200 && r.body.includes(CANARY_MARKER), `HTTP ${r.status}`)
    return "200, canary content"
  })
}

for (const r of results) console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name} — ${r.detail}`)
const failed = results.filter((r) => !r.ok).length
console.log(failed ? `\n${failed} check(s) FAILED` : `\nall ${results.length} checks passed`)
process.exit(failed ? 1 : 0)
