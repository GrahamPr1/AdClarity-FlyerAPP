import Link from "next/link"
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from "react"

// Shared building blocks of the refresh design. Styling lives in
// styles/refresh.css (scoped to data-design="refresh"), so light and dark
// come from the tokens, never from per-component colours.

export type ButtonVariant = "primary" | "outline" | "amber" | "ghost" | "danger"
export type ButtonSize = "sm" | "md" | "lg"

const btn = (variant: ButtonVariant, size: ButtonSize, extra = "") =>
  `rf-btn rf-btn-${size} ${variant === "primary" ? "rf-btn-primary" : variant === "outline" ? "rf-btn-outline" : `rf-btn-${variant}`} ${extra}`.trim()

export function Button({ variant = "primary", size = "md", className = "", ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return <button type="button" {...rest} className={btn(variant, size, className)} />
}

/** A link styled as a button. Internal paths use next/link. */
export function ButtonLink({ href, variant = "primary", size = "md", className = "", children, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; variant?: ButtonVariant; size?: ButtonSize; children: ReactNode }) {
  const cls = btn(variant, size, className)
  return href.startsWith("/") && !href.startsWith("//") ? (
    <Link href={href} className={cls} {...rest}>{children}</Link>
  ) : (
    <a href={href} className={cls} {...rest}>{children}</a>
  )
}

export type Tone = "blue" | "teal" | "pink" | "green" | "amber" | "neutral" | "primary" | "solid-amber"

export function Pill({ tone = "neutral", children, className = "" }: { tone?: Tone; children: ReactNode; className?: string }) {
  return <span className={`rf-pill rf-tone-${tone} ${className}`.trim()}>{children}</span>
}

export function Card({ variant = "surface", as: Tag = "div", className = "", children, ...rest }: { variant?: "surface" | "navy" | "soft"; as?: "div" | "section" | "article" | "aside"; className?: string; children: ReactNode } & Record<string, unknown>) {
  const v = variant === "navy" ? "rf-card rf-card-navy" : variant === "soft" ? "rf-card rf-card-soft" : "rf-card"
  return <Tag className={`${v} ${className}`.trim()} {...rest}>{children}</Tag>
}

/** A number tile. `value` is whatever the page really has; pass "—" (with a reason in `note`) when there's no data, never a made-up number. */
export function StatTile({ label, value, note, variant = "surface", accent }: { label: string; value: ReactNode; note?: string; variant?: "surface" | "navy"; accent?: "teal" | "blue" | "amber" }) {
  const color = accent === "teal" ? "var(--rf-teal)" : accent === "blue" ? "var(--rf-link)" : accent === "amber" ? "var(--rf-amber)" : undefined
  return (
    <div className={`rf-stat ${variant === "navy" ? "rf-card-navy" : "rf-card"}`} style={{ padding: 18, borderRadius: 18 }}>
      <span className="rf-stat-label">{label}</span>
      <span className="rf-stat-value" style={color ? { color } : undefined}>{value}</span>
      {note && <span className="rf-stat-label">{note}</span>}
    </div>
  )
}

/** A feature card: tinted icon tile, title, one line. */
export function FeatureTile({ tone, icon, title, children }: { tone: Exclude<Tone, "primary" | "solid-amber">; icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div className="rf-card" style={{ padding: 22, borderRadius: 18, display: "flex", flexDirection: "column", gap: 10 }}>
      <span aria-hidden="true" className={`rf-icon-tile rf-tone-${tone}`}>{icon}</span>
      <h3 style={{ margin: 0, fontSize: 17 }}>{title}</h3>
      <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5, color: "var(--rf-muted)" }}>{children}</p>
    </div>
  )
}

/** Eyebrow + serif heading, with an optional italic accent at the end. */
export function SectionHeading({ eyebrow, title, accent, align = "center", id }: { eyebrow?: string; title: string; accent?: string; align?: "center" | "left"; id?: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, alignItems: align === "center" ? "center" : "flex-start", textAlign: align }}>
      {eyebrow && <p className="rf-eyebrow">{eyebrow}</p>}
      <h2 className="rf-h2" id={id}>
        {title}
        {accent && <> <span className="rf-accent">{accent}</span></>}
      </h2>
    </div>
  )
}

export function Field({ id, label, hint, children }: { id: string; label: string; hint?: string; children: ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <label htmlFor={id} className="rf-label">{label}</label>
      {children}
      {hint && <span style={{ fontSize: 13, color: "var(--rf-muted)" }}>{hint}</span>}
    </div>
  )
}
