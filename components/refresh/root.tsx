import "@/styles/refresh.css"
import { rfSans } from "@/lib/refresh-font"

/**
 * Everything in the refresh design renders inside this: it sets
 * data-design="refresh" (the only selector the design's tokens and classes
 * match) and the design's own font. Pages outside it, NOP included, can't
 * pick up anything from the new design.
 */
export function RefreshRoot({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div data-design="refresh" className={`${rfSans.variable} ${className}`.trim()} style={{ minHeight: "100vh" }}>
      {children}
    </div>
  )
}
