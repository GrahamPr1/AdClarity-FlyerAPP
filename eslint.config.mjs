import nextCoreWebVitals from "eslint-config-next/core-web-vitals"
import nextTypescript from "eslint-config-next/typescript"

// ESLint 9 flat config.
//
// eslint-config-next 16 ships NATIVE flat configs, so these are imported
// directly. Routing them through @eslint/eslintrc's FlatCompat — the older,
// widely-copied pattern — crashes with "Converting circular structure to
// JSON" on this version, because the shared react plugin object is
// self-referential and the compat layer tries to serialize it.
const config = [
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "next-env.d.ts",
      // Vendored shadcn/ui primitives: generated, not hand-maintained here.
      "components/ui/**",
    ],
  },
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    rules: {
      // Several places deliberately destructure fields only to drop them
      // (e.g. buildRawIntakePayload strips planId/businessCategory before the
      // payload reaches an agent). Allow the conventional opt-outs rather
      // than rewriting correct code to satisfy the linter.
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", ignoreRestSiblings: true },
      ],
    },
  },
]

export default config
