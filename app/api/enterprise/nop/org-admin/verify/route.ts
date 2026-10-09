import { NextRequest, NextResponse } from "next/server"
import { MAX_CODE_ATTEMPTS, codeMatches, deleteFlow, updateFlow } from "@/lib/enterprise/access-store"
import { getOrgAdmin, recordNopAdminAction, setOrgAdminSession, touchOrgAdminSignIn } from "@/lib/enterprise/org-admins"
import { clearOrgAdminFlowCookie, orgAdminFail, orgAdminRateLimit, readOrgAdminFlow } from "@/lib/enterprise/org-admin-http"

// POST /api/enterprise/nop/org-admin/verify { code }
//
// A correct code (single-use, constant-time, 5 wrong tries end the flow)
// signs the org admin in, if they are still an org admin.

export async function POST(request: NextRequest) {
  const flow = await readOrgAdminFlow(request)
  if (!flow) return orgAdminFail(409, "expired", "That code has expired. Please start again.")
  const limited = await orgAdminRateLimit(request, "verify", flow.id)
  if (limited) return limited

  let code: string
  try {
    code = String(((await request.json()) as { code?: unknown }).code ?? "").replace(/\D/g, "")
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }
  const { id, state } = flow

  if (!codeMatches(id, code, state.codeHash)) {
    const attempts = state.attempts + 1
    if (attempts >= MAX_CODE_ATTEMPTS) {
      await deleteFlow(id)
      const res = orgAdminFail(429, "too_many_attempts", "Too many wrong codes. Please start again.")
      clearOrgAdminFlowCookie(res)
      return res
    }
    await updateFlow(id, { ...state, attempts })
    return orgAdminFail(400, "wrong_code", "That code isn't right. Check the email and try again.")
  }

  await deleteFlow(id)
  if (!state.account || !(await getOrgAdmin(state.account))) {
    const res = orgAdminFail(409, "expired", "That code has expired. Please start again.")
    clearOrgAdminFlowCookie(res)
    return res
  }
  await touchOrgAdminSignIn(state.account)
  await recordNopAdminAction(state.account, "sign_in", "")
  const res = NextResponse.json({ ok: true, redirect: "/admin/enterprise/nop" })
  await setOrgAdminSession(res, state.account)
  clearOrgAdminFlowCookie(res)
  return res
}
