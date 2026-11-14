import { describe, it, expect, vi } from "vitest"
import fs from "node:fs"

// The refresh design (Brief D) must not reach any page that doesn't opt in,
// NOP above all: every rule in styles/refresh.css is scoped to
// data-design="refresh", and no shared file pulls the new design in.

vi.mock("next/navigation", () => ({ usePathname: () => "/dashboard/leads" }))

/** Every selector list in a stylesheet (outside @media / @supports wrappers). */
function selectors(css: string): string[] {
  const out: string[] = []
  const src = css.replace(/\/\*[\s\S]*?\*\//g, "")
  const re = /([^{}]+)\{([^{}]*)\}/g
  for (const m of src.matchAll(re)) {
    const sel = m[1].trim()
    if (!sel || sel.startsWith("@") || /^(from|to|\d+%)$/.test(sel)) continue
    out.push(...sel.split(",").map((s) => s.replace(/^@media[^{]*/, "").trim()).filter(Boolean))
  }
  return out
}

describe("refresh design is scoped", () => {
  const css = fs.readFileSync("styles/refresh.css", "utf8")

  it("every selector in styles/refresh.css sits under [data-design=\"refresh\"]", () => {
    const all = selectors(css)
    expect(all.length).toBeGreaterThan(60)
    const unscoped = all.filter((s) => !s.includes('[data-design="refresh"]'))
    expect(unscoped).toEqual([])
  })

  it("only refresh components and preview pages import the stylesheet or the design root", () => {
    const files = require("node:child_process").execSync("git ls-files -co --exclude-standard 'app/**/*.tsx' 'components/**/*.tsx' 'lib/**/*.ts'", { encoding: "utf8" }).trim().split("\n") as string[] // eslint-disable-line @typescript-eslint/no-require-imports
    const users = files.filter((f) => fs.existsSync(f) && /styles\/refresh\.css|components\/refresh\/root|lib\/refresh-font/.test(fs.readFileSync(f, "utf8")))
    for (const f of users) expect(f).toMatch(/^(components\/refresh\/|app\/preview\/|lib\/refresh-font\.ts$)/)
  })

  it("defines a dark value for every token that changes with the theme", () => {
    const light = new Set([...css.matchAll(/--rf-[a-z0-9-]+(?=:)/g)].map((m) => m[0]))
    const darkBlock = /\.dark \[data-design="refresh"\] \{([\s\S]*?)\n\}/.exec(css)![1]
    const dark = new Set([...darkBlock.matchAll(/--rf-[a-z0-9-]+(?=:)/g)].map((m) => m[0]))
    // Tokens that are deliberately the same in both themes (fixed brand values and sizes).
    const same = new Set(["--rf-amber", "--rf-on-amber", "--rf-on-navy", "--rf-on-navy-2", "--rf-on-navy-3", "--rf-radius-sm", "--rf-radius", "--rf-radius-lg", "--rf-blue-hover", "--rf-link", "--rf-teal", "--rf-sidebar-text-active"])
    const missing = [...light].filter((t) => !dark.has(t) && !same.has(t))
    expect(missing).toEqual([])
  })
})

describe("sidebar layout", () => {
  it("renders groups, marks the current page, and has an accessible menu button", async () => {
    const { createElement } = await import("react")
    const { renderToStaticMarkup } = await import("react-dom/server")
    const { SidebarLayout } = await import("@/components/refresh/sidebar-layout")
    const html = renderToStaticMarkup(
      createElement(SidebarLayout, {
        label: "Dashboard",
        primaryAction: { href: "/onboarding", label: "New campaign" },
        groups: [
          { items: [{ href: "/dashboard", label: "My flyers", match: "/dashboard/flyers" }, { href: "/dashboard/leads", label: "Leads" }] },
          { heading: "Account", items: [{ href: "/profile", label: "Settings" }] },
        ],
        children: createElement("p", null, "content"),
      }),
    )
    expect(html).toContain('<nav aria-label="Dashboard"')
    const tag = (href: string) => [...html.matchAll(/<a\b[^>]*>/g)].map((m) => m[0]).find((t) => t.includes(`href="${href}"`))!
    expect(tag("/dashboard/leads")).toContain('aria-current="page"')
    expect(tag("/dashboard")).not.toContain("aria-current")
    expect(html).toContain("Account")
    expect(html).toContain('aria-controls="rf-sidebar"')
    expect(html).toContain('aria-expanded="false"')
    expect(html).toContain("+ New campaign")
    expect(html).toContain("<main")
  })
})
