// Shared by the root layout and the homepage. A page that sets openGraph
// replaces the layout's whole openGraph object (Next merges metadata one
// level deep), so the homepage spreads these to add its og:url.
export const SITE_TITLE = "OneFlyer — Turn One Promotion Into a Full Marketing Campaign"
export const SITE_DESCRIPTION =
  "Create professional flyers, Instagram posts, text-blast copy, Nextdoor posts, and trackable QR campaigns in minutes. One promotion becomes a full campaign, matched to your business. 3 campaigns free, no credit card."

export const SITE_OPEN_GRAPH = {
  title: SITE_TITLE,
  description: SITE_DESCRIPTION,
  type: "website",
  siteName: "OneFlyer",
  locale: "en_US",
} as const
