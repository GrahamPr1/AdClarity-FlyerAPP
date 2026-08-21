import { defineConfig } from "vitest/config"
import path from "node:path"

// Unit tests only, deliberately.
//
// The pipeline's real work is Claude calls and Redis writes; those are
// exercised by the manual `npm run test:*` scripts and by end-to-end runs,
// not here. What IS worth locking down in CI is the pure logic where the
// production bugs actually lived: QR token substitution, offer-drift
// detection, and phone precedence — all of which are deterministic and
// dependency-free.
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, ".") },
  },
})
