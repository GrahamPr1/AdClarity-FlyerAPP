import { NextRequest, NextResponse } from "next/server"
import { getSessionIdentity, ADMIN_SUB } from "@/lib/auth"
import {
  getDeliverablesForEmail,
  updateDeliverable,
  savePreEditSnapshot,
  getPreEditSnapshot,
  clearPreEditSnapshot,
} from "@/lib/store"
import { syncOfferPage } from "@/lib/agent-pipeline/offer-page-sync"
import { applyFieldEdits, readEditableFields, supportsDirectEdit } from "@/lib/agent-pipeline/flyer-edit"
import { decodeFlyerHtml, encodeFlyerHtml } from "@/lib/flyer-data-url"

/**
 * Direct field editing of ONE generated flyer.
 *
 * GET   — the editable fields and their current values, or notSupported for
 *         a flyer generated before the markers existed.
 * PATCH — apply text edits, after snapshotting the current HTML for undo.
 * POST  — revert to that snapshot ("?action=revert").
 *
 * Scoped to the caller's own flyers throughout: every read and write goes
 * through getDeliverablesForEmail(session.sub), so a flyer id belonging to
 * another account is simply not found.
 */
export const dynamic = "force-dynamic"

const instagramSnapshotId = (flyerId: string) => `${flyerId}:instagram`


async function loadOwnFlyer(req: NextRequest, id: string) {
  const session = await getSessionIdentity({ cookies: req.cookies })
  if (!session) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }
  if (session.sub === ADMIN_SUB) {
    return { error: NextResponse.json({ error: "Not available for the admin account" }, { status: 403 }) }
  }
  const deliverables = await getDeliverablesForEmail(session.sub)
  const flyer = deliverables.flyers.find((f) => f.id === id)
  if (!flyer) return { error: NextResponse.json({ error: "Flyer not found" }, { status: 404 }) }
  return { email: session.sub, flyer }
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const loaded = await loadOwnFlyer(req, id)
  if ("error" in loaded) return loaded.error
  const { flyer } = loaded

  const html = flyer.downloadUrl ? decodeFlyerHtml(flyer.downloadUrl) : null
  if (!html) {
    return NextResponse.json({ notSupported: true, reason: "no_html", fields: [] })
  }
  if (!supportsDirectEdit(html)) {
    // Generated before the markers existed. Honest "no" rather than an
    // editor whose saves would silently do nothing.
    return NextResponse.json({ notSupported: true, reason: "pre_marker", fields: [] })
  }

  return NextResponse.json(
    {
      notSupported: false,
      fields: readEditableFields(html),
      canRevert: (await getPreEditSnapshot(id)) !== null,
    },
    { headers: { "Cache-Control": "no-store" } },
  )
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const loaded = await loadOwnFlyer(req, id)
  if ("error" in loaded) return loaded.error
  const { email, flyer } = loaded

  let body: { fields?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
  }
  const edits = body.fields
  if (!edits || typeof edits !== "object" || Array.isArray(edits)) {
    return NextResponse.json({ error: "Nothing to change." }, { status: 400 })
  }
  const clean: Record<string, string> = {}
  for (const [k, v] of Object.entries(edits as Record<string, unknown>)) {
    if (typeof v === "string") clean[k] = v.slice(0, 2000)
  }

  const html = flyer.downloadUrl ? decodeFlyerHtml(flyer.downloadUrl) : null
  if (!html) return NextResponse.json({ error: "This flyer has no editable content." }, { status: 400 })
  if (!supportsDirectEdit(html)) {
    return NextResponse.json({ error: "This flyer was made before direct editing — use Refine instead." }, { status: 409 })
  }

  const result = applyFieldEdits(html, clean)
  // The square Instagram version is a second document with the same fields
  // (template flyers) — edit it too, or "open full size" on it, and the
  // Instagram PDF, keep showing the old text.
  const instagramHtml = flyer.repurposed?.instagramDownloadUrl ? decodeFlyerHtml(flyer.repurposed.instagramDownloadUrl) : null
  const instagram = instagramHtml && supportsDirectEdit(instagramHtml) ? applyFieldEdits(instagramHtml, clean) : null
  const instagramChanged = !!instagram && instagram.applied.length > 0

  // Nothing applied: report why and change nothing. Snapshotting here would
  // overwrite a real undo point with an identical copy.
  if (result.applied.length === 0) {
    return NextResponse.json({ ok: false, applied: [], rejected: result.rejected }, { status: 422 })
  }

  // Snapshot BEFORE writing, so the undo target is the pre-edit document.
  // The Instagram snapshot is cleared when this edit doesn't touch it, so an
  // undo can never restore an older Instagram copy than the one showing.
  await savePreEditSnapshot(id, flyer.downloadUrl!)
  if (instagramChanged) await savePreEditSnapshot(instagramSnapshotId(id), flyer.repurposed!.instagramDownloadUrl!)
  else await clearPreEditSnapshot(instagramSnapshotId(id))
  await updateDeliverable(email, {
    type: "flyer",
    id,
    downloadUrl: encodeFlyerHtml(result.html),
    ...(instagramChanged ? { repurposed: { ...flyer.repurposed!, instagramDownloadUrl: encodeFlyerHtml(instagram!.html) } } : {}),
  })
  await syncOfferPage(id, flyer.trackingCode, html, result.html)

  return NextResponse.json({
    ok: true,
    applied: result.applied,
    rejected: result.rejected,
    canRevert: true,
  })
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  if (new URL(req.url).searchParams.get("action") !== "revert") {
    return NextResponse.json({ error: "Unknown action" }, { status: 400 })
  }
  const loaded = await loadOwnFlyer(req, id)
  if ("error" in loaded) return loaded.error
  const { email, flyer } = loaded

  const snapshot = await getPreEditSnapshot(id)
  if (!snapshot) {
    return NextResponse.json({ error: "There's nothing to undo on this flyer." }, { status: 404 })
  }

  const instagramSnapshot = await getPreEditSnapshot(instagramSnapshotId(id))
  await updateDeliverable(email, {
    type: "flyer",
    id,
    downloadUrl: snapshot,
    ...(instagramSnapshot && flyer.repurposed ? { repurposed: { ...flyer.repurposed, instagramDownloadUrl: instagramSnapshot } } : {}),
  })
  const current = flyer.downloadUrl ? decodeFlyerHtml(flyer.downloadUrl) : null
  const restored = decodeFlyerHtml(snapshot)
  if (current && restored) await syncOfferPage(id, flyer.trackingCode, current, restored)
  // One level of undo, so the snapshot is consumed rather than left to
  // revert a second time to the same state.
  await clearPreEditSnapshot(id)
  await clearPreEditSnapshot(instagramSnapshotId(id))

  return NextResponse.json({ ok: true, reverted: true })
}
