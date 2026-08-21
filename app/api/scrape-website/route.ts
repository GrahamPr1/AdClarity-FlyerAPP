import { NextRequest, NextResponse } from "next/server"
import { getSessionIdentity, ADMIN_SUB } from "@/lib/auth"
import { crawlWebsite } from "@/lib/agent-pipeline/scraper"
import { runScrapeAgent } from "@/lib/agent-pipeline/agents/scrapeAgent"
import { mergeScrapedContact } from "@/lib/agent-pipeline/scrape-merge"

export const maxDuration = 60

interface ScrapeRequestBody {
  url?: string
  fullName?: string
  phone?: string
}

const FAILURE_MESSAGES: Record<string, string> = {
  invalid_url: "That doesn't look like a valid website address.",
  unreachable: "We couldn't reach that website.",
  blocked_by_robots: "That site doesn't allow automatic reading.",
  no_usable_content: "We couldn't find enough on that site to work with.",
  needs_clarification: "That site didn't have quite enough to go on.",
  agent_error: "Something went wrong while reading your website.",
}

// POST /api/scrape-website
// Path A of onboarding (see components/guided-setup-flow.tsx) — crawls the
// given site (lib/agent-pipeline/scraper.ts, pure code, no Claude call),
// then a Claude extraction call (lib/agent-pipeline/agents/scrapeAgent.ts)
// turns the crawled text into the same shape the Intake Agent produces.
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
  const email = session.sub

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

  const crawlResult = await crawlWebsite(url)
  if ("error" in crawlResult) {
    return NextResponse.json({ scraped: false, reason: crawlResult.error, message: FAILURE_MESSAGES[crawlResult.error] })
  }

  let extraction: Awaited<ReturnType<typeof runScrapeAgent>>
  try {
    extraction = await runScrapeAgent(
      {
        pages: crawlResult.pages,
        socialLinks: crawlResult.socialLinks,
        // The client typed these on the Path A form — give them to the agent
        // so it never blocks asking for a phone it can't find on the site.
        providedPhone: body.phone?.trim() ?? "",
        providedContactName: body.fullName?.trim() ?? "",
      },
      email,
    )
  } catch (err) {
    console.error("[scrape-agent] Extraction call failed:", err instanceof Error ? err.message : err)
    return NextResponse.json({ scraped: false, reason: "agent_error", message: FAILURE_MESSAGES.agent_error })
  }

  if (extraction.status === "needs_clarification" || !extraction.data) {
    return NextResponse.json({ scraped: false, reason: "needs_clarification", message: FAILURE_MESSAGES.needs_clarification })
  }

  // Precedence rules live in one tested place — see mergeScrapedContact.
  const normalizedIntake = mergeScrapedContact(
    extraction.data,
    { logoUrl: crawlResult.logoUrl, colors: crawlResult.colors },
    { phone: body.phone, fullName: body.fullName },
  )

  return NextResponse.json({ scraped: true, normalizedIntake, businessCategoryGuess: extraction.businessCategoryGuess })
}
