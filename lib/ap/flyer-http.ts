import { NextResponse } from "next/server"
import { SIZES, type Size } from "./templates/content"
import { ApRenderError, type Output } from "./templates/render"
import { noStore } from "./http"

// Shared by the admin preview and the agent flyer routes.

export function parseSize(v: string | null): Size | null {
  const s = v ?? "letter"
  return (SIZES as readonly string[]).includes(s) ? (s as Size) : null
}

export function parseOutput(v: string | null): Output | null {
  const o = v ?? "png"
  return o === "pdf" || o === "png" || o === "thumb" ? o : null
}

export function fileResponse(r: { body: Buffer; contentType: string; hash: string; spacing: string }, name: string, proof: boolean): NextResponse {
  const ext = r.contentType === "application/pdf" ? "pdf" : r.contentType === "image/jpeg" ? "jpg" : "png"
  return new NextResponse(new Uint8Array(r.body), {
    headers: {
      ...noStore,
      "Content-Type": r.contentType,
      "Content-Disposition": `${ext === "pdf" ? "attachment" : "inline"}; filename="${name}${proof ? "-PROOF" : ""}.${ext}"`,
      "X-Ap-Proof": proof ? "1" : "0",
      "X-Ap-Hash": r.hash,
      "X-Content-Type-Options": "nosniff",
    },
  })
}

export function renderErrorResponse(err: unknown): NextResponse {
  if (err instanceof ApRenderError) {
    const status = err.code === "hash_mismatch" || err.code === "foreign_brand" ? 409 : 422
    return NextResponse.json({ error: err.code, message: err.message, slot: err.slot ?? null, problems: err.problems }, { status, headers: noStore })
  }
  console.error("[ap] render failed:", err)
  return NextResponse.json({ error: "render_failed" }, { status: 500, headers: noStore })
}
