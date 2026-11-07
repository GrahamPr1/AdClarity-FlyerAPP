import { describe, it, expect } from "vitest"
import fs from "node:fs"
import path from "node:path"

/**
 * A raw <script> rendered by a React component runs only when the server's
 * HTML is parsed. When the same component renders on the client (any client
 * navigation), React inserts the tag, never runs it, and logs "Encountered a
 * script tag while rendering React component". That is how the NOP portal's
 * <html lang> script misbehaved. Only these files may render one; each has a
 * reason recorded beside it in the file.
 */
const ALLOWED = new Set([
  "app/layout.tsx", // theme before first paint; the root layout never re-renders on navigation
  "app/page.tsx", // home page intro veil + JSON-LD
  "components/google-analytics.tsx", // consent defaults before gtag.js, rendered from the root layout
])

function tsxFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) return tsxFiles(p)
    return p.endsWith(".tsx") ? [p] : []
  })
}

describe("inline scripts", () => {
  it("no page or component outside the allowed list renders a <script> element", () => {
    const root = process.cwd()
    const offenders = ["app", "components"]
      .flatMap((d) => tsxFiles(path.join(root, d)))
      .map((f) => path.relative(root, f))
      .filter((f) => !ALLOWED.has(f))
      .filter((f) => /<script[\s>]/.test(fs.readFileSync(f, "utf8").replace(/\/\/.*$|\/\*[\s\S]*?\*\/|\{\/\*[\s\S]*?\*\/\}/gm, "")))
    expect(offenders).toEqual([])
  })
})
