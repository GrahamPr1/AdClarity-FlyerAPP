import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/enterprise/portal/admin"
import { NOP_ORG_ID } from "@/lib/enterprise/nop-roster"
import { parseNopLang, NOP_LANGS } from "@/lib/enterprise/nop-i18n"
import { APPROVED_TEXT_KEYS, APPROVED_TEXT_LABELS, MAX_APPROVED_TEXT, getApprovedText, isApprovedTextKey, saveApprovedText } from "@/lib/enterprise/portal/approved-text"

// GET/POST /api/admin/enterprise/nop/approved-text — the NOP org's approved
// wording (for now, the lead form's consent line, EN and ES). OneFlyer admin
// only. Whatever is saved is shown verbatim on public pages, so only the
// org's final approved text belongs here; blank puts the placeholder back.
export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  const a = await requireAdmin(request)
  if ("response" in a) return a.response
  const texts = await Promise.all(APPROVED_TEXT_KEYS.flatMap((key) => NOP_LANGS.map((lang) => getApprovedText(NOP_ORG_ID, key, lang))))
  return NextResponse.json({ texts: texts.map((t) => ({ ...t, label: APPROVED_TEXT_LABELS[t.key] })) }, { headers: { "Cache-Control": "no-store" } })
}

export async function POST(request: NextRequest) {
  const a = await requireAdmin(request)
  if ("response" in a) return a.response
  const body = (await request.json().catch(() => null)) as { key?: unknown; lang?: unknown; text?: unknown } | null
  const lang = parseNopLang(body?.lang)
  if (!isApprovedTextKey(body?.key) || !lang || typeof body?.text !== "string") return NextResponse.json({ error: "invalid" }, { status: 400 })
  if (body.text.length > MAX_APPROVED_TEXT) return NextResponse.json({ error: "too_long", message: `At most ${MAX_APPROVED_TEXT} characters.` }, { status: 422 })
  return NextResponse.json({ text: await saveApprovedText(NOP_ORG_ID, body.key, lang, body.text, a.admin) })
}
