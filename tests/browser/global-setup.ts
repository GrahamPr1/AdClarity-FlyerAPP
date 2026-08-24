/**
 * Warms the dev server before any test runs.
 *
 * Next.js compiles routes on demand in dev, so the FIRST request to each one
 * pays the compile cost. With three engines running in parallel that landed
 * on whichever test got there first — reliably green on a warm server, and
 * intermittently timing out on the first run after `npm run dev`. Fetching
 * each route once up front moves that cost somewhere it can't fail a test.
 *
 * Routes that need auth still compile fine; the redirect is irrelevant here.
 */
const ROUTES = ["/", "/login", "/onboarding", "/dashboard", "/admin", "/admin/audit", "/api/admin/audit"]

export default async function globalSetup() {
  const base = "http://localhost:3000"
  await Promise.all(
    ROUTES.map((route) =>
      fetch(`${base}${route}`, { redirect: "manual" }).catch(() => {
        // A route that refuses or redirects has still been compiled, which is
        // the only thing this is for.
      }),
    ),
  )
}
