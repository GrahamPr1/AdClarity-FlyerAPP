import { lookup as dnsLookup, type LookupAddress } from "node:dns"
import https from "node:https"
import type { IncomingMessage, ClientRequest, RequestOptions } from "node:http"
import { isIP } from "node:net"
import { put } from "@vercel/blob"
import { ownSiteHosts, photoUrl } from "./site-url"

// ---------------------------------------------------------------------------
// Rehosting external images into our own Blob store.
//
// A logo a client submits by URL, a logo scraped from their website, and an
// AI photo from Higgsfield all used to be referenced at their ORIGINAL URL in
// generated documents — so the document depended on a third-party host
// forever, and the PDF renderer had to be allowed to fetch it. Instead, the
// image is fetched once, server-side, under strict guardrails, stored in
// Blob, and the document references OUR copy (the same private-Blob-behind-
// /api/photos pattern uploads use).
//
// Guardrails (all enforced here, on every hop):
//   - https only; at most 3 redirects, each re-checked from scratch
//   - the connection's own DNS lookup refuses private, loopback, link-local,
//     CGNAT, multicast and reserved addresses — checked at CONNECT time, so a
//     name can't pass the check and then connect somewhere else
//   - png / jpeg / webp only, by Content-Type AND by the file's magic bytes
//     (no SVG — it can carry script)
//   - 2 MB max, enforced while streaming
//   - 5 s total, redirects included
// Any failure returns null: callers then store NO image, never the raw URL.
// ---------------------------------------------------------------------------

export const REHOST_MAX_BYTES = 2 * 1024 * 1024
export const REHOST_TIMEOUT_MS = 5_000
const MAX_REDIRECTS = 3
const PHOTO_PREFIX = "onboarding-photos/" // the only prefix /api/photos will serve

export type ImageKind = "png" | "jpeg" | "webp"
const CONTENT_TYPES: Record<ImageKind, string> = { png: "image/png", jpeg: "image/jpeg", webp: "image/webp" }

// ---- Address policy ---------------------------------------------------------

function ipv4ToInt(ip: string): number {
  return ip.split(".").reduce((n, octet) => (n << 8) + Number(octet), 0) >>> 0
}
const V4_BLOCKED: [string, number][] = [
  ["0.0.0.0", 8], // "this network"
  ["10.0.0.0", 8], // private
  ["100.64.0.0", 10], // carrier-grade NAT
  ["127.0.0.0", 8], // loopback
  ["169.254.0.0", 16], // link-local (incl. cloud metadata 169.254.169.254)
  ["172.16.0.0", 12], // private
  ["192.0.0.0", 24], // IETF protocol assignments
  ["192.0.2.0", 24], // documentation
  ["192.168.0.0", 16], // private
  ["198.18.0.0", 15], // benchmarking
  ["198.51.100.0", 24], // documentation
  ["203.0.113.0", 24], // documentation
  ["224.0.0.0", 4], // multicast
  ["240.0.0.0", 4], // reserved + broadcast
]

/** True for any address a server-side fetch must never connect to. */
export function isBlockedAddress(address: string): boolean {
  const family = isIP(address)
  if (family === 4) {
    const n = ipv4ToInt(address)
    return V4_BLOCKED.some(([base, bits]) => (n >>> (32 - bits)) === (ipv4ToInt(base) >>> (32 - bits)))
  }
  if (family === 6) {
    const a = address.toLowerCase()
    if (a === "::" || a === "::1") return true
    const mapped = a.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/) // IPv4-mapped
    if (mapped) return isBlockedAddress(mapped[1])
    if (/^::ffff:/.test(a)) return true // hex-form mapped: refuse rather than parse
    if (/^64:ff9b:/.test(a)) return true // NAT64 — could reach an internal v4
    const first = parseInt(a.split(":")[0] || "0", 16)
    if ((first & 0xfe00) === 0xfc00) return true // fc00::/7 unique local
    if ((first & 0xffc0) === 0xfe80) return true // fe80::/10 link-local
    if ((first & 0xff00) === 0xff00) return true // ff00::/8 multicast
    if (a.startsWith("2001:db8:") || a.startsWith("2001:0db8:")) return true // documentation
    return false
  }
  return true // not an IP at all
}

