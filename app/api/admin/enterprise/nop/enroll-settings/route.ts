import { NextRequest, NextResponse } from "next/server"
import { audit, requireNopAdmin } from "@/lib/enterprise/program-admins"
import { checkEnrollInput, checkEnrollTargets, enrollUrlsToCheck, getCheckAgentId, getEnrollDomain, getEnrollTargets, getSavedEnrollSettings, listCheckAgentLog, listEnrollDomainLog, listEnrollSettingsLog, saveEnrollTargets, setCheckAgentId } from "@/lib/enterprise/nop-enroll-domain"
import { flagAgentIdIfTooLong, listRoster } from "@/lib/enterprise/agents-store"
import { checkEnrollPage, type EnrollPageCheck } from "@/lib/enterprise/nop-enroll-check"
import { printedEnrollAddress } from "@/lib/enterprise/nop-roster"

// GET  /api/admin/enterprise/nop/enroll-settings -> the enrollment setting (saved
//      in three parts, or still derived from the old domain), what the test
//      agent's QR forwards to and their printed address, whether those URLs load
//      now, and every change.
// POST { forwardTemplate, printed: "short" | "code", printedTemplate?, programUrl, saveDespiteWarning? }
//      -> saved only if it's valid, fits both kits, and its URLs load (live). If
//      the test agent's page shows "not found" (checked in a browser), it's
//      saved only with saveDespiteWarning, and the log says so.
// POST { check: true } -> the browser check of the current setting's check-agent page, nothing saved.
// POST { checkAgentId } -> sets whose page the checks open: any active roster agent; logged.
// OneFlyer admin and program admins.
export const dynamic = "force-dynamic"
// A save loads up to two enrollment pages in a browser (~10-20s each).
export const maxDuration = 120

async function state() {
  const [targets, saved, domain, checkId] = await Promise.all([getEnrollTargets(), getSavedEnrollSettings(), getEnrollDomain(), getCheckAgentId()])
  const [live, log, domainLog, checkAgentLog] = await Promise.all([checkEnrollTargets(targets, checkId), listEnrollSettingsLog(), listEnrollDomainLog(), listCheckAgentLog()])
  return {
    targets,
    saved: saved ? { savedAt: saved.savedAt, admin: saved.admin } : null,
    derivedFromDomain: saved ? null : domain,
    testAgentId: checkId,
    urls: enrollUrlsToCheck(targets, checkId),
    printedExample: printedEnrollAddress(checkId, "Ab3dEf7", targets).lines.join(" "),
    live,
    log,
    domainLog,
    checkAgentLog,
  }
}

/** The test agent's forward URL, and their printed address when it's a different page people type in. */
async function pageChecks(urls: { agent: string; printed: string | null }): Promise<EnrollPageCheck[]> {
  const list = [urls.agent, ...(urls.printed && urls.printed !== urls.agent ? [urls.printed] : [])]
  return Promise.all(list.map(checkEnrollPage))
}

export async function GET(request: NextRequest) {
  const auth = await requireNopAdmin(request)
  if ("response" in auth) return auth.response
  return NextResponse.json(await state(), { headers: { "Cache-Control": "no-store" } })
}

export async function POST(request: NextRequest) {
  const auth = await requireNopAdmin(request)
  if ("response" in auth) return auth.response
  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }
  const checkId = await getCheckAgentId()
  if (body.check === true) return NextResponse.json({ pages: await pageChecks(enrollUrlsToCheck(await getEnrollTargets(), checkId)) })
  if (typeof body.checkAgentId === "string") {
    const set = await setCheckAgentId(body.checkAgentId, auth.admin)
    if (!set.ok) return NextResponse.json({ error: "invalid_check_agent", message: set.message }, { status: 422 })
    await audit(auth, "enroll_check_agent", `${set.entry.from} -> ${set.entry.to}`)
    return NextResponse.json({ checkAgent: set.entry, ...(await state()) })
  }

  const input = checkEnrollInput(body)
  if (!input.ok) return NextResponse.json({ error: "invalid", field: input.field, message: input.message }, { status: 422 })
  const { ok, checks } = await checkEnrollTargets(input.targets, checkId)
  if (!ok) return NextResponse.json({ error: "not_loading", message: "Not saved: these don't load right now.", checks }, { status: 422 })
  const pages = await pageChecks(enrollUrlsToCheck(input.targets, checkId))
  const warning = pages.find((p) => !p.ok) ?? null
  if (warning && body.saveDespiteWarning !== true) {
    return NextResponse.json({ error: "page_warning", message: `Not saved yet: the check agent's page (${warning.url}) ${warning.problem === "not_found" ? "says the partner isn't found" : warning.problem === "blank" ? "showed nothing within 20 seconds" : "didn't load in a browser"}. Save anyway only if that's expected (the check agent ${checkId} isn't set up on the enrollment site yet). Agents can't be switched to kit v2 while it shows this.`, checks, pages }, { status: 409 })
  }
  const page = warning ?? pages[0]
  const entry = await saveEnrollTargets(input.targets, auth.admin, checks, { url: page.url, ok: page.ok, problem: page.problem, text: page.text }, !!warning)
  await audit(auth, "enroll_settings", `${input.targets.forwardTemplate} | printed ${input.targets.printed === "code" ? "oneflyer.org/a/<code>" : input.targets.printed === "full" ? "the full URL, two lines" : input.targets.printedTemplate} | ${input.targets.programUrl}${warning ? " (saved despite page warning)" : ""}`)
  // Agents whose own full URL wouldn't fit get their code link printed: flag them for admin now, not at their next download.
  if (input.targets.printed === "full") for (const r of await listRoster()) await flagAgentIdIfTooLong(r.agentId, r.lockedTo ?? "", input.targets)
  return NextResponse.json({ entry, pages, ...(await state()) })
}
