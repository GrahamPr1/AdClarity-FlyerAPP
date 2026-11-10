import { NextRequest, NextResponse } from "next/server"
import { MAX_CODE_ATTEMPTS, codeMatches, deleteFlow, getFlow, updateFlow } from "@/lib/enterprise/access-store"
import { PROGRAM_ADMIN_COOKIE, PROGRAM_ADMIN_FLOW_COOKIE, PROGRAM_ADMIN_SESSION_SECONDS, createProgramAdminToken, getProgramAdmin, logNopAdminAction, programAdminCookieOptions, touchProgramAdminSignIn } from "@/lib/enterprise/program-admins"
import { checkRateLimit, clientIp } from "@/lib/rate-limit"

// POST /api/program-admin/verify { code } -> signed in at /program.
// Same rules as agent codes: single use, constant-time compare, 5 tries.
export async function POST(request: NextRequest) {
  const id = request.cookies.get(PROGRAM_ADMIN_FLOW_COOKIE)?.value
  const state = await getFlow(id)
  if (!id || !state || state.kind !== "program-admin") return NextResponse.json({ error: "expired", message: "That code has expired. Start again." }, { status: 409 })
  const limited = await checkRateLimit(`program-admin:verify:ip:${clientIp(request.headers)}`, 30, 15 * 60)
  if (!limited.allowed) return NextResponse.json({ error: "rate_limited", message: "Too many attempts. Please wait a few minutes and try again." }, { status: 429 })
  let code: string
  try {
    code = String(((await request.json()) as { code?: unknown }).code ?? "").replace(/\D/g, "")
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }
  if (!codeMatches(id, code, state.codeHash)) {
    const attempts = state.attempts + 1
    if (attempts >= MAX_CODE_ATTEMPTS) {
      await deleteFlow(id)
      return NextResponse.json({ error: "too_many_attempts", message: "Too many wrong codes. Start again." }, { status: 429 })
    }
    await updateFlow(id, { ...state, attempts })
    return NextResponse.json({ error: "wrong_code", message: "That code isn't right." }, { status: 400 })
  }
  await deleteFlow(id)
  const email = state.account!
  const admin = await getProgramAdmin(email)
  if (!admin) return NextResponse.json({ error: "expired", message: "That code has expired. Start again." }, { status: 409 })
  await touchProgramAdminSignIn(email)
  await logNopAdminAction({ actor: email, actorName: admin.name, role: "program", action: "sign_in", detail: "" })
  const res = NextResponse.json({ ok: true, redirect: "/program/agents" })
  res.cookies.set(PROGRAM_ADMIN_COOKIE, await createProgramAdminToken(email), programAdminCookieOptions(PROGRAM_ADMIN_SESSION_SECONDS))
  res.cookies.set(PROGRAM_ADMIN_FLOW_COOKIE, "", programAdminCookieOptions(0))
  return res
}
