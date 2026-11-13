"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { ApOrg } from "@/lib/ap/types"

// The editable org config, for create and edit. The server re-checks every
// field (lib/ap/validate.ts checkOrgConfig) and answers with the field name.

export type OrgConfig = Pick<ApOrg, "name" | "slug" | "orgCode" | "enrollment" | "agentIdParam" | "languages" | "footer" | "tierRules">

export const EMPTY_CONFIG: OrgConfig = {
  name: "",
  slug: "",
  orgCode: "",
  enrollment: { forwardTemplate: "", printed: "full", printedTemplate: null, programUrl: "" },
  agentIdParam: "agent_ID",
  languages: ["en"],
  footer: { programLine: "", taglineLine: "Sign in or enroll online" },
  tierRules: { defaultTier: "basic", signupApproval: "admin" },
}

export function pickConfig(o: OrgConfig): OrgConfig {
  return { name: o.name, slug: o.slug, orgCode: o.orgCode, enrollment: o.enrollment, agentIdParam: o.agentIdParam, languages: o.languages, footer: o.footer, tierRules: o.tierRules }
}

export function ApOrgForm({ initial, submitLabel, onSubmit }: { initial: OrgConfig; submitLabel: string; onSubmit: (c: OrgConfig) => Promise<{ field?: string; message?: string } | { saved: OrgConfig } | null> }) {
  const [c, setC] = useState<OrgConfig>(initial)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<{ field?: string; message?: string } | null>(null)
  const [saved, setSaved] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setSaved(false)
    const out = await onSubmit(c).finally(() => setBusy(false))
    if (out && "saved" in out) {
      // Show back exactly what was stored (URLs normalized: scheme added or fixed, spaces removed).
      setC(pickConfig(out.saved))
      setErr(null)
      setSaved(true)
      return
    }
    setErr(out)
    if (!out) setSaved(true)
  }

  const text = (id: string, label: string, value: string, onChange: (v: string) => void, max?: number, hint?: string) => (
    <div className="space-y-1">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} name={id} value={value} maxLength={max} onChange={(e) => onChange(e.target.value)} aria-invalid={err?.field === id} />
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      {err?.field === id && <p className="text-xs text-destructive">{err.message}</p>}
    </div>
  )

  return (
    <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2" data-testid="ap-org-form">
      {text("name", "Organization name", c.name, (v) => setC({ ...c, name: v }), 60)}
      {text("slug", "Slug (URL)", c.slug, (v) => setC({ ...c, slug: v.toLowerCase() }), 40, "Agents sign up at /ap/<slug>/join")}
      {text("orgCode", "Org code (2-6 capitals, prints in the version stamp)", c.orgCode, (v) => setC({ ...c, orgCode: v.toUpperCase() }), 6)}
      {text("enrollment.forwardTemplate", "Enrollment URL pattern", c.enrollment.forwardTemplate, (v) => setC({ ...c, enrollment: { ...c.enrollment, forwardTemplate: v } }), 300, "Paste the link as-is, with {id} where the agent's ID goes, e.g. join.example.com/?agent={id}. https:// is added for you.")}
      {text("enrollment.programUrl", "Program page (inactive agents' QR)", c.enrollment.programUrl, (v) => setC({ ...c, enrollment: { ...c.enrollment, programUrl: v } }), 300, "Paste the link as-is.")}
      <div className="space-y-1">
        <Label htmlFor="enrollment.printed">Printed address</Label>
        <select id="enrollment.printed" className="h-9 w-full rounded-md border bg-transparent px-3 text-sm" value={c.enrollment.printed} onChange={(e) => setC({ ...c, enrollment: { ...c.enrollment, printed: e.target.value as OrgConfig["enrollment"]["printed"], printedTemplate: e.target.value === "short" ? c.enrollment.printedTemplate ?? "" : null } })}>
          <option value="full">Full enrollment URL</option>
          <option value="short">Short address (template)</option>
          <option value="code">Agent&apos;s QR link</option>
        </select>
      </div>
      {c.enrollment.printed === "short" ? text("enrollment.printedTemplate", "Short printed address", c.enrollment.printedTemplate ?? "", (v) => setC({ ...c, enrollment: { ...c.enrollment, printedTemplate: v } }), 300, "As printed, ending in {id}, e.g. join.example.com/{id} (a pasted https:// is removed)") : <div />}
      {text("agentIdParam", "Agent ID parameter on the sign-up link", c.agentIdParam, (v) => setC({ ...c, agentIdParam: v }), 32)}
      <fieldset className="space-y-1">
        <legend className="text-sm font-medium">Languages</legend>
        {(["en", "es"] as const).map((l) => (
          <label key={l} className="mr-4 inline-flex items-center gap-2 text-sm">
            <input type="checkbox" name={`lang-${l}`} checked={c.languages.includes(l)} onChange={(e) => setC({ ...c, languages: e.target.checked ? (["en", "es"] as const).filter((x) => x === l || c.languages.includes(x)) : c.languages.filter((x) => x !== l) })} />
            {l === "en" ? "English" : "Spanish"}
          </label>
        ))}
        {err?.field === "languages" && <p className="text-xs text-destructive">{err.message}</p>}
      </fieldset>
      {text("footer.programLine", "Flyer footer: program line", c.footer.programLine, (v) => setC({ ...c, footer: { ...c.footer, programLine: v } }), 40)}
      {text("footer.taglineLine", "Flyer footer: second line", c.footer.taglineLine, (v) => setC({ ...c, footer: { ...c.footer, taglineLine: v } }), 40)}
      <div className="space-y-1">
        <Label htmlFor="tierRules.defaultTier">New agents start on</Label>
        <select id="tierRules.defaultTier" className="h-9 w-full rounded-md border bg-transparent px-3 text-sm" value={c.tierRules.defaultTier} onChange={(e) => setC({ ...c, tierRules: { ...c.tierRules, defaultTier: e.target.value as "basic" | "pro" } })}>
          <option value="basic">Basic</option>
          <option value="pro">Pro</option>
        </select>
      </div>
      <div className="space-y-1">
        <Label htmlFor="tierRules.signupApproval">Sign-up approval</Label>
        <select id="tierRules.signupApproval" className="h-9 w-full rounded-md border bg-transparent px-3 text-sm" value={c.tierRules.signupApproval} onChange={(e) => setC({ ...c, tierRules: { ...c.tierRules, signupApproval: e.target.value as "auto" | "admin" } })}>
          <option value="admin">An admin approves each sign-up (default, safer)</option>
          <option value="auto">Active as soon as the email is verified</option>
        </select>
        <p className="text-xs text-muted-foreground" data-testid="signup-approval-hint">
          {c.tierRules.signupApproval === "admin" ? "New agents wait in the Agents table until an admin clicks Approve." : "Anyone with the sign-up link and a working email becomes an active agent at once."}
        </p>
      </div>
      <div className="sm:col-span-2 flex items-center gap-3">
        <Button type="submit" disabled={busy}>{submitLabel}</Button>
        {saved && <span className="text-sm text-muted-foreground" role="status">Saved.</span>}
        {err && !err.field && <span className="text-sm text-destructive" role="alert">{err.message ?? "Couldn't save."}</span>}
        {err?.field && !["name", "slug", "languages"].includes(err.field) && !err.field.includes(".") && err.field !== "agentIdParam" && <span className="text-sm text-destructive">{err.field}: {err.message}</span>}
      </div>
    </form>
  )
}

export async function saveOrg(url: string, method: "POST" | "PATCH", c: OrgConfig): Promise<{ ok: true; org: ApOrg } | { ok: false; field?: string; message?: string }> {
  const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(c) })
  const data = await res.json().catch(() => ({}))
  return res.ok ? { ok: true, org: data.org } : { ok: false, field: data.field, message: data.message ?? data.error }
}