type LookupFn = (hostname: string, options: { all: true }, cb: (err: NodeJS.ErrnoException | null, addresses: LookupAddress[]) => void) => void

/**
 * A `lookup` for https.request that refuses unsafe answers. ALL addresses a
 * name resolves to must be public — a mix (one public, one internal) is
 * refused, since the socket could pick either.
 */
export function guardedLookup(resolve: LookupFn = dnsLookup as unknown as LookupFn) {
  return (hostname: string, options: unknown, cb: (err: Error | null, address?: string | LookupAddress[], family?: number) => void) => {
    resolve(hostname, { all: true }, (err, addresses) => {
      if (err) return cb(err)
      if (!addresses?.length) return cb(new Error(`no addresses for ${hostname}`))
      const bad = addresses.find((a) => isBlockedAddress(a.address))
      if (bad) return cb(new Error(`refusing ${hostname}: resolves to a non-public address`))
      const wantAll = typeof options === "object" && options !== null && (options as { all?: boolean }).all
      if (wantAll) return cb(null, addresses)
      cb(null, addresses[0].address, addresses[0].family)
    })
  }
}

// ---- Content checks ---------------------------------------------------------

/** The image type from the file's own first bytes — never from the URL or the header alone. */
export function sniffImageType(buf: Buffer): ImageKind | null {
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png"
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpeg"
  if (buf.length >= 12 && buf.subarray(0, 4).toString("latin1") === "RIFF" && buf.subarray(8, 12).toString("latin1") === "WEBP") return "webp"
  return null
}

function headerType(contentType: string | undefined): ImageKind | null {
  const t = (contentType ?? "").split(";")[0].trim().toLowerCase()
  if (t === "image/png") return "png"
  if (t === "image/jpeg" || t === "image/jpg") return "jpeg"
  if (t === "image/webp") return "webp"
  return null
}

// ---- The fetch ----------------------------------------------------------------

export type FetchFailure =
  | "not_https"
  | "blocked_address"
  | "too_many_redirects"
  | "http_error"
  | "not_an_allowed_image"
  | "too_large"
  | "timeout"
  | "network_error"

export type FetchResult = { ok: true; bytes: Buffer; kind: ImageKind } | { ok: false; reason: FetchFailure; detail: string }

type RequestFn = (url: URL, options: RequestOptions, cb: (res: IncomingMessage) => void) => ClientRequest

export interface FetchDeps {
  request?: RequestFn
  lookup?: LookupFn
  now?: () => number
}

