import { NextRequest, NextResponse } from "next/server"
import { getSessionIdentity, ADMIN_SUB } from "@/lib/auth"
import { getDeliverablesForEmail } from "@/lib/store"
import { ensureScrollable } from "@/lib/agent-pipeline/flyer-html"
import { renderFlyerPdf } from "@/lib/pdf/flyer-pdf"

/**
 * GET /api/flyers/[id]/pdf?variant=print|instagram
 *
 * The finished marketing asset as a print-ready PDF and nothing else — no
 * navigation, no editor chrome, no debugging artifacts. That is structural
 * rather than something this route has to strip: what gets rendered is the
 * flyer's own stored document, which has never contained any of them.
 *
 * Authorisation is a copy of ../view/route.ts deliberately: same ownership
 * rule, same admin allowance, same 404 for a flyer id belonging to another
 * account. A PDF of someone else's flyer is the same leak as an HTML view
 * of it, so the two must not be able to drift apart.
 */

// Chromium cold start plus a render. Measured well under this, but a cold
// container on a slow region should not turn into a failed download.
export const maxDuration = 60
export const dynamic = "force-dynamic"

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionIdentity(request)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const url = new URL(request.url)
  const variant = url.searchParams.get("variant") === "instagram" ? "instagram" : "print"

  const requestedEmail = url.searchParams.get("email")?.trim().toLowerCase()
  const email = session.sub === ADMIN_SUB ? requestedEmail : session.sub
  if (!email) return NextResponse.json({ error: "Missing required parameter: email" }, { status: 422 })

  const deliverables = await getDeliverablesForEmail(email)
  const flyer = deliverables.flyers.find((f) => f.id === id)
  if (!flyer) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const dataUrl = variant === "instagram" ? flyer.repurposed?.instagramDownloadUrl : flyer.downloadUrl
  if (!dataUrl) return NextResponse.json({ error: "This flyer isn't ready yet" }, { status: 409 })

  const base64 = dataUrl.split("base64,")[1]
  if (!base64) return NextResponse.json({ error: "Stored flyer is malformed" }, { status: 500 })

  // Same ensureScrollable() the view route applies on read, so the PDF is a
  // render of exactly what the client sees rather than a near-copy. It also
  // injects print-color-adjust, without which Chromium drops the flyer's
  // background fills.
  const html = ensureScrollable(Buffer.from(base64, "base64").toString("utf-8"))

  let rendered
  try {
    rendered = await renderFlyerPdf(html)
  } catch (err) {
    console.error(`[pdf] render failed for flyer ${id}`, err)
    return NextResponse.json({ error: "We couldn't build the PDF. Please try again." }, { status: 500 })
  }
  console.log(`[pdf] flyer ${id} (${variant}) rendered in ${rendered.ms}ms, ${rendered.pdf.length} bytes`)

  return new NextResponse(new Uint8Array(rendered.pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename(flyer.title, variant)}"`,
      "Content-Length": String(rendered.pdf.length),
      "X-Content-Type-Options": "nosniff",
      // Private to one account, so never a shared cache. Short-lived rather
      // than immutable because a direct edit rewrites the flyer in place.
      "Cache-Control": "private, no-store",
    },
  })
}

/** A filename a client can find later, not a uuid. */
function filename(title: string | undefined, variant: string): string {
  const stem =
    (title ?? "flyer")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "flyer"
  return variant === "instagram" ? `${stem}-instagram.pdf` : `${stem}.pdf`
}
