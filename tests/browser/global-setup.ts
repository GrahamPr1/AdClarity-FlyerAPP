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

  // The above only warms what an ANONYMOUS request reaches. /dashboard
  // returns a 307 to an unauthenticated caller, so the component behind it —
  // the heaviest tree in the app, recharts included — never compiles. The
  // first real login then pays that cost, and with three browser engines
  // authenticating four roles each, twelve requests hit a cold compile at
  // once and the logins time out.
  //
  // So: sign in once, load the authenticated dashboard once, and let
  // everything afterwards hit a warm cache. Failures are swallowed — this is
  // an optimisation, and a broken warm-up must not stop the suite from
  // running and reporting the real problem.
  try {
    const res = await fetch(`${base}/api/auth/client-login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "admin-audit-chromium@dev.invalid", password: "DevTest!2345" }),
      redirect: "manual",
    })
    const cookie = res.headers.get("set-cookie")?.split(";")[0]
    if (cookie) {
      await fetch(`${base}/dashboard`, { headers: { cookie }, redirect: "manual" })
      await fetch(`${base}/profile`, { headers: { cookie }, redirect: "manual" })
    }
  } catch {
    // Warm-up only.
  }
}
