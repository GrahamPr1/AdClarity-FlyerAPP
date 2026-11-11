import { defineConfig } from "vitest/config"
import path from "node:path"

// On-demand only (Chromium, real renders). See agent-flyer-snapshot.regression.ts.
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/regression/**/*.regression.ts"],
    fileParallelism: false,
    sequence: { concurrent: false },
    env: { UPSTASH_REDIS_REST_URL: "https://regression.invalid", UPSTASH_REDIS_REST_TOKEN: "regression" },
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "../..") },
  },
})
