/** @type {import('next').NextConfig} */
const nextConfig = {
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
