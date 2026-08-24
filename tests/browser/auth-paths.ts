import path from "node:path"

/** Where each engine's saved admin session lives. Not a test file — Playwright forbids spec-to-spec imports. */
export const adminStateFile = (project: string) => path.join("tests/browser/.auth", `admin-${project}.json`)
