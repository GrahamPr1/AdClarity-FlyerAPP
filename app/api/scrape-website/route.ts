import { NextRequest, NextResponse } from "next/server"
import { getSessionIdentity, ADMIN_SUB } from "@/lib/auth"
import { scrapeSiteForIntake } from "@/lib/agent-pipeline/scrape-site"

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

  return NextResponse.json(await scrapeSiteForIntake(url, session.sub, { phone: body.phone, fullName: body.fullName }))
}
