import { NextRequest, NextResponse } from "next/server"
import { getSessionIdentity, ADMIN_SUB } from "@/lib/auth"
import { scrapeSiteForIntake } from "@/lib/agent-pipeline/scrape-site"
import { normalizeWebsiteUrl } from "@/lib/url-normalize"

export const maxDuration = 60

interface ScrapeRequestBody {
  url?: string
  fullName?: string
  phone?: string
}

// POST /api/scrape-website
// Path A of onboarding (see components/guided-setup-flow.tsx). The actual
// work — crawl, extract, merge — lives in lib/agent-pipeline/scrape-site.ts
// so Quick Prompt can personalise from a website through the same code path
// rather than a second copy that drifts.
//
// Every failure mode (unreachable, robots-blocked, thin content, or the
// extraction call itself erroring) returns the SAME graceful shape —
// { scraped: false, reason, message } — never a 4xx/5xx for something
// that's an expected, designed-for outcome per the spec: the client always
// falls back to the full manual flow (Path B), never a dead end.
export async function POST(request: NextRequest) {
  const session = await getSessionIdentity(request)
  if (!session || session.sub === ADMIN_SUB) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let body: ScrapeRequestBody
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const url = body.url?.trim()
  if (!url) {
    return NextResponse.json({ error: "Missing required field: url" }, { status: 422 })
  }

  // This is the trust boundary, so the strict policy applies here rather
  // than inside the crawler: free text, email addresses, non-http schemes
  // and private/loopback hosts are refused before any fetch is attempted.
  // Returned in the same graceful { scraped: false } shape the rest of this
  // route uses, so the client still falls back to the manual flow.
  const normalized = normalizeWebsiteUrl(url)
  if (!normalized.ok) {
    return NextResponse.json({ scraped: false, reason: "invalid_url", message: normalized.message })
  }

  return NextResponse.json(
    await scrapeSiteForIntake(normalized.url, session.sub, { phone: body.phone, fullName: body.fullName }),
  )
}
