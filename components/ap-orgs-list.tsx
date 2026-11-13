"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { ApOrgForm, EMPTY_CONFIG, saveOrg } from "@/components/ap-org-form"
import type { ApOrg } from "@/lib/ap/types"

export function ApOrgsList({ orgs }: { orgs: ApOrg[] }) {
  const router = useRouter()
  const [creating, setCreating] = useState(false)
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Organizations</h1>
        <Button onClick={() => setCreating(!creating)} variant={creating ? "outline" : "default"}>{creating ? "Cancel" : "New organization"}</Button>
      </div>
      {creating && (
        <div className="rounded-md border p-4">
          <ApOrgForm initial={EMPTY_CONFIG} submitLabel="Create organization" onSubmit={async (c) => {
            const out = await saveOrg("/api/admin/organizations", "POST", c)
            if (!out.ok) return out
            router.push(`/admin/organizations/${out.org.id}`)
            return null
          }} />
        </div>
      )}
      <table className="w-full text-sm" data-testid="ap-orgs-table">
        <thead><tr className="border-b text-left text-muted-foreground"><th className="py-2">Name</th><th>Slug</th><th>Status</th><th>Updated</th></tr></thead>
        <tbody>
          {orgs.map((o) => (
            <tr key={o.id} className="border-b">
              <td className="py-2"><Link className="underline" href={`/admin/organizations/${o.id}`}>{o.name}</Link></td>
              <td>{o.slug}</td>
              <td>{o.status}</td>
              <td>{o.updatedAt.slice(0, 10)}</td>
            </tr>
          ))}
          {orgs.length === 0 && <tr><td colSpan={4} className="py-4 text-muted-foreground">No organizations yet.</td></tr>}
        </tbody>
      </table>
    </div>
  )
}
