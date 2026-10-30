import type { MetadataRoute } from "next"
import { CANONICAL_SITE_URL } from "@/lib/site-url"

// Only public, indexable pages. Authenticated routes are excluded here and
// disallowed in robots.ts — listing a page that redirects to /login wastes
// crawl budget and looks like a soft 404. /login itself is left out too: it's
// a sign-in form, not something anyone searches for. Redirecting paths
// (/signup, /pricing, /faq, … in next.config.mjs) never belong here.
export default function sitemap(): MetadataRoute.Sitemap {
  const base = CANONICAL_SITE_URL
  const now = new Date()

  const pages: { path: string; priority: number; changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"] }[] = [
    { path: "/", priority: 1, changeFrequency: "weekly" },
    { path: "/about", priority: 0.6, changeFrequency: "monthly" },
    { path: "/contact", priority: 0.6, changeFrequency: "monthly" },
    { path: "/privacy", priority: 0.3, changeFrequency: "yearly" },
    { path: "/terms", priority: 0.3, changeFrequency: "yearly" },
    { path: "/refund-policy", priority: 0.3, changeFrequency: "yearly" },
  ]

  return pages.map((p) => ({
    url: `${base}${p.path === "/" ? "" : p.path}`,
    lastModified: now,
    changeFrequency: p.changeFrequency,
    priority: p.priority,
  }))
}
