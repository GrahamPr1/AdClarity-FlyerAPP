import { describe, it, expect } from "vitest"
// Next's own route compiler: the same function that writes the redirect regex
// into routes-manifest.json, which is what Vercel serves from. Testing
// against it (rather than a regex of our own) is the point of this file.
import { buildCustomRoute } from "next/dist/lib/build-custom-route"
import type { Redirect } from "next/dist/lib/load-custom-routes"
import { legacyHostRedirects, LEGACY_HOST, CANONICAL_ORIGIN, LEGACY_PASSTHROUGH_PREFIXES } from "../legacy-redirects.mjs"
import nextConfig from "../next.config.mjs"
import { LEGACY_SITE_HOSTS } from "@/lib/site-url"

const compiled = (legacyHostRedirects() as Redirect[]).map((r) => ({
  // Next restricts redirects from /_next by default; pass the same list a build does.
  ...(buildCustomRoute("redirect", r, ["/_next"]) as unknown as { regex: string; statusCode: number }),
  route: r,
}))

/** Where a request to the legacy host ends up: a redirect target, or null if served there. */
function resolve(pathWithQuery: string, host = LEGACY_HOST): { status: number; location: string } | null {
  const [pathname, query] = pathWithQuery.split("?")
  for (const c of compiled) {
    const hostOk = (c.route.has ?? []).every((h) => h.type !== "host" || new RegExp(`^${h.value}$`).test(host))
    const m = hostOk && new RegExp(c.regex, "i").exec(pathname)
    if (!m) continue
    const location = c.route.destination.replace(":path", m.groups?.path ?? m[1] ?? "")
    return { status: c.statusCode, location: query ? `${location}?${query}` : location }
  }
  return null
}

describe("legacy-domain redirects", () => {
  it("serve QR scans, every API path and the scan page's assets on the old host", () => {
    for (const path of [
      "/r/abc123",
      "/r/AbC_9-x?utm_source=qr",
      "/R/abc123", // matching is case-insensitive; a hand-typed code must not be redirected
      "/api/tracking/click/abc123",
      "/api/tracking/scan/abc123",
      "/api/photos/onboarding-photos/rehosted/logo/x.png",
      "/api/onboarding/material/onboarding-materials/x.pdf",
      "/api/stripe/webhook",
      "/_next/static/chunks/app.js",
      "/_next/static/media/font.woff2",
      "/_vercel/insights/view",
    ]) {
      expect(resolve(path), path).toBeNull()
    }
  })

  it("permanently redirect pages to the canonical domain, keeping path and query", () => {
    expect(resolve("/")).toEqual({ status: 308, location: `${CANONICAL_ORIGIN}/` })
    expect(resolve("/pricing")).toEqual({ status: 308, location: `${CANONICAL_ORIGIN}/pricing` })
    expect(resolve("/dashboard/flyers/123")).toEqual({ status: 308, location: `${CANONICAL_ORIGIN}/dashboard/flyers/123` })
    expect(resolve("/reset-password?token=abc")).toEqual({ status: 308, location: `${CANONICAL_ORIGIN}/reset-password?token=abc` })
    // Only the exact prefixes pass through: these merely start with the same letters.
    expect(resolve("/robots.txt")?.location).toBe(`${CANONICAL_ORIGIN}/robots.txt`)
    expect(resolve("/r")?.location).toBe(`${CANONICAL_ORIGIN}/r`)
    expect(resolve("/apis")?.location).toBe(`${CANONICAL_ORIGIN}/apis`)
  })

  it("never fire on any other host", () => {
    for (const host of ["oneflyer.org", "www.oneflyer.org", "oneflyer-git-x-grahampr1s-projects.vercel.app", "localhost", "ad-clarity-landing-page-vercel.app"]) {
      expect(resolve("/pricing", host), host).toBeNull()
      expect(resolve("/", host), host).toBeNull()
    }
  })

  it("are the first rules in next.config, and name the host lib/site-url calls legacy", async () => {
    const all = (await nextConfig.redirects!()) as Redirect[]
    expect(all.slice(0, compiled.length)).toEqual(legacyHostRedirects())
    expect(LEGACY_SITE_HOSTS).toContain(LEGACY_HOST)
    expect(LEGACY_PASSTHROUGH_PREFIXES).toEqual(expect.arrayContaining(["r/", "api/", "_next/"]))
  })
})
