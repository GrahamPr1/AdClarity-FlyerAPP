import { PNG } from "pngjs"
import jsQR from "jsqr"

/**
 * Decodes the QR code in a PNG, or null if none can be read. The release
 * gate in render.ts compares this with the agent's enrollment URL and
 * refuses to return a file on any mismatch — a flyer whose code scans to
 * the wrong place (or nowhere) must never reach a printer.
 */
export function decodeQrFromPng(png: Buffer): string | null {
  const img = PNG.sync.read(png)
  const hit = jsQR(new Uint8ClampedArray(img.data.buffer, img.data.byteOffset, img.data.byteLength), img.width, img.height)
  return hit?.data ?? null
}