/** Fetches one image under every guardrail above. Never throws. */
export async function fetchImageSafely(rawUrl: string, deps: FetchDeps = {}): Promise<FetchResult> {
  const request: RequestFn = deps.request ?? ((url, options, cb) => https.request(url, options, cb))
  const lookup = guardedLookup(deps.lookup)
  const now = deps.now ?? Date.now
  const deadline = now() + REHOST_TIMEOUT_MS

  let current: URL
  try {
    current = new URL(rawUrl)
  } catch {
    return { ok: false, reason: "not_https", detail: "unparseable URL" }
  }

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (current.protocol !== "https:") return { ok: false, reason: "not_https", detail: `${current.protocol} is not allowed` }
    if (current.username || current.password) return { ok: false, reason: "not_https", detail: "credentials in URL" }
    // A literal IP skips DNS entirely, so check it here too.
    const literal = current.hostname.replace(/^\[|\]$/g, "")
    if (isIP(literal) && isBlockedAddress(literal)) return { ok: false, reason: "blocked_address", detail: "literal non-public IP" }

    const remaining = deadline - now()
    if (remaining <= 0) return { ok: false, reason: "timeout", detail: "5 s budget spent" }

    const hopResult = await new Promise<
      { kind: "redirect"; location: string } | { kind: "done"; result: FetchResult }
    >((resolve) => {
      let settled = false
      const finish = (v: { kind: "redirect"; location: string } | { kind: "done"; result: FetchResult }) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        resolve(v)
      }
      const req = request(
        current,
        {
          method: "GET",
          lookup: lookup as unknown as RequestOptions["lookup"],
          headers: { "user-agent": "OneFlyer-ImageFetcher/1.0", accept: "image/png,image/jpeg,image/webp" },
        },
        (res) => {
          const status = res.statusCode ?? 0
          if (status >= 300 && status < 400 && res.headers.location) {
            res.resume()
            return finish({ kind: "redirect", location: res.headers.location })
          }
          if (status !== 200) {
            res.resume()
            return finish({ kind: "done", result: { ok: false, reason: "http_error", detail: `HTTP ${status}` } })
          }
          const declared = headerType(res.headers["content-type"])
          if (!declared) {
            res.resume()
            return finish({ kind: "done", result: { ok: false, reason: "not_an_allowed_image", detail: `content-type ${res.headers["content-type"] ?? "missing"}` } })
          }
          const length = Number(res.headers["content-length"] ?? 0)
          if (length > REHOST_MAX_BYTES) {
            res.destroy()
            return finish({ kind: "done", result: { ok: false, reason: "too_large", detail: `${length} bytes declared` } })
          }
          const chunks: Buffer[] = []
          let size = 0
          res.on("data", (chunk: Buffer) => {
            size += chunk.length
            if (size > REHOST_MAX_BYTES) {
              res.destroy()
              finish({ kind: "done", result: { ok: false, reason: "too_large", detail: "over 2 MB while streaming" } })
              return
            }
            chunks.push(chunk)
          })
          res.on("end", () => {
            const bytes = Buffer.concat(chunks)
            const kind = sniffImageType(bytes)
            if (!kind || kind !== declared) {
              return finish({ kind: "done", result: { ok: false, reason: "not_an_allowed_image", detail: `bytes are ${kind ?? "not png/jpeg/webp"}` } })
            }
            finish({ kind: "done", result: { ok: true, bytes, kind } })
          })
          res.on("error", (e) => finish({ kind: "done", result: { ok: false, reason: "network_error", detail: e.message } }))
        },
      )
      const timer = setTimeout(() => {
        req.destroy()
        finish({ kind: "done", result: { ok: false, reason: "timeout", detail: "5 s budget spent" } })
      }, remaining)
      req.on("error", (e) => {
        const blocked = /non-public address/.test(e.message)
        finish({ kind: "done", result: { ok: false, reason: blocked ? "blocked_address" : "network_error", detail: e.message } })
      })
      req.end()
    })

    if (hopResult.kind === "done") return hopResult.result
    if (hop === MAX_REDIRECTS) return { ok: false, reason: "too_many_redirects", detail: `more than ${MAX_REDIRECTS}` }
    try {
      current = new URL(hopResult.location, current)
    } catch {
      return { ok: false, reason: "http_error", detail: "bad redirect location" }
    }
  }
  return { ok: false, reason: "too_many_redirects", detail: `more than ${MAX_REDIRECTS}` }
}

// ---- Rehosting ----------------------------------------------------------------

/** True when the URL already points at our photo route (an upload or an earlier rehost). */
export function isOwnPhotoUrl(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl)
    return ownSiteHosts().includes(url.host) && url.pathname.startsWith(`/api/photos/${PHOTO_PREFIX}`)
  } catch {
    return false
  }
}

export type RehostPurpose = "logo" | "ai-photo"

/**
 * Returns an /api/photos URL for our own Blob copy of the image, or null if it
 * couldn't be fetched safely. Never returns the original external URL.
 */
export async function rehostExternalImage(rawUrl: string | null | undefined, purpose: RehostPurpose, deps?: FetchDeps): Promise<string | null> {
  if (!rawUrl) return null
  if (isOwnPhotoUrl(rawUrl)) return new URL(rawUrl).href
  const fetched = await fetchImageSafely(rawUrl, deps)
  if (!fetched.ok) {
    let host = "(unparseable)"
    try {
      host = new URL(rawUrl).host
    } catch {}
    console.warn(`[rehost] ${purpose} from ${host} not stored: ${fetched.reason} (${fetched.detail})`)
    return null
  }
  const pathname = `${PHOTO_PREFIX}rehosted/${purpose}/${crypto.randomUUID()}.${fetched.kind === "jpeg" ? "jpg" : fetched.kind}`
  try {
    await put(pathname, fetched.bytes, { access: "private", contentType: CONTENT_TYPES[fetched.kind], addRandomSuffix: false })
  } catch (err) {
    console.error(`[rehost] ${purpose}: Blob write failed:`, err instanceof Error ? err.message : err)
    return null
  }
  return photoUrl(pathname)
}
