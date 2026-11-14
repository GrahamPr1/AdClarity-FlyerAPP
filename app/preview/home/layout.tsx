import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { DM_Sans } from "next/font/google"
import { getAppEnvironment } from "@/lib/env"
import { NOINDEX } from "@/lib/site-metadata"
import "@/styles/refresh.css"

// Unlinked review preview of the redesigned homepage (Brief D, step 0 item 5).
// Never in production; noindex everywhere.
//
// The refresh design's own DM Sans (400-700, its own font-family name): the
// root layout's DM Sans ships 400/500 only, and adding weights there would
// change how NOP renders its bold text.
const rfSans = DM_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-rf-sans", display: "swap" })

export const metadata: Metadata = { title: "Homepage preview", robots: NOINDEX }

export default function PreviewLayout({ children }: { children: React.ReactNode }) {
  if (getAppEnvironment() === "production") notFound()
  return <div data-design="refresh" className={rfSans.variable} style={{ minHeight: "100vh" }}>{children}</div>
}
