import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { getAppEnvironment } from "@/lib/env"
import { NOINDEX } from "@/lib/site-metadata"
import { RefreshRoot } from "@/components/refresh/root"

// /preview/*: unlinked review pages for the redesign (Brief D). Never in
// production; noindex everywhere.
export const metadata: Metadata = { title: "Design preview", robots: NOINDEX }

export default function PreviewLayout({ children }: { children: React.ReactNode }) {
  if (getAppEnvironment() === "production") notFound()
  return <RefreshRoot>{children}</RefreshRoot>
}
