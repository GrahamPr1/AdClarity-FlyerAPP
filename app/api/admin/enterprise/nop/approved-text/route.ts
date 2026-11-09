import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/enterprise/portal/admin"
import { NOP_ORG_ID } from "@/lib/enterprise/nop-roster"
import { parseNopLang, NOP_LANGS } from "@/lib/enterprise/nop-i18n"
import { APPROVED_TEXT_HELP, APPROVED_TEXT_KEYS, APPROVED_TEXT_LABELS, MAX_APPROVED_TEXT, getApprovedText, isApprovedTextKey, saveApprovedText } from "@/lib/enterprise/portal/approved-text"
import { checkFollowUpText, isFollowUpKey } from "@/lib/enterprise/portal/follow-ups"
import { checkConsentText } from "@/lib/enterprise/portal/lead-capture"

// GET/POST /api/admin/enterprise/nop/approved-text — the NOP org's approved
// wording, EN and ES: lead-form consent, agent-page packages, follow-up
// messages. OneFlyer admin only. Whatever is saved is shown (or put in an
// agent's message) verbatim, so only the org's final approved text belongs
// here; blank puts the placeholder back. Follow-ups must have a subject line,
// a message, and only the known fill-ins.
export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  const a = await requireAdmin(request)
  if ("response" in a) return a.response
  const texts = await Promise.all(APPROVED_TEXT_KEYS.flatMap((key) => NOP_LANGS.map((lang) => getApprovedText(NOP_ORG_ID, key, lang))))
  return NextResponse.json({ texts: texts.map((t) => ({ ...t, label: APPROVED_TEXT_LABELS[t.key], help: APPROVED_TEXT_HELP[t.key] ?? null })) }, { headers: { "Cache-Control": "no-store" } })
}

export async function POST(request: NextRequest) {
  const a = await requireAdmin(request)
  if ("response" in a) return a.response
  const body = (await request.json().catch(() => null)) as { key?: unknown; lang?: unknown; text?: unknown } | null
  const lang = parseNopLang(body?.lang)
  if (!isApprovedTextKey(body?.key) || !lang || typeof body?.text !== "string") return NextResponse.json({ error: "invalid" }, { status: 400 })
  if (body.text.length > MAX_APPROVED_TEXT) return NextResponse.json({ error: "too_long", message: `At most ${MAX_APPROVED_TEXT} characters.` }, { status: 422 })
  if (body.key === "leadConsent") {
    const check = checkConsentText(body.text)
    if (!check.ok) return NextResponse.json({ error: "invalid_consent", message: check.message }, { status: 422 })
  }
  if (isFollowUpKey(body.key)) {
    const check = checkFollowUpText(body.text)
    if (!check.ok) return NextResponse.json({ error: "invalid_follow_up", message: check.message }, { status: 422 })
  }
  return NextResponse.json({ text: await saveApprovedText(NOP_ORG_ID, body.key, lang, body.text, a.admin) })
}
