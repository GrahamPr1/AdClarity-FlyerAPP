/**
 * Compares two agent-regression snapshot directories.
 *
 *   npx tsx tests/regression/compare.ts <before-dir> <after-dir>
 *
 * Text files (HTML, request logs, QR payloads, gate errors) must be byte
 * identical. PNGs are compared by decoded pixels, because Chromium's
 * antialiasing is not perfectly repeatable between two runs of the SAME code;
 * each PNG reports how many pixels differ and by how much, so renderer noise
 * can be told apart from a real change. Exits 1 on any text difference, any
 * missing/extra file, or any PNG of a different size.
 */
import fs from "node:fs"
import path from "node:path"
import { PNG } from "pngjs"

const [before, after] = process.argv.slice(2)
if (!before || !after) {
  console.error("usage: compare.ts <before-dir> <after-dir>")
  process.exit(2)
}

function list(dir: string): string[] {
  const out: string[] = []
  const walk = (d: string) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name)
      if (e.isDirectory()) walk(p)
      else if (e.name !== "MANIFEST.txt") out.push(path.relative(dir, p))
    }
  }
  walk(dir)
  return out.sort()
}

const a = list(before)
const b = list(after)
let failed = false
for (const f of a.filter((f) => !b.includes(f))) {
  failed = true
  console.log(`MISSING after  ${f}`)
}
for (const f of b.filter((f) => !a.includes(f))) {
  failed = true
  console.log(`EXTRA after    ${f}`)
}

let identical = 0
for (const f of a.filter((f) => b.includes(f))) {
  const x = fs.readFileSync(path.join(before, f))
  const y = fs.readFileSync(path.join(after, f))
  if (x.equals(y)) {
    identical++
    continue
  }
  if (!f.endsWith(".png")) {
    failed = true
    console.log(`DIFFERS        ${f}`)
    continue
  }
  const p = PNG.sync.read(x)
  const q = PNG.sync.read(y)
  if (p.width !== q.width || p.height !== q.height) {
    failed = true
    console.log(`SIZE DIFFERS   ${f} ${p.width}x${p.height} vs ${q.width}x${q.height}`)
    continue
  }
  let pixels = 0
  let maxDelta = 0
  for (let i = 0; i < p.data.length; i += 4) {
    let d = 0
    for (let c = 0; c < 4; c++) d = Math.max(d, Math.abs(p.data[i + c] - q.data[i + c]))
    if (d > 0) pixels++
    maxDelta = Math.max(maxDelta, d)
  }
  const pct = ((pixels / (p.width * p.height)) * 100).toFixed(4)
  console.log(`PIXELS         ${f} ${pixels} px (${pct}%) differ, max channel delta ${maxDelta}`)
}
console.log(`${identical}/${a.length} files byte-identical${failed ? "; FAILED" : ""}`)
process.exit(failed ? 1 : 0)
