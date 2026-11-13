import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { agentPlatformEnabled } from "@/lib/ap/flag"
import { NOINDEX } from "@/lib/site-metadata"

export const metadata: Metadata = { robots: NOINDEX }

// Every /ap page: a plain 404 unless AGENT_PLATFORM_ENABLED is "true".
export default function ApLayout({ children }: { children: React.ReactNode }) {
  if (!agentPlatformEnabled()) notFound()
  return <div className="min-h-screen bg-background text-foreground">{children}</div>
}
