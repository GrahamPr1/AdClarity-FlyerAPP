import { NextResponse, type NextRequest } from "next/server"
import { AP_FLOW_COOKIE, FLOW_TTL_SECONDS } from "./access"

// Small shared helpers for the platform's route handlers.

export const noStore = { "Cache-Control": "no-store" }

export function jsonError(status: number, error: string, extra: Record<string, unknown> = {}): NextResponse {
  return NextResponse.json({ error, ...extra }, { status, headers: noStore })
}

export async function readJson(request: NextRequest): Promise<Record<string, unknown> | null> {
  try {
    const v = await request.json()
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null
  } catch {
    return null
  }
}

export function clientIp(request: NextRequest): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown"
}

export function setFlowCookie(res: NextResponse, flowId: string): void {
  res.cookies.set(AP_FLOW_COOKIE, flowId, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: FLOW_TTL_SECONDS })
}

export function clearFlowCookie(res: NextResponse): void {
  res.cookies.set(AP_FLOW_COOKIE, "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 0 })
}
