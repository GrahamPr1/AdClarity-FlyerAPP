import { describe, it, expect, vi, beforeEach } from "vitest"
import { EventEmitter } from "node:events"
import { Readable } from "node:stream"
import type { LookupAddress } from "node:dns"

const blob = vi.hoisted(() => ({ put: vi.fn() }))
vi.mock("@vercel/blob", () => blob)

import {
  isBlockedAddress,
  sniffImageType,
  guardedLookup,
  fetchImageSafely,
  rehostExternalImage,
  isOwnPhotoUrl,
  REHOST_MAX_BYTES,
  type FetchDeps,
} from "@/lib/rehost-image"

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 1)])
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64, 2)])
const WEBP = Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WEBP"), Buffer.alloc(32, 3)])
const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>')

// ---- Fake network: a "server" per hostname, and DNS answers per hostname ----

type Reply = { status: number; headers?: Record<string, string>; body?: Buffer | Buffer[]; hang?: boolean }

function fakeNet(dns: Record<string, string[]>, server: Record<string, Reply>) {
  const lookup = (host: string, _o: { all: true }, cb: (e: NodeJS.ErrnoException | null, a: LookupAddress[]) => void) => {
    const addrs = dns[host]
    if (!addrs) return cb(Object.assign(new Error(`ENOTFOUND ${host}`), { code: "ENOTFOUND" }), [])
    cb(null, addrs.map((address) => ({ address, family: address.includes(":") ? 6 : 4 })))
  }
  const connections: string[] = []
  const request: FetchDeps["request"] = (url, options, onResponse) => {
    const req = new EventEmitter() as EventEmitter & { end: () => void; destroy: () => void }
    req.destroy = () => {}
    req.end = () => {
      // Like a real socket: resolve the name through the SUPPLIED lookup first.
      ;(options.lookup as unknown as (h: string, o: object, cb: (e: Error | null) => void) => void)(url.hostname, {}, (err) => {
        if (err) return req.emit("error", err)
        connections.push(url.href)
        const reply = server[url.href] ?? { status: 404 }
        if (reply.hang) return
        const res = Readable.from(Array.isArray(reply.body) ? reply.body : reply.body ? [reply.body] : []) as Readable & {
          statusCode: number
          headers: Record<string, string>
        }
        res.statusCode = reply.status
        res.headers = reply.headers ?? {}
        onResponse(res as never)
      })
    }
    return req as never
  }
  return { deps: { lookup, request } as FetchDeps, connections }
}

const PUBLIC = ["93.184.216.34"]

describe("isBlockedAddress", () => {
  it.each([
    "127.0.0.1", "10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.1.1", "169.254.169.254",
    "100.64.0.1", "0.0.0.0", "224.0.0.1", "255.255.255.255", "::1", "::", "fe80::1", "fd00::1",
    "fc00::abcd", "ff02::1", "::ffff:127.0.0.1", "::ffff:10.0.0.1", "64:ff9b::a00:1", "not-an-ip",
  ])("blocks %s", (ip) => expect(isBlockedAddress(ip)).toBe(true))

  it.each(["93.184.216.34", "8.8.8.8", "172.32.0.1", "2606:4700:4700::1111"])("allows public %s", (ip) =>
    expect(isBlockedAddress(ip)).toBe(false),
  )
})

describe("sniffImageType", () => {
  it("recognises png, jpeg and webp by their bytes", () => {
    expect(sniffImageType(PNG)).toBe("png")
    expect(sniffImageType(JPEG)).toBe("jpeg")
    expect(sniffImageType(WEBP)).toBe("webp")
  })
  it("rejects SVG, GIF and anything else", () => {
    expect(sniffImageType(SVG)).toBeNull()
    expect(sniffImageType(Buffer.from("GIF89a....."))).toBeNull()
    expect(sniffImageType(Buffer.alloc(0))).toBeNull()
  })
})

