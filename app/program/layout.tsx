import type { Metadata } from "next"
import { NOINDEX } from "@/lib/site-metadata"

export const metadata: Metadata = { title: "Neighborhood Outreach Program admin", robots: NOINDEX }

// /program: program admins (lib/enterprise/program-admins.ts). Sign-in at /program;
// the agents screens under /program/agents check the program-admin session.
export default function ProgramLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-background text-foreground">{children}</div>
}
