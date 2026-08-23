import { describe, it, expect, beforeAll, afterAll } from "vitest"
import http from "node:http"
import type { AddressInfo } from "node:net"
import { crawlWebsite } from "@/lib/agent-pipeline/scraper"

/**
 * The website inspector has to work on SMALL sites — a one-page site with a
 * name and a phone number is the single most common shape among the trades
 * this product sells to. It previously rejected them: it read only <body>
 * text and dropped any page under 40 characters, so a business card site and
 * an image-led site both came back "no_usable_content" and the customer hit a
 * dead end on their first screen.
 */

const SITES: Record<string, string> = {
  card: `<html><head><title>Joe Plumbing</title></head>
    <body><h1>Joe Plumbing</h1><p>(555) 111-2222</p></body></html>`,

  metaOnly: `<html><head>
    <title>Cedar Creek Roofing — Free Estimates — Austin TX</title>
    <meta name="description" content="Roof repair and replacement in Austin. Call (512) 555-0100.">
    </head><body><img src="/hero.jpg" alt="Cedar Creek Roofing"></body></html>`,

  blocks: `<html><head><title>Miller Heating &amp; Air</title></head>
    <body><h1>Miller Heating &amp; Air</h1><p>Call (555) 123-4567.</p>
    <address>412 Oak St, Denver CO</address></body></html>`,

  empty: `<html><head></head><body></body></html>`,

  withThinSubpage: `<html><head><title>Bright Lawn Care</title></head>
    <body><h1>Bright Lawn Care</h1><p>Weekly mowing and cleanup across Boulder County. Call (303) 555-7788.</p>
    <a href="/services">Services</a></body></html>`,
}

let origin: string
let server: http.Server

beforeAll(async () => {
  server = http.createServer((req, res) => {
    if (req.url === "/robots.txt") return void res.writeHead(404).end()
    // A deliberately near-empty sub-page: should be skipped as noise without
    // affecting the homepage's acceptance.
    if (req.url?.startsWith("/services")) {
      res.writeHead(200, { "Content-Type": "text/html" })
      return void res.end("<html><body><p>Soon</p></body></html>")
    }
    const key = decodeURIComponent((req.url ?? "").split("?site=")[1] ?? "")
    res.writeHead(200, { "Content-Type": "text/html" })
    res.end(SITES[key] ?? "<html><body>?</body></html>")
  })
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()))
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterAll(async () => {
  await new Promise<void>((r) => server.close(() => r()))
})

const crawl = (site: string) => crawlWebsite(`${origin}/?site=${site}`)

describe("website inspector on small sites", () => {
  it("accepts a one-page business card and keeps the name and phone", async () => {
    const result = await crawl("card")
    expect(result).not.toHaveProperty("error")
    if ("error" in result) return
    expect(result.pages).toHaveLength(1)
    expect(result.pages[0].text).toContain("Joe Plumbing")
    expect(result.pages[0].text).toContain("(555) 111-2222")
  })

  it("reads a site whose content lives in the title and meta description", async () => {
    const result = await crawl("metaOnly")
    expect(result).not.toHaveProperty("error")
    if ("error" in result) return
    const text = result.pages[0].text
    expect(text).toContain("Cedar Creek Roofing")
    expect(text).toContain("Austin")
    expect(text).toContain("(512) 555-0100")
  })

  it("separates adjacent block elements instead of welding words together", async () => {
    const result = await crawl("blocks")
    expect(result).not.toHaveProperty("error")
    if ("error" in result) return
    const text = result.pages[0].text
    // The bug this guards: "...Miller Heating & AirCall (555) 123-4567"
    expect(text).not.toMatch(/AirCall/)
    expect(text).toContain("Air Call")
    expect(text).toContain("412 Oak St, Denver CO")
  })

  it("still reports genuinely empty pages rather than inventing content", async () => {
    const result = await crawl("empty")
    expect(result).toEqual({ error: "no_usable_content" })
  })

  it("keeps a short homepage but skips a near-empty sub-page", async () => {
    const result = await crawl("withThinSubpage")
    expect(result).not.toHaveProperty("error")
    if ("error" in result) return
    expect(result.pages).toHaveLength(1)
    expect(result.pages[0].text).toContain("Bright Lawn Care")
  })
})