describe("guardedLookup", () => {
  const resolveTo = (addrs: string[]) => (_h: string, _o: { all: true }, cb: (e: null, a: LookupAddress[]) => void) =>
    cb(null, addrs.map((address) => ({ address, family: 4 })))
  const run = (addrs: string[]) =>
    new Promise<string>((resolve) => guardedLookup(resolveTo(addrs))("x.test", {}, (err, address) => resolve(err ? `error: ${err.message}` : String(address))))

  it("passes a public answer through", async () => expect(await run(["93.184.216.34"])).toBe("93.184.216.34"))
  it("refuses a private answer", async () => expect(await run(["10.0.0.5"])).toMatch(/non-public/))
  it("refuses a mixed answer (one public, one internal)", async () => expect(await run(["93.184.216.34", "127.0.0.1"])).toMatch(/non-public/))
})

describe("fetchImageSafely", () => {
  it("fetches a png", async () => {
    const { deps } = fakeNet({ "logo.example": PUBLIC }, { "https://logo.example/a.png": { status: 200, headers: { "content-type": "image/png" }, body: PNG } })
    const r = await fetchImageSafely("https://logo.example/a.png", deps)
    expect(r).toMatchObject({ ok: true, kind: "png" })
  })

  it("refuses plain http", async () => {
    const r = await fetchImageSafely("http://logo.example/a.png", fakeNet({}, {}).deps)
    expect(r).toMatchObject({ ok: false, reason: "not_https" })
  })

  it("refuses a name that resolves to a private IP — at connect time, before any request is sent", async () => {
    const net = fakeNet({ "internal.example": ["10.0.0.7"] }, { "https://internal.example/a.png": { status: 200, headers: { "content-type": "image/png" }, body: PNG } })
    const r = await fetchImageSafely("https://internal.example/a.png", net.deps)
    expect(r).toMatchObject({ ok: false, reason: "blocked_address" })
    expect(net.connections).toEqual([])
  })

  it("refuses a literal private or metadata IP", async () => {
    expect(await fetchImageSafely("https://169.254.169.254/latest/meta-data", fakeNet({}, {}).deps)).toMatchObject({ ok: false, reason: "blocked_address" })
    expect(await fetchImageSafely("https://[::1]/a.png", fakeNet({}, {}).deps)).toMatchObject({ ok: false, reason: "blocked_address" })
  })

  it("re-checks every redirect hop: public → name resolving to loopback is refused", async () => {
    const net = fakeNet(
      { "logo.example": PUBLIC, "sneaky.example": ["127.0.0.1"] },
      { "https://logo.example/a.png": { status: 302, headers: { location: "https://sneaky.example/a.png" } } },
    )
    const r = await fetchImageSafely("https://logo.example/a.png", net.deps)
    expect(r).toMatchObject({ ok: false, reason: "blocked_address" })
    expect(net.connections).toEqual(["https://logo.example/a.png"])
  })

  it("refuses a redirect down to http", async () => {
    const net = fakeNet({ "logo.example": PUBLIC }, { "https://logo.example/a.png": { status: 301, headers: { location: "http://logo.example/a.png" } } })
    expect(await fetchImageSafely("https://logo.example/a.png", net.deps)).toMatchObject({ ok: false, reason: "not_https" })
  })

  it("gives up after 3 redirects", async () => {
    const server: Record<string, Reply> = {}
    for (let i = 0; i < 5; i++) server[`https://logo.example/${i}`] = { status: 302, headers: { location: `/${i + 1}` } }
    expect(await fetchImageSafely("https://logo.example/0", fakeNet({ "logo.example": PUBLIC }, server).deps)).toMatchObject({ ok: false, reason: "too_many_redirects" })
  })

  it("refuses SVG by content-type", async () => {
    const { deps } = fakeNet({ "logo.example": PUBLIC }, { "https://logo.example/a.svg": { status: 200, headers: { "content-type": "image/svg+xml" }, body: SVG } })
    expect(await fetchImageSafely("https://logo.example/a.svg", deps)).toMatchObject({ ok: false, reason: "not_an_allowed_image" })
  })

  it("refuses SVG bytes served as image/png", async () => {
    const { deps } = fakeNet({ "logo.example": PUBLIC }, { "https://logo.example/a.png": { status: 200, headers: { "content-type": "image/png" }, body: SVG } })
    expect(await fetchImageSafely("https://logo.example/a.png", deps)).toMatchObject({ ok: false, reason: "not_an_allowed_image" })
  })

  it("refuses more than 2 MB — declared, and while streaming", async () => {
    const declared = fakeNet({ "logo.example": PUBLIC }, { "https://logo.example/a.png": { status: 200, headers: { "content-type": "image/png", "content-length": String(REHOST_MAX_BYTES + 1) }, body: PNG } })
    expect(await fetchImageSafely("https://logo.example/a.png", declared.deps)).toMatchObject({ ok: false, reason: "too_large" })
    const streamed = fakeNet({ "logo.example": PUBLIC }, { "https://logo.example/a.png": { status: 200, headers: { "content-type": "image/png" }, body: [PNG, Buffer.alloc(REHOST_MAX_BYTES)] } })
    expect(await fetchImageSafely("https://logo.example/a.png", streamed.deps)).toMatchObject({ ok: false, reason: "too_large" })
  })

  it("times out after 5 s", async () => {
    vi.useFakeTimers()
    const { deps } = fakeNet({ "slow.example": PUBLIC }, { "https://slow.example/a.png": { status: 200, hang: true } })
    const pending = fetchImageSafely("https://slow.example/a.png", deps)
    await vi.advanceTimersByTimeAsync(5_001)
    expect(await pending).toMatchObject({ ok: false, reason: "timeout" })
    vi.useRealTimers()
  })

  it("reports a 404 as an http error", async () => {
    expect(await fetchImageSafely("https://logo.example/missing.png", fakeNet({ "logo.example": PUBLIC }, {}).deps)).toMatchObject({ ok: false, reason: "http_error" })
  })
})

