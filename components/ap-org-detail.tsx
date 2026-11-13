"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { ApOrgForm, saveOrg } from "@/components/ap-org-form"
import { ORG_STATUSES, type ApAgent, type ApOrg, type ApOrgLogEntry } from "@/lib/ap/types"

export function ApOrgDetail({ initialOrg, initialAgents, log, signupLink }: { initialOrg: ApOrg; initialAgents: ApAgent[]; log: ApOrgLogEntry[]; signupLink: string }) {
  const [org, setOrg] = useState(initialOrg)
  const [agents, setAgents] = useState(initialAgents)
  const [msg, setMsg] = useState<string | null>(null)
  const base = `/api/admin/organizations/${org.id}`

  async function setStatus(status: string) {
    const res = await fetch(`${base}/status`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) })
    const data = await res.json()
    if (res.ok) setOrg(data.org)
    setMsg(res.ok ? `Status: ${data.org.status}` : `Status not changed: ${data.error}`)
  }

  async function upload(kind: "logo" | "reference", file: File) {
    const fd = new FormData()
    fd.set("kind", kind)
    fd.set("file", file)
    const res = await fetch(`${base}/files`, { method: "POST", body: fd })
    const data = await res.json()
    if (res.ok) setOrg(data.org)
    setMsg(res.ok ? `Uploaded ${data.file.name}` : `Upload refused: ${data.message ?? data.error}`)
  }

  async function removeFile(fileId: string) {
    const res = await fetch(`${base}/files?fileId=${encodeURIComponent(fileId)}`, { method: "DELETE" })
    const data = await res.json()
    if (res.ok) setOrg(data.org)
  }

  async function patchAgent(agentId: string, change: Record<string, string>) {
    const res = await fetch(`${base}/agents/${agentId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(change) })
    const data = await res.json()
    if (res.ok) setAgents(agents.map((a) => (a.agentId === agentId ? data.agent : a)))
  }

  return (
    <div className="space-y-10" data-testid="ap-org-detail" data-org-id={org.id}>
      <div>
        <h1 className="text-2xl font-semibold">{org.name}</h1>
        <p className="text-sm text-muted-foreground">Sign-up link: <code className="break-all">{signupLink}&lt;Agent ID&gt;</code></p>
        {msg && <p className="mt-2 text-sm" role="status">{msg}</p>}
      </div>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Status</h2>
        <div className="flex flex-wrap gap-2">
          {ORG_STATUSES.map((s) => (
            <Button key={s} size="sm" variant={org.status === s ? "default" : "outline"} onClick={() => setStatus(s)} aria-pressed={org.status === s}>{s}</Button>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Configuration</h2>
        <ApOrgForm initial={org} submitLabel="Save configuration" onSubmit={async (c) => {
          const out = await saveOrg(base, "PATCH", c)
          if (!out.ok) return out
          setOrg(out.org)
          return null
        }} />
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Files</h2>
        <p className="text-sm text-muted-foreground">Logo: PNG or JPEG, up to 1 MB. Reference files: PDF, PNG or JPEG, up to 4 MB. Stored privately under ap/ in the non-production store.</p>
        <div className="flex flex-wrap gap-6">
          <label className="text-sm">Logo <input type="file" name="logo" accept="image/png,image/jpeg" onChange={(e) => e.target.files?.[0] && upload("logo", e.target.files[0])} /></label>
          <label className="text-sm">Reference file <input type="file" name="reference" accept="application/pdf,image/png,image/jpeg" onChange={(e) => e.target.files?.[0] && upload("reference", e.target.files[0])} /></label>
        </div>
        <ul className="text-sm" data-testid="ap-files">
          {org.logo && <li>Logo: <a className="underline" href={`${base}/files/${org.logo.id}`} target="_blank">{org.logo.name}</a> ({Math.round(org.logo.size / 1024)} KB) <Button variant="ghost" size="sm" onClick={() => removeFile(org.logo!.id)}>Remove</Button></li>}
          {org.referenceFiles.map((f) => (
            <li key={f.id}><a className="underline" href={`${base}/files/${f.id}`} target="_blank">{f.name}</a> ({Math.round(f.size / 1024)} KB) <Button variant="ghost" size="sm" onClick={() => removeFile(f.id)}>Remove</Button></li>
          ))}
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Flyers</h2>
        <p className="text-sm text-muted-foreground">Package content and flyer previews arrive with the slot design (pending approval).</p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Agents ({agents.length})</h2>
        <table className="w-full text-sm" data-testid="ap-agents-table">
          <thead><tr className="border-b text-left text-muted-foreground"><th className="py-2">Agent ID</th><th>Name</th><th>Email</th><th>Status</th><th>Tier</th><th>Recruiter</th><th /></tr></thead>
          <tbody>
            {agents.map((a) => (
              <tr key={a.agentId} className="border-b">
                <td className="py-2">{a.externalId}</td>
                <td>{a.name}</td>
                <td>{a.email}</td>
                <td>{a.status}</td>
                <td>
                  <select aria-label={`Tier for ${a.externalId}`} value={a.tier} onChange={(e) => patchAgent(a.agentId, { tier: e.target.value })} className="rounded border bg-transparent px-1">
                    <option value="basic">basic</option>
                    <option value="pro">pro</option>
                  </select>
                </td>
                <td>{a.recruiterAgentId ? agents.find((r) => r.agentId === a.recruiterAgentId)?.externalId ?? "—" : "—"}</td>
                <td className="space-x-1 text-right">
                  {a.status !== "active" && <Button size="sm" onClick={() => patchAgent(a.agentId, { status: "active" })}>{a.status === "pending" ? "Approve" : "Reactivate"}</Button>}
                  {a.status === "active" && <Button size="sm" variant="outline" onClick={() => patchAgent(a.agentId, { status: "suspended" })}>Suspend</Button>}
                </td>
              </tr>
            ))}
            {agents.length === 0 && <tr><td colSpan={7} className="py-4 text-muted-foreground">No agents yet.</td></tr>}
          </tbody>
        </table>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Change log</h2>
        <ul className="text-xs text-muted-foreground">
          {log.map((l, i) => <li key={i}>{l.at.replace("T", " ").slice(0, 19)} · {l.by} · {l.action}{l.detail ? ` · ${l.detail}` : ""}</li>)}
        </ul>
      </section>
    </div>
  )
}
