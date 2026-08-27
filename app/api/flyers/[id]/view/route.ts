import { NextRequest, NextResponse } from "next/server"
import { getSessionIdentity, ADMIN_SUB } from "@/lib/auth"
import { getDeliverablesForEmail } from "@/lib/store"
import { ensureScrollable } from "@/lib/agent-pipeline/flyer-html"

// GET /api/flyers/[id]/view?variant=print|instagram
//
// Serves a generated flyer as a real HTML page so it can be opened in a new
// tab. This exists because the dashboard's "open in new tab" link previously
// pointed straight at the flyer's `data:text/html;base64,...` URL, which does
// not work for top-level navigation. Measured across engines
// (tests/browser/open-in-new-tab.spec.ts): Chromium refuses to open a tab at
// all (it has blocked data: navigation since v60), WebKit opens a tab that
// never renders, and Firefox leaves the navigation unsettled. None of them
// showed the flyer — they merely failed in different ways, so the link was
// silently doing nothing when clicked.
//
// A data: URL is still perfectly fine for the two things it's used for
// elsewhere — the `download` attribute, and the sandboxed preview iframe — so
// those are unchanged. Only top-level navigation needed a real URL.
//
// SECURITY: the HTML here is model-generated, and serving it from our own
// origin would otherwise let it run script with access to this origin's
// cookies (the dashboard preview deliberately renders it in a `sandbox=""`
// iframe for exactly that reason). `Content-Security-Policy: sandbox` gives
// the response the same treatment: it's dropped into an opaque origin with
// scripting disabled, so it renders and prints but cannot touch the session.
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionIdentity(request)
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await params
  const url = new URL(request.url)
  const variant = url.searchParams.get("variant") === "instagram" ? "instagram" : "print"

  // Admin has no "own" email, so it may name one — the same allowance
  // /api/deliverables/retry and /delete already make. Every other session is
  // pinned to its own email, so one client can't read another's flyer by id.
  const requestedEmail = url.searchParams.get("email")?.trim().toLowerCase()
  const email = session.sub === ADMIN_SUB ? requestedEmail : session.sub
  if (!email) {
    return NextResponse.json({ error: "Missing required parameter: email" }, { status: 422 })
  }

  const deliverables = await getDeliverablesForEmail(email)
  const flyer = deliverables.flyers.find((f) => f.id === id)
  if (!flyer) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  const dataUrl = variant === "instagram" ? flyer.repurposed?.instagramDownloadUrl : flyer.downloadUrl
  if (!dataUrl) {
    return NextResponse.json({ error: "This flyer isn't ready yet" }, { status: 409 })
  }

  const base64 = dataUrl.split("base64,")[1]
  if (!base64) {
    return NextResponse.json({ error: "Stored flyer is malformed" }, { status: 500 })
  }
  // ensureScrollable also injects print-color-adjust (see flyer-html.ts).
  // Applied on READ so every flyer already in storage prints with its
  // backgrounds intact, not just ones generated since.
  const html = ensureScrollable(Buffer.from(base64, "base64").toString("utf-8"))

  return new NextResponse(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      // Opaque origin + no script execution. Without allow-scripts, generated
      // HTML can't reach cookies, localStorage, or this origin's DOM.
      // allow-popups is omitted deliberately; the flyer has no reason to open
      // anything.
      //
      // allow-modals is present so the DASHBOARD can print this document: the
      // Print button loads it into a hidden iframe and calls print() on it,
      // and a sandbox without allow-modals blocks that dialog. It grants the
      // document itself nothing — modals need script to open, and
      // allow-scripts is still absent, so the generated HTML remains inert.
      "Content-Security-Policy": "sandbox allow-same-origin allow-modals;",
      "X-Content-Type-Options": "nosniff",
      // A flyer's content is immutable once Ready, but it's private to one
      // account, so it must never land in a shared/proxy cache.
      "Cache-Control": "private, max-age=300",
    },
  })
}
