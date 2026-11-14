import { RefreshSiteHeader } from "@/components/refresh/site-header"
import { RefreshHero } from "@/components/refresh/hero"

// /preview/home: the new header + hero only, for review. Not linked anywhere.
export default function HomePreview() {
  return (
    <>
      <RefreshSiteHeader />
      <main id="top">
        <RefreshHero />
      </main>
    </>
  )
}
