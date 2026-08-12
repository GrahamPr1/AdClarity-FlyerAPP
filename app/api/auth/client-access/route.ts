import { NextRequest, NextResponse } from "next/server"
import { issueClientAccessCode } from "@/lib/store"

// POST /api/auth/client-access
// -----------------------------------------------------------------------------
// Step 1 of client self-serve dashboard access. There's no email/SMS delivery
// wired up, so instead of emailing a magic link, this generates a short-lived
// one-time code and returns it directly in the response — the login page
// displays it to whoever just typed that email, who then re-enters it via
// /api/auth/client-login to actually sign in.
//
// Deliberately weak identity check: knowing an email is the ONLY thing this
// requires. Without a real delivery channel there's no way to prove the
// requester owns that inbox, so this is only as secure as an email address
// being hard to guess/know — acceptable while the accounts hold nothing more
// sensitive than flyer designs, not something to rely on if that changes.
// -----------------------------------------------------------------------------
export async function POST(request: NextRequest) {
  let body: { email?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const email = body.email?.trim().toLowerCase()
  if (!email) {
    return NextResponse.json({ error: "Missing required field: email" }, { status: 422 })
  }

  const code = await issueClientAccessCode(email)
  return NextResponse.json({ ok: true, code, expiresInSeconds: 15 * 60 })
}