describe("rehostExternalImage", () => {
  beforeEach(() => {
    blob.put.mockReset().mockResolvedValue({})
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://oneflyer.org")
  })

  it("stores a fetched image privately under onboarding-photos/rehosted/ and returns our photo URL", async () => {
    const { deps } = fakeNet({ "logo.example": PUBLIC }, { "https://logo.example/a.webp": { status: 200, headers: { "content-type": "image/webp" }, body: WEBP } })
    const url = await rehostExternalImage("https://logo.example/a.webp", "logo", deps)
    expect(url).toMatch(/^https:\/\/oneflyer\.org\/api\/photos\/onboarding-photos\/rehosted\/logo\/[0-9a-f-]{36}\.webp$/)
    const [pathname, , opts] = blob.put.mock.calls[0]
    expect(pathname).toMatch(/^onboarding-photos\/rehosted\/logo\//)
    expect(opts).toMatchObject({ access: "private", contentType: "image/webp" })
  })

  it("returns null — never the raw URL — when the fetch fails", async () => {
    const { deps } = fakeNet({ "internal.example": ["192.168.0.10"] }, {})
    expect(await rehostExternalImage("https://internal.example/logo.png", "logo", deps)).toBeNull()
    expect(blob.put).not.toHaveBeenCalled()
  })

  it("returns null when the Blob write fails", async () => {
    blob.put.mockRejectedValue(new Error("blob down"))
    const { deps } = fakeNet({ "logo.example": PUBLIC }, { "https://logo.example/a.png": { status: 200, headers: { "content-type": "image/png" }, body: PNG } })
    expect(await rehostExternalImage("https://logo.example/a.png", "ai-photo", deps)).toBeNull()
  })

  it("keeps our own photo URLs (uploads, earlier rehosts) without refetching", async () => {
    const own = "https://ad-clarity-landing-page.vercel.app/api/photos/onboarding-photos/uuid-logo.png"
    expect(isOwnPhotoUrl(own)).toBe(true)
    expect(await rehostExternalImage(own, "logo", fakeNet({}, {}).deps)).toBe(own)
    expect(blob.put).not.toHaveBeenCalled()
    expect(isOwnPhotoUrl("https://oneflyer.org/api/admin/users")).toBe(false)
  })
})
