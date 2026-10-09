import { NextRequest, NextResponse } from "next/server"
import { requireClientSession } from "@/lib/enterprise/agent-session"
import { tNop, type NopStringKey } from "@/lib/enterprise/nop-i18n"
import { nopLangForRequest } from "@/lib/enterprise/nop-i18n/server"
import { isNopTemplate } from "@/lib/enterprise/nop-render/kit"
import { getLiveContent } from "@/lib/enterprise/nop-render/content-store"
import { NopRenderError, renderNopFlyer, type NopFormat } from "@/lib/enterprise/nop-render/render"
import { loadNopAgent, nopStatusMessageKey } from "@/lib/enterprise/nop-render/agent-context"
import { logNopRender } from "@/lib/enterprise/nop-render/log"
import { getCachedThumb, setCachedThumb, thumbCacheKey } from "@/lib/enterprise/nop-render/thumb-cache"

// GET /api/enterprise/nop/render/{NOP_P2_ES}?format=preview|print|home|social
//
// The only way a NOP flyer leaves OneFlyer. No AI anywhere: Basic Benefits'
// master, the agent's display details and their LOCKED Agent ID. Roster
// status is read on every call, so a suspension applies to the very next
// preview or download. Every returned file is logged (compliance record);
// refused or failed renders are not, because nothing was produced.

export const maxDuration = 60
export const dynamic = "force-dynamic"

const FORMATS: readonly NopFormat[] = ["preview", "print", "home", "social", "thumb"]

export async function GET(request: NextRequest, { params }: { params: Promise<{ template: string }> }) {
  const auth = await requireClientSession(request)
  if ("response" in auth) return auth.response
  const lang = await nopLangForRequest(request, auth.email)

  const { template } = await params
  if (!isNopTemplate(template)) return NextResponse.json({ error: "unknown_template" }, { status: 404 })
  const format = new URL(request.url).searchParams.get("format") as NopFormat
  if (!FORMATS.includes(format)) return NextResponse.json({ error: "format must be preview, print, home or social" }, { status: 422 })

  const agent = await loadNopAgent(auth.email)
  if (!agent) return NextResponse.json({ error: "not_registered" }, { status: 404 })
  if (!agent.active) {
    return NextResponse.json(
      { error: "not_active", status: agent.status, message: tNop(lang, nopStatusMessageKey(agent.status)) },
      { status: 403, headers: { "Cache-Control": "no-store" } },
    )
  }

  const values = {
    agentId: agent.agentId,
    displayName: agent.profile.displayName ?? agent.profile.name,
    displayPhone: agent.profile.displayPhone ?? agent.profile.phone,
    displayEmail: agent.profile.displayEmail ?? agent.profile.email,
  }

  // Dashboard thumbnails: served from the 7-day cache when every input is
  // unchanged; only a fresh render is logged (format "thumb").
  // One content version for the whole request: render, cache key and log agree.
  const live = await getLiveContent()
  const thumbKey = format === "thumb" ? thumbCacheKey(template, values, live) : null
  if (thumbKey) {
    const cached = await getCachedThumb(thumbKey)
    if (cached) {
      return new NextResponse(new Uint8Array(cached), {
        headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, no-store", "X-Thumb-Cache": "hit" },
      })
    }
  }

  let rendered
  try {
    rendered = await renderNopFlyer(template, values, format, live)
  } catch (err) {
    if (err instanceof NopRenderError && err.code === "field_too_long") {
      const fieldKey = `render.field_${err.field}` as NopStringKey
      const field = ["agent_name", "agent_email", "agent_phone"].includes(err.field ?? "") ? tNop(lang, fieldKey) : err.field ?? ""
      return NextResponse.json({ error: "field_too_long", field: err.field, message: tNop(lang, "render.too_long", { field }) }, { status: 422 })
    }
    console.error(`[nop-render] ${template} ${format} for agent ${agent.agentId} failed:`, err instanceof Error ? err.message : err)
    return NextResponse.json({ error: "render_failed", message: tNop(lang, "render.failed") }, { status: 500 })
  }

  await logNopRender({
    agentId: agent.agentId, account: auth.email, template, format,
    kitVersion: live.content.program.kit_version, contentVersion: rendered.contentVersion,
  })
  if (thumbKey) {
    await setCachedThumb(thumbKey, rendered.body)
    return new NextResponse(new Uint8Array(rendered.body), {
      headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, no-store", "X-Thumb-Cache": "miss", "X-Render-Ms": String(rendered.ms) },
    })
  }

  const suffix = format === "home" ? (lang === "es" ? "_casa" : "_home") : format === "social" ? (lang === "es" ? "_redes" : "_social") : ""
  const ext = rendered.contentType === "application/pdf" ? "pdf" : "png"
  const filename = `${template}_${agent.agentId}${suffix}.${ext}`
  return new NextResponse(new Uint8Array(rendered.body), {
    headers: {
      "Content-Type": rendered.contentType,
      "Content-Disposition": `${format === "preview" ? "inline" : "attachment"}; filename="${filename}"`,
      "Cache-Control": "private, no-store",
      "X-Render-Ms": String(rendered.ms),
    },
  })
}
