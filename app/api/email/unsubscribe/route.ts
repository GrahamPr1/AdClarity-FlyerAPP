import { NextRequest, NextResponse } from "next/server"
import { CATEGORY_LABEL, setEmailPreferences, unsubscribedPatch, verifyUnsubscribe } from "@/lib/email-preferences"

// POST /api/email/unsubscribe?e=&c=&t= — one signed link, two callers:
//   - a mail client's own "Unsubscribe" button (RFC 8058: the List-Unsubscribe
//     header plus List-Unsubscribe-Post, body "List-Unsubscribe=One-Click"),
//     which expects a plain 200;
//   - the confirm button on /unsubscribe, which is a normal form post and is
//     sent back to that page to show it worked.
// There is deliberately no GET: mail security scanners open every link in a
// message, and a GET that unsubscribed would switch people off unasked.
export const dynamic = "force-dynamic"

export async function POST(request: NextRequest) {
  const url = new URL(request.url)
  const target = verifyUnsubscribe({ e: url.searchParams.get("e"), c: url.searchParams.get("c"), t: url.searchParams.get("t") })
  if (!target) return NextResponse.json({ error: "invalid_link", message: "This unsubscribe link isn't valid." }, { status: 400 })

  await setEmailPreferences(target.email, unsubscribedPatch(target.category))
  console.log(`[email-prefs] ${target.email}: unsubscribed from ${target.category}`)

  const form = await request.formData().catch(() => null)
  if (form?.get("from") === "page") {
    const back = new URL("/unsubscribe", url)
    back.searchParams.set("done", target.category)
    return NextResponse.redirect(back, 303)
  }
  return new NextResponse(`Unsubscribed from ${CATEGORY_LABEL[target.category]}.`, { status: 200, headers: { "Content-Type": "text/plain; charset=utf-8" } })
}
