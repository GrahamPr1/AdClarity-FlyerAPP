import path from "node:path"
import { fileURLToPath } from "node:url"

const projectDir = path.dirname(fileURLToPath(import.meta.url))

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Pinned because a stray package-lock.json in the user's HOME directory
  // made Next infer /Users/<me>/ as the workspace root. That silently
  // changed what outputFileTracingIncludes below resolves against, which is
  // how playwright-core's browsers.json came to be missing from the
  // deployed function while the build reported no error at all.
  outputFileTracingRoot: projectDir,

  // THIS is what makes the PDF route work on Vercel. Both packages read
  // their own files by path at runtime — playwright-core requires
  // browsers.json when its core bundle loads, @sparticuz/chromium unpacks
  // a 67MB brotli Chromium out of its bin/ directory — and a bundler
  // cannot follow either. Externalising them copies each package whole
  // into the function.
  //
  // Without this, production returned "We couldn't build the PDF" for
  // every download. The logged cause was
  //   Cannot find module /var/task/node_modules/playwright-core/browsers.json
  // and behind it, once that was fixed, a second identical failure:
  //   The input directory /var/task/node_modules/@sparticuz/chromium/bin
  //   does not exist
  // Only the first was visible, because it threw first.
  //
  // Deliberately NOT accompanied by a vercel.json `functions` entry.
  // Adding one to raise memory was tried and made things worse: it changed
  // how the route was built and the chromium binaries stopped shipping
  // even with serverExternalPackages set. Memory was never the problem —
  // measured on the Lambda, a real three-image flyer renders in 41ms at
  // 190MB RSS, against a 1GB+ default.
  serverExternalPackages: ["playwright-core", "@sparticuz/chromium"],
  turbopack: { root: projectDir },
  typescript: {
    // Previously true, which meant a type error anywhere — including inside
    // an auth check or a plan-limit comparison — would still ship a green
    // build. The codebase typechecks clean today, so this is now enforced at
    // build time rather than depending on someone remembering to run
    // `npx tsc --noEmit` first.
    ignoreBuildErrors: false,
  },
  images: {
    unoptimized: true,
  },

  // The .ttf faces the PDF renderer registers with fontconfig at runtime
  // (see lib/pdf/fonts.ts). Nothing imports them, so tracing cannot see
  // them, and without them every PDF comes out in the container's single
  // default face.
  //
  // CORRECTION (2026-10-07): an earlier note here said node_modules globs
  // never match on Turbopack and that serverExternalPackages copies both
  // packages whole. Neither held. The globs were never applied because the
  // route key "[id]" was an unescaped glob character class; with the key
  // escaped they match, and they are what ships browsers.json and
  // Chromium's binaries. serverExternalPackages is still needed (it keeps
  // the packages out of the bundle) but does not ship them on its own.
  outputFileTracingIncludes: {
    // Keys are GLOBS matched against the route: an unescaped "[id]" is a
    // character class, so this entry silently never applied. Measured
    // (2026-10-07): the route's .nft.json had 86 playwright-core files and
    // no browsers.json, and none of @sparticuz/chromium — production failed
    // every download with "Cannot find module
    // /var/task/node_modules/playwright-core/browsers.json". With the key
    // escaped, both packages and the fonts are traced into the function.
    // (So serverExternalPackages alone does not ship them whole, and
    // node_modules globs DO match here — see the note above.)
    "/api/flyers/\\[id\\]/pdf": ["./lib/pdf/fonts/**", "./node_modules/playwright-core/**", "./node_modules/@sparticuz/chromium/**"],
  },

  // Vanity paths people type or that appear in old links. Permanent, because
  // these are stable product URLs rather than temporary marketing routes.
  //
  // /app is NOT here: it depends on whether the visitor is signed in, and a
  // static redirect can't know that. It lives in middleware.ts instead.
  //
  // /faq points at the homepage section rather than a page of its own,
  // because the FAQ already has full answers there (see FAQS in
  // lib/marketing.ts) and a second copy would drift.
  async redirects() {
    return [
      { source: "/signup", destination: "/onboarding", permanent: true },
      { source: "/register", destination: "/onboarding", permanent: true },
      { source: "/create", destination: "/onboarding", permanent: true },
      { source: "/demo", destination: "/onboarding", permanent: true },
      { source: "/faq", destination: "/#faq", permanent: true },
    ]
  },
}

export default nextConfig
