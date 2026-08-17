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
}

export default nextConfig
