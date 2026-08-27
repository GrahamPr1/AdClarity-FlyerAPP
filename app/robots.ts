import type { MetadataRoute } from "next"
import { getSiteUrl } from "@/lib/site-url"

// Allow everything except the places a crawler has no business being:
// authenticated app surfaces and the API. /r/[code] IS crawlable — those are
// public offer pages a QR code points at, and there's no reason to hide them.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/dashboard", "/admin", "/profile", "/onboarding", "/coloring-page", "/reset-password"],
      },
    ],
    sitemap: `${getSiteUrl()}/sitemap.xml`,
  }
}
