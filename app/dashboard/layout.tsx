import type { Metadata } from "next"
import { NOINDEX } from "@/lib/site-metadata"

// Not a marketing page: keep it out of search results (see NOINDEX).
export const metadata: Metadata = { robots: NOINDEX }

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
