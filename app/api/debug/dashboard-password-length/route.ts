import { NextResponse } from "next/server"

// TEMPORARY DIAGNOSTIC — reports only the character count of
// DASHBOARD_PASSWORD, never the value itself. Delete this route once the
// length has been confirmed.
export async function GET() {
  const length = process.env.DASHBOARD_PASSWORD?.length ?? null
  console.log("[diagnostic] DASHBOARD_PASSWORD length:", length)
  return NextResponse.json({ length })
}
