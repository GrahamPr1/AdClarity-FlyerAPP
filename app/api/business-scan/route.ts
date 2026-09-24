import { NextRequest } from "next/server"
import { getSessionIdentity, ADMIN_SUB } from "@/lib/auth"
import { checkRateLimit } from "@/lib/rate-limit"
import { normalizeWebsiteUrl } from "@/lib/url-normalize"
import { scrapeSiteForIntake, SCRAPE_FAILURE_MESSAGES } from "@/lib/agent-pipeline/scrape-site"
import { persistBusinessProfile } from "@/lib/business-profile-resolve"
import { setClientBusinessName } from "@/lib/store"
import type { ScanEvent } from "@/lib/scan-events"

/**
 * Scans a business's website and saves a Business Profile.
 *
 * Streams NDJSON so the AI Control Center can show what is ACTUALLY
 * happening. Every event on this stream is emitted after the operation it
 * describes has really completed — there is no timer, no interpolation and
 * no optimistic "probably done by now". If the crawl finds three pages, three
 * page_read events are emitted; if the logo search finds nothing, the
 * logo step reports that it found nothing rather than showing a tick.
 *
 * A single POST that returned everything at once would have been less code,
 * but the product requirement is explicitly that the progress UI corresponds
 * to real operations, and the only honest way to show progress during a
 * 15-30s job is to emit it as it happens.
 *
 * Node runtime (not edge): the crawler uses cheerio and the Anthropic SDK.
 */
export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 120

// A website scan is one crawl of up to 6 pages plus a Claude call. Six per
// hour per account is generous for someone correcting a typo in their URL
// and low enough that this cannot be used to crawl the web on our budget.
const MAX_SCANS = 6
const WINDOW_SECONDS = 3600

export async function POST(req: NextRequest) {
  const session = await getSessionIdentity({ cookies: req.cookies })
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }
  // The admin session has no business of its own to scan — it is the site
  // owner, not a client — and letting it through would write a profile under
  // the literal email "admin".
  if (session.sub === ADMIN_SUB) {
    return Response.json({ error: "Not available for the admin account" }, { status: 403 })
  }
  const email = session.sub

  let body: { url?: unknown }
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 })
  }

  const raw = typeof body.url === "string" ? body.url : ""
  const normalized = normalizeWebsiteUrl(raw)
  if (!normalized.ok) {
    // Validation failures answer as plain JSON rather than opening a stream:
    // there is nothing to report progress about.
    return Response.json({ error: normalized.message, reason: normalized.reason }, { status: 400 })
  }

  const { allowed, retryAfterSeconds } = await checkRateLimit(
    `business-scan:${email}`,
    MAX_SCANS,
    WINDOW_SECONDS,
  )
  if (!allowed) {
    return Response.json(
      { error: "You've run several scans recently — please wait a few minutes." },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } },
    )
  }

  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      // The stream is closed in exactly one place, at the end. An earlier
      // version closed it in the failure branch AND in `finally`, which threw
      // "Invalid state: Controller is already closed" and turned a handled
      // scrape failure into a 500 that killed the connection mid-stream.
      let closed = false
      const send = (event: ScanEvent) => {
        if (closed) return
        controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"))
      }

      try {
        send({ type: "step", id: "connect", status: "running", label: "Connecting to website" })

        let pagesRead = 0
        const result = await scrapeSiteForIntake(normalized.url, email, {}, (p) => {
          // Real crawler callbacks. Each maps to something that has happened.
          if (p.step === "connected") {
            send({ type: "step", id: "connect", status: "done", label: "Connected", detail: normalized.host })
            send({ type: "step", id: "pages", status: "running", label: "Discovering pages" })
          }
          if (p.step === "page_read") {
            pagesRead = p.total
            send({ type: "step", id: "pages", status: "running", label: "Reading pages", detail: `${p.total} read` })
          }
          if (p.step === "logo_found") {
            send({
              type: "step",
              id: "logo",
              status: p.url ? "done" : "skipped",
              label: p.url ? "Logo detected" : "No logo found",
              detail: p.url ?? "we'll ask you for one",
            })
          }
          if (p.step === "colors_found") {
            send({
              type: "step",
              id: "colors",
              status: p.count > 0 ? "done" : "skipped",
              label: p.count > 0 ? "Brand colors detected" : "No brand colors found",
              detail: p.count > 0 ? `${p.count} found` : "we'll use your own",
            })
          }
        })

        if (!result.scraped) {
          send({ type: "step", id: "pages", status: "failed", label: "Couldn't read the website", detail: result.message })
          send({ type: "error", reason: result.reason, message: result.message })
          return
        }

        send({ type: "step", id: "pages", status: "done", label: "Pages read", detail: `${pagesRead} page${pagesRead === 1 ? "" : "s"}` })
        send({ type: "step", id: "extract", status: "done", label: "Business information read" })

        const p = result.profile
        send({
          type: "step",
          id: "services",
          status: p.services.length > 0 ? "done" : "skipped",
          label: p.services.length > 0 ? "Services identified" : "No services found",
          detail: p.services.length > 0 ? `${p.services.length} found` : undefined,
        })
        send({
          type: "step",
          id: "contact",
          status: p.contact.phone || p.contact.address ? "done" : "skipped",
          label: p.contact.phone || p.contact.address ? "Contact information found" : "No contact details found",
          detail: p.contact.phone ?? undefined,
        })

        send({ type: "step", id: "save", status: "running", label: "Saving business profile" })
        await persistBusinessProfile(email, p)
        // Keep the flat ClientRecord name in step with the profile so the
        // admin list and anything else reading it don't go stale.
        if (p.businessName) await setClientBusinessName(email, p.businessName)
        send({ type: "step", id: "save", status: "done", label: "Business profile saved" })

        send({ type: "complete", profile: p, scannedPages: result.scannedPages, logoReason: result.logoReason })
      } catch (err) {
        console.error("[business-scan] failed:", err instanceof Error ? err.message : err)
        send({
          type: "error",
          reason: "agent_error",
          message: SCRAPE_FAILURE_MESSAGES.agent_error,
        })
      } finally {
        closed = true
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      // Without this some proxies buffer the whole response and the live
      // progress arrives all at once at the end, defeating the point.
      "X-Accel-Buffering": "no",
    },
  })
}
